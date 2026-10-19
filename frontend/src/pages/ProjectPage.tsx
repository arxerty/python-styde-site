import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { api } from "../api";
import { Markdown } from "../components/Markdown";
import { ProgressBar } from "../components/ProgressBar";
import { STATUS_ICON } from "../components/Sidebar";
import { Hints, TaskCard } from "../components/TaskCard";
import { ErrorBox, Loading, LockedNotice, UnitNav } from "../components/UnitNav";
import { useCourseState, useRuntime } from "../lib/hooks";
import { aggregate, itemKey } from "../lib/progress";
import { useProgress } from "../store/progress";
import type { Project, Stage } from "../types";

function Criteria({ stage, unitKey }: { stage: Stage; unitKey: string }) {
  const key = itemKey(unitKey, "check");
  const state = useProgress((s) => s.items[key]);
  const update = useProgress((s) => s.update);
  const checks = state?.checks ?? stage.criteria.map(() => false);

  function toggle(index: number) {
    const next = stage.criteria.map((_, i) => (i === index ? !checks[i] : !!checks[i]));
    update(key, { checks: next, status: next.every(Boolean) ? "done" : "failed", attempts: 0 });
  }

  return (
    <div className="criteria">
      <h4>Чек-лист самопроверки</h4>
      {stage.criteria.map((criterion, i) => (
        <label key={i} className="criterion">
          <input type="checkbox" checked={!!checks[i]} onChange={() => toggle(i)} />
          <Markdown>{criterion}</Markdown>
        </label>
      ))}
    </div>
  );
}

export function ProjectPage() {
  const { part = "" } = useParams();
  const location = useLocation();
  const [data, setData] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSolution, setShowSolution] = useState(false);
  const { course, units, statuses, items } = useCourseState();
  const runtime = useRuntime(part);

  useEffect(() => {
    setData(null);
    api.project(part).then(setData).catch((e: Error) => setError(e.message));
  }, [part]);

  useEffect(() => {
    if (data && location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
  }, [data, location.hash]);

  if (error) return <ErrorBox message={error} />;
  if (!data || !course) return <Loading />;

  const stageUnits = units.filter((u) => u.part === part && u.kind === "stage");
  if (stageUnits.length && statuses.get(stageUnits[0].key) === "locked") return <LockedNotice />;
  const progress = aggregate(stageUnits, items);
  const allDone = stageUnits.every((u) => statuses.get(u.key) === "done");
  const partNode = course.parts.find((p) => p.id === part);

  return (
    <div className="page project-page">
      <div className="breadcrumbs">
        <Link to="/">Курс</Link> / <span>{partNode?.title}</span>
      </div>
      <h1>🚀 {data.title}</h1>
      <div className="lesson-progress">
        <ProgressBar value={progress.percent} />
        <span className="muted small">{progress.percent}%</span>
      </div>
      <Markdown runnable={runtime !== "local"}>{data.description}</Markdown>
      {data.requirements.length > 0 && (
        <div className="requirements">
          <h3>Требования</h3>
          <ul>
            {data.requirements.map((r, i) => (
              <li key={i}>
                <Markdown>{r}</Markdown>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="stage-list">
        {data.stages.map((stage, index) => {
          const unitKey = `${part}/project/${stage.id}`;
          const status = statuses.get(unitKey) ?? "available";
          return (
            <section className={`stage stage-${status}`} id={stage.id} key={stage.id}>
              <h2>
                <span className={`status status-${status}`}>{STATUS_ICON[status]}</span> Этап {index + 1}. {stage.title}
              </h2>
              {status === "locked" ? (
                <p className="muted">Завершите предыдущий этап, чтобы открыть этот.</p>
              ) : (
                <>
                  <Markdown runnable={runtime !== "local"}>{stage.description}</Markdown>
                  <Hints hints={stage.hints} />
                  <div className="stack">
                    {stage.tasks.map((task, taskIndex) => (
                      <TaskCard key={task.id} task={task} index={taskIndex} itemKey={itemKey(unitKey, `t/${task.id}`)} part={part} block="project" scope={stage.id} />
                    ))}
                  </div>
                  {stage.criteria.length > 0 && <Criteria stage={stage} unitKey={unitKey} />}
                </>
              )}
            </section>
          );
        })}
      </div>

      {data.solution && (
        <section className="solution-zone project-solution">
          <h2>Эталонное решение</h2>
          {allDone || showSolution ? (
            <Markdown runnable={runtime !== "local"}>{data.solution}</Markdown>
          ) : (
            <button
              className="btn btn-ghost"
              onClick={() => window.confirm("Решение лучше смотреть после выполнения всех этапов. Открыть сейчас?") && setShowSolution(true)}
            >
              Открыть эталонное решение
            </button>
          )}
        </section>
      )}
      {stageUnits.length > 0 && <UnitNav unitKey={stageUnits[0].key} />}
    </div>
  );
}
