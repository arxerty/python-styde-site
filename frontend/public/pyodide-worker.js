/* Web Worker: выполняет Python в браузере через Pyodide.
 * Протокол сообщений:
 *   → { id, kind: "init" | "run" | "test", payload, assets: [{ url, path }] }
 *   ← { id, type: "status", status: "loading" | "packages" | "running" }
 *   ← { id, type: "result", result }
 * Зависание (бесконечный цикл) обрабатывает главный поток: он завершает воркер по таймауту.
 */
/* global loadPyodide */
const PYODIDE_VERSION = "0.26.4";
const INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
importScripts(`${INDEX_URL}pyodide.js`);

const PACKAGE_ALIASES = {
  sklearn: "scikit-learn",
  yaml: "pyyaml",
  PIL: "pillow",
  bs4: "beautifulsoup4",
  dotenv: "python-dotenv",
  pydantic_settings: "pydantic-settings",
};

let pyodidePromise = null;
const loadedAssets = new Set();
const failedPackages = new Set();

async function init() {
  const pyodide = await loadPyodide({ indexURL: INDEX_URL });
  const source = await (await fetch("/py/runner.py")).text();
  pyodide.FS.writeFile("/home/pyodide/_runner.py", source);
  pyodide.runPython(
    "import sys, os\nsys.path.insert(0, '/home/pyodide')\nos.environ['MPLBACKEND'] = 'agg'\nimport _runner"
  );
  await pyodide.loadPackage("micropip");
  return pyodide;
}

async function ensurePackages(pyodide, code) {
  try {
    await pyodide.loadPackagesFromImports(code);
  } catch (error) {
    /* ошибка импорта всплывёт при выполнении с понятным сообщением */
  }
  let imports = [];
  try {
    imports = pyodide.pyimport("pyodide.code").find_imports(code).toJs();
  } catch (error) {
    return; // синтаксическая ошибка — её покажет раннер
  }
  const util = pyodide.pyimport("importlib.util");
  const micropip = pyodide.pyimport("micropip");
  for (const name of imports) {
    if (failedPackages.has(name)) continue;
    if (util.find_spec(name) !== undefined && util.find_spec(name) !== null) continue;
    try {
      await micropip.install(PACKAGE_ALIASES[name] || name);
    } catch (error) {
      failedPackages.add(name);
    }
  }
}

async function loadAssets(pyodide, assets) {
  for (const asset of assets || []) {
    if (loadedAssets.has(asset.url)) continue;
    const response = await fetch(asset.url);
    if (!response.ok) throw new Error(`Не удалось загрузить файл ${asset.path}`);
    const data = new Uint8Array(await response.arrayBuffer());
    const dir = asset.path.split("/").slice(0, -1).join("/");
    if (dir) pyodide.FS.mkdirTree(dir);
    pyodide.FS.writeFile(asset.path, data);
    loadedAssets.add(asset.url);
  }
}

function collectCode(payload) {
  const parts = [payload.code || "", payload.setup || ""];
  for (const test of payload.tests || []) {
    parts.push(test.code || "", test.call || "", test.expected || "");
  }
  return parts.join("\n");
}

self.onmessage = async (event) => {
  const { id, kind, payload, assets } = event.data;
  try {
    if (!pyodidePromise) {
      self.postMessage({ id, type: "status", status: "loading" });
      pyodidePromise = init();
    }
    const pyodide = await pyodidePromise;
    if (kind === "init") {
      self.postMessage({ id, type: "result", result: { ready: true } });
      return;
    }
    self.postMessage({ id, type: "status", status: "packages" });
    await ensurePackages(pyodide, collectCode(payload));
    await loadAssets(pyodide, assets);
    self.postMessage({ id, type: "status", status: "running" });
    const handle = pyodide.globals.get("_runner").handle;
    const raw = handle(kind, JSON.stringify(payload));
    self.postMessage({ id, type: "result", result: JSON.parse(raw) });
  } catch (error) {
    self.postMessage({
      id,
      type: "result",
      result: { error: `Сбой среды выполнения: ${error}`, stdout: "", images: [], passed: false, results: [] },
    });
  }
};
