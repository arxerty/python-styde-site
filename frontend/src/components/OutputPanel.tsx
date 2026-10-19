import type { RunResult } from "../types";

export function OutputPanel({ result }: { result: RunResult }) {
  const empty = !result.stdout && !result.error && result.images.length === 0;
  return (
    <div className="output">
      <div className="output-title">Вывод</div>
      {empty && <pre className="output-text muted">(программа ничего не вывела)</pre>}
      {result.stdout && <pre className="output-text">{result.stdout}</pre>}
      {result.error && <pre className="output-text output-error">{result.error}</pre>}
      {result.images.map((image, index) => (
        <img key={index} className="output-image" src={`data:image/png;base64,${image}`} alt={`График ${index + 1}`} />
      ))}
    </div>
  );
}

export function RunnerStatusLabel({ status }: { status: string }) {
  const labels: Record<string, string> = {
    loading: "Загрузка Python в браузер (первый раз ~10 сек)…",
    packages: "Загрузка библиотек…",
    running: "Выполнение…",
  };
  return labels[status] ? <span className="runner-status">{labels[status]}</span> : null;
}
