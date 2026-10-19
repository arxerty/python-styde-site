import { useState } from "react";
import { assetUrl } from "../api";
import { python, useRunnerStatus } from "../python/runner";
import { useProgress } from "../store/progress";
import type { CheckResult, RunResult, Task } from "../types";
import { CodeEditor } from "./CodeEditor";
import { Markdown } from "./Markdown";
import { OutputPanel, RunnerStatusLabel } from "./OutputPanel";
import { LocalTaskCard } from "./LocalTaskCard";

const DIFFICULTY = ["", "Простая", "Средняя", "Сложная"];
export const SOLUTION_AFTER_ATTEMPTS = 3;

interface Props {
  task: Task;
  itemKey: string;
  index: number;
  part: string;
  block: string; // id блока или "project" — для путей к файлам
  scope: string;
}

export function TaskCard(props: Props) {
  if (props.task.mode === "local") return <LocalTaskCard {...props} />;
  return <BrowserTaskCard {...props} />;
}

export function TaskHeader({ task, index, status }: { task: Task; index: number; status?: string }) {
  return (
    <header className="card-head">
      <span className="card-index">
        {task.mini_project ? "Мини-проект" : `Задача ${index + 1}`} · {task.title}
      </span>
      <span className={`tag diff-${task.difficulty}`}>{DIFFICULTY[task.difficulty]}</span>
      {task.mode === "local" && <span className="tag">локально</span>}
      {status === "passed" || status === "done" ? <span className="tag tag-good">✓ решено</span> : null}
    </header>
  );
}

export function Examples({ task }: { task: Task }) {
  if (!task.examples.length) return null;
  return (
    <div className="examples">
      <div className="examples-title">Примеры</div>
      {task.examples.map((example, i) => (
        <div className="example" key={i}>
          <div>
            <span className="muted small">Вход</span>
            <pre>{example.input}</pre>
          </div>
          <div>
            <span className="muted small">Результат</span>
            <pre>{example.output}</pre>
          </div>
          {example.explanation && <div className="example-note">{example.explanation}</div>}
        </div>
      ))}
    </div>
  );
}

export function Hints({ hints }: { hints: string[] }) {
  const [shown, setShown] = useState(0);
  if (!hints.length) return null;
  return (
    <div className="hints">
      {hints.slice(0, shown).map((hint, i) => (
        <div className="hint" key={i}>
          <strong>Подсказка {i + 1}.</strong> <Markdown>{hint}</Markdown>
        </div>
      ))}
      {shown < hints.length && (
        <button className="btn btn-ghost btn-small" onClick={() => setShown(shown + 1)}>
          💡 Подсказка {shown + 1} из {hints.length}
        </button>
      )}
    </div>
  );
}

function BrowserTaskCard({ task, itemKey, index, part, block }: Props) {
  const state = useProgress((s) => s.items[itemKey]);
  const update = useProgress((s) => s.update);
  const status = useRunnerStatus((s) => s.status);
  const [code, setCode] = useState(state?.code ?? task.starter);
  const [stdin, setStdin] = useState("");
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [check, setCheck] = useState<CheckResult | null>(null);
  const [busy, setBusy] = useState<"run" | "check" | null>(null);
  const [progress, setProgress] = useState(0);
  const [showSolution, setShowSolution] = useState(false);

  const passed = state?.status === "passed";
  const attempts = state?.attempts ?? 0;
  const solutionAvailable = passed || attempts >= SOLUTION_AFTER_ATTEMPTS;
  const needsInput = /\binput\s*\(/.test(code);
  const assets = task.assets.map((path) => ({ url: assetUrl(part, block, path), path }));

  async function run() {
    setBusy("run");
    setCheck(null);
    setRunResult(
      await python.run(code, { stdin, timeout: task.timeout, files: task.files, setup: task.setup, assets }),
    );
    setBusy(null);
  }

  async function verify() {
    setBusy("check");
    setRunResult(null);
    setProgress(0);
    const result = await python.test(task, code, assets, setProgress);
    setCheck(result);
    setBusy(null);
    update(itemKey, {
      status: result.passed ? "passed" : passed ? "passed" : "failed",
      attempts: result.passed ? attempts : attempts + 1,
      code,
      mistake: !result.passed && !passed,
    });
  }

  function reset() {
    if (code !== task.starter && !window.confirm("Вернуть заготовку? Текущий код будет потерян.")) return;
    setCode(task.starter);
    setCheck(null);
    setRunResult(null);
  }

  const passedCount = check?.results.filter((r) => r.passed).length ?? 0;

  return (
    <article className={`card task ${passed ? "is-correct" : ""}`} id={`t-${task.id}`}>
      <TaskHeader task={task} index={index} status={state?.status} />
      <Markdown>{task.statement}</Markdown>
      <Examples task={task} />
      {task.constraints && (task.constraints.forbid.length > 0 || task.constraints.require.length > 0) && (
        <div className="constraints">
          {task.constraints.forbid.length > 0 && (
            <div>
              Нельзя использовать: {task.constraints.forbid.map((f) => <code key={f}>{f}</code>)}
            </div>
          )}
          {task.constraints.require.length > 0 && (
            <div>
              Обязательно использовать: {task.constraints.require.map((f) => <code key={f}>{f}</code>)}
            </div>
          )}
          {task.constraints.message && <div className="muted small">{task.constraints.message}</div>}
        </div>
      )}

      <CodeEditor value={code} onChange={setCode} onRun={run} />
      {needsInput && (
        <label className="stdin-field">
          <span>Ввод для «Запустить» (каждая строка — отдельный input()):</span>
          <textarea value={stdin} onChange={(e) => setStdin(e.target.value)} rows={2} />
        </label>
      )}
      <div className="card-actions">
        <button className="btn btn-ghost" onClick={run} disabled={!!busy} title="Ctrl+Enter">
          ▶ Запустить
        </button>
        <button className="btn btn-primary" onClick={verify} disabled={!!busy}>
          ✔ Проверить
        </button>
        <button className="btn btn-ghost btn-small" onClick={reset} disabled={!!busy}>
          ↺ Сбросить
        </button>
        {busy && (
          <span className="runner-status">
            {busy === "check" && status === "running" ? `Тест ${Math.min(progress + 1, task.tests.length)} из ${task.tests.length}…` : null}
            {!(busy === "check" && status === "running") && <RunnerStatusLabel status={status} />}
          </span>
        )}
      </div>

      {runResult && <OutputPanel result={runResult} />}

      {check && (
        <div className={`check-report ${check.passed ? "good" : "bad"}`}>
          {check.error ? (
            <pre className="output-error">{check.error}</pre>
          ) : (
            <>
              <div className="verdict">
                {check.passed
                  ? `✓ Все тесты пройдены (${passedCount}/${check.results.length})`
                  : `✗ Пройдено тестов: ${passedCount} из ${task.tests.length}`}
              </div>
              <ul className="test-list">
                {check.results.map((result, i) => (
                  <li key={i} className={result.passed ? "good" : "bad"}>
                    <span>{result.passed ? "✓" : "✗"}</span> {result.name}
                    {!result.passed && result.message && <pre>{result.message}</pre>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <Hints hints={task.hints} />

      <div className="solution-zone">
        {solutionAvailable ? (
          <button className="btn btn-ghost btn-small" onClick={() => {
            setShowSolution((v) => !v);
            if (!state?.solutionShown) update(itemKey, { solutionShown: true });
          }}>
            {showSolution ? "Скрыть решение" : "📖 Эталонное решение и разбор"}
          </button>
        ) : (
          <span className="muted small">
            Эталонное решение откроется после решения задачи или {SOLUTION_AFTER_ATTEMPTS} попыток (сейчас: {attempts})
          </span>
        )}
        {showSolution && solutionAvailable && (
          <div className="solution">
            <Markdown>{"```python\n" + task.solution.replace(/\n$/, "") + "\n```"}</Markdown>
            <Markdown>{task.solution_explanation}</Markdown>
          </div>
        )}
      </div>
    </article>
  );
}
