import { useState } from "react";
import { downloadUrl } from "../api";
import { useProgress } from "../store/progress";
import type { Task } from "../types";
import { Markdown } from "./Markdown";
import { Examples, Hints, SOLUTION_AFTER_ATTEMPTS, TaskHeader } from "./TaskCard";

interface Props {
  task: Task;
  itemKey: string;
  index: number;
  part: string;
  block: string;
  scope: string;
}

/** Разбор вывода pytest: «5 passed in 0.1s» без failed/error. */
export function analyzePytestOutput(output: string): { ok: boolean; message: string } {
  const text = output.toLowerCase();
  const passed = text.match(/(\d+)\s+passed/);
  const failed = text.match(/(\d+)\s+failed/);
  const errors = text.match(/(\d+)\s+errors?\b/);
  if (!passed) return { ok: false, message: "Не нашли в выводе строку вида «N passed». Вставьте вывод pytest целиком." };
  if (failed || errors) {
    return { ok: false, message: `Есть упавшие тесты (${failed?.[0] ?? ""} ${errors?.[0] ?? ""}). Исправьте код и запустите снова.` };
  }
  return { ok: true, message: `Отлично: ${passed[0]}.` };
}

function languageOf(path: string) {
  if (path.endsWith(".py")) return "python";
  if (path.endsWith(".toml")) return "toml";
  if (path.endsWith(".yml") || path.endsWith(".yaml")) return "yaml";
  if (path.endsWith(".json")) return "json";
  if (path.endsWith(".md")) return "markdown";
  if (path.toLowerCase().includes("dockerfile")) return "dockerfile";
  return "text";
}

export function FileViewer({ files }: { files: Record<string, string> }) {
  const names = Object.keys(files);
  const [active, setActive] = useState(names[0]);
  if (!names.length) return null;
  return (
    <div className="file-viewer">
      <div className="file-tabs">
        {names.map((name) => (
          <button key={name} className={name === active ? "is-active" : ""} onClick={() => setActive(name)}>
            {name}
          </button>
        ))}
      </div>
      <Markdown>{"```" + languageOf(active) + "\n" + (files[active] ?? "").replace(/\n$/, "") + "\n```"}</Markdown>
    </div>
  );
}

export function LocalTaskCard({ task, itemKey, index, part, block, scope }: Props) {
  const state = useProgress((s) => s.items[itemKey]);
  const update = useProgress((s) => s.update);
  const [output, setOutput] = useState(state?.output ?? "");
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [showSolution, setShowSolution] = useState(false);
  const done = state?.status === "done";
  const attempts = state?.attempts ?? 0;
  const solutionAvailable = done || attempts >= SOLUTION_AFTER_ATTEMPTS;

  function submit() {
    const result = analyzePytestOutput(output);
    setFeedback(result);
    update(itemKey, {
      status: result.ok ? "done" : done ? "done" : "failed",
      attempts: result.ok ? attempts : attempts + 1,
      output,
      mistake: !result.ok && !done,
    });
  }

  const solutionFiles = Object.keys(task.solution_files).length
    ? task.solution_files
    : { "solution.py": task.solution };

  return (
    <article className={`card task ${done ? "is-correct" : ""}`} id={`t-${task.id}`}>
      <TaskHeader task={task} index={index} status={state?.status} />
      <Markdown>{task.statement}</Markdown>
      <Examples task={task} />

      <div className="local-steps">
        <div className="local-step">
          <b>1.</b> Скачайте заготовку с тестами:{" "}
          <a className="btn btn-primary btn-small" href={downloadUrl(part, block, scope, task.id)}>
            ⬇ Скачать ZIP
          </a>
        </div>
        <div className="local-step">
          <b>2.</b> Распакуйте, допишите код и запустите в папке задания:
          <pre>{task.run}</pre>
        </div>
        <div className="local-step">
          <b>3.</b> Вставьте вывод тестов и отметьте выполнение:
        </div>
      </div>

      <details className="files-details">
        <summary>Файлы заготовки ({Object.keys(task.files).length})</summary>
        <FileViewer files={task.files} />
      </details>

      <textarea
        className="pytest-output"
        rows={5}
        value={output}
        onChange={(e) => setOutput(e.target.value)}
        placeholder="===== 6 passed in 0.12s ====="
      />
      <div className="card-actions">
        <button className="btn btn-primary" onClick={submit} disabled={!output.trim()}>
          ✔ Отметить выполненным
        </button>
        {feedback && <span className={feedback.ok ? "good" : "bad"}>{feedback.message}</span>}
      </div>

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
            Эталон откроется после выполнения или {SOLUTION_AFTER_ATTEMPTS} неудачных отметок (сейчас: {attempts})
          </span>
        )}
        {showSolution && solutionAvailable && (
          <div className="solution">
            <FileViewer files={solutionFiles} />
            <Markdown>{task.solution_explanation}</Markdown>
          </div>
        )}
      </div>
    </article>
  );
}
