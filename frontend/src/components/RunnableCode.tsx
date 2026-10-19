import { useState, type ReactNode } from "react";
import { python, useRunnerStatus } from "../python/runner";
import type { RunResult } from "../types";
import { CodeEditor } from "./CodeEditor";
import { OutputPanel, RunnerStatusLabel } from "./OutputPanel";

/** Пример кода в теории: подсветка + «Запустить» + возможность отредактировать. */
export function RunnableCode({ code, children }: { code: string; children: ReactNode }) {
  const [editing, setEditing] = useState(false);
  const [source, setSource] = useState(code);
  const [stdin, setStdin] = useState("");
  const [result, setResult] = useState<RunResult | null>(null);
  const [busy, setBusy] = useState(false);
  const status = useRunnerStatus((s) => s.status);
  const needsInput = /\binput\s*\(/.test(source);

  async function run() {
    setBusy(true);
    setResult(await python.run(source, { stdin }));
    setBusy(false);
  }

  return (
    <div className="runnable">
      {editing ? <CodeEditor value={source} onChange={setSource} onRun={run} /> : <pre>{children}</pre>}
      {needsInput && (
        <label className="stdin-field">
          <span>Ввод для input() — каждая строка отдельно:</span>
          <textarea value={stdin} onChange={(e) => setStdin(e.target.value)} rows={2} placeholder="например: 42" />
        </label>
      )}
      <div className="runnable-bar">
        <button className="btn btn-primary btn-small" onClick={run} disabled={busy}>
          ▶ Запустить
        </button>
        <button className="btn btn-ghost btn-small" onClick={() => setEditing((v) => !v)}>
          {editing ? "Свернуть редактор" : "✎ Изменить"}
        </button>
        {editing && source !== code && (
          <button className="btn btn-ghost btn-small" onClick={() => setSource(code)}>
            Вернуть исходный
          </button>
        )}
        {busy && <RunnerStatusLabel status={status} />}
      </div>
      {result && <OutputPanel result={result} />}
    </div>
  );
}
