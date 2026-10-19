import { Link } from "react-router-dom";
import { ProgressBar } from "../components/ProgressBar";
import { Loading } from "../components/UnitNav";
import { useCourseState } from "../lib/hooks";
import { aggregate } from "../lib/progress";
import { useCourse } from "../store/course";

const RUNTIME_LABEL = {
  browser: "в браузере",
  local: "локально / Colab",
  mixed: "браузер + локально",
};

export function HomePage() {
  const { course, units, statuses, items } = useCourseState();
  const loadError = useCourse((s) => s.error);
  if (loadError) return <div className="error-box">Не удалось загрузить курс: {loadError}. Запущен ли бэкенд?</div>;
  if (!course) return <Loading />;

  const required = units.filter((u) => !u.optional);
  const optionalBefore = (index: number) => course.parts.slice(0, index).filter((p) => p.optional).length;
  const total = aggregate(required, items);
  const next =
    required.find((u) => statuses.get(u.key) === "progress") ?? required.find((u) => statuses.get(u.key) === "available");

  return (
    <div className="page home">
      <section className="hero">
        <h1>Python → AI Engineer</h1>
        <p>
          От первой строки кода до собственного AI-сервиса в продакшне. Теория, вопросы с разбором и задачи с
          автоматической проверкой прямо в браузере.
        </p>
        <div className="hero-progress">
          <ProgressBar value={total.percent} />
          <span>
            Пройдено {total.percent}% · {total.done} из {total.total} заданий
          </span>
        </div>
        {next && (
          <Link to={next.path} className="btn btn-primary btn-large">
            {total.done ? "Продолжить" : "Начать"}: {next.title} →
          </Link>
        )}
      </section>

      {course.errors.length > 0 && (
        <details className="content-errors">
          <summary>⚠ Ошибки в файлах контента: {course.errors.length}</summary>
          <ul>
            {course.errors.map((e, i) => (
              <li key={i}>
                <code>{e}</code>
              </li>
            ))}
          </ul>
        </details>
      )}

      {course.parts.length === 0 && <p className="muted">Контент ещё не добавлен. Положите папки блоков в content/.</p>}

      <div className="parts">
        {course.parts.map((part, index) => {
          const partUnits = units.filter((u) => u.part === part.id);
          const progress = aggregate(partUnits, items);
          return (
            <section className="part-card" key={part.id}>
              <header>
                <span className="muted small">
                  {part.optional ? "Необязательно" : `Часть ${index + 1 - optionalBefore(index)}`} · {RUNTIME_LABEL[part.runtime]}
                </span>
                <h2>{part.title}</h2>
                {part.description && <p className="muted">{part.description}</p>}
                <ProgressBar value={progress.percent} />
              </header>
              <ol className="block-list">
                {part.blocks.map((block) => {
                  const blockUnits = partUnits.filter((u) => u.block === block.id);
                  const blockProgress = aggregate(blockUnits, items);
                  const first = blockUnits[0];
                  const locked = first && statuses.get(first.key) === "locked";
                  return (
                    <li key={block.id} className={locked ? "is-locked" : ""}>
                      <Link to={first?.path ?? "#"}>
                        <span className="block-title">
                          {locked ? "🔒 " : ""}
                          {block.title}
                        </span>
                        <span className="block-meta muted small">
                          {block.lessons.length} уроков{block.mini_project ? ` · мини-проект: ${block.mini_project}` : ""}
                        </span>
                      </Link>
                      <span className="block-percent">{blockProgress.percent}%</span>
                    </li>
                  );
                })}
                {part.project && (
                  <li className="project-row">
                    <Link to={`/learn/${part.id}/project`}>
                      <span className="block-title">🚀 Проект: {part.project.title}</span>
                      <span className="block-meta muted small">{part.project.stages.length} этапов</span>
                    </Link>
                  </li>
                )}
              </ol>
            </section>
          );
        })}
      </div>
    </div>
  );
}
