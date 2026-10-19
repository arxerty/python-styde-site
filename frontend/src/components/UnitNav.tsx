import { Link } from "react-router-dom";
import { useCourseState } from "../lib/hooks";
import { useProgress } from "../store/progress";

export function UnitNav({ unitKey }: { unitKey: string }) {
  const { units } = useCourseState();
  const index = units.findIndex((u) => u.key === unitKey);
  if (index < 0) return null;
  const prev = units[index - 1];
  let nextIndex = index + 1;
  // этапы проекта — одна страница, пропускаем соседние этапы
  while (units[nextIndex] && units[index].kind === "stage" && units[nextIndex].kind === "stage") nextIndex++;
  const next = units[nextIndex];
  return (
    <nav className="unit-nav">
      {prev ? (
        <Link to={prev.path} className="btn btn-ghost">
          ← {prev.title}
        </Link>
      ) : (
        <span />
      )}
      {next && (
        <Link to={next.path} className="btn btn-primary">
          {next.title} →
        </Link>
      )}
    </nav>
  );
}

export function LockedNotice() {
  const setFreeMode = useProgress((s) => s.setFreeMode);
  return (
    <div className="locked">
      <div className="locked-icon">🔒</div>
      <h2>Этот шаг пока заблокирован</h2>
      <p>Курс проходится последовательно: завершите предыдущий урок или практикум, чтобы открыть этот.</p>
      <button className="btn btn-ghost" onClick={() => setFreeMode(true)}>
        Всё равно открыть все уроки
      </button>
    </div>
  );
}

export function Loading({ text = "Загрузка…" }: { text?: string }) {
  return <div className="page-loading">{text}</div>;
}

export function ErrorBox({ message }: { message: string }) {
  return <div className="error-box">⚠ {message}</div>;
}
