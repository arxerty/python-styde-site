import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { Markdown } from "../components/Markdown";
import { QuestionCard } from "../components/QuestionCard";
import { TaskCard } from "../components/TaskCard";
import { ErrorBox, Loading, LockedNotice, UnitNav } from "../components/UnitNav";
import { ProgressBar } from "../components/ProgressBar";
import { useCourseState, useRuntime } from "../lib/hooks";
import { itemKey, unitStats } from "../lib/progress";
import { isItemDone, useProgress } from "../store/progress";
import type { Lesson } from "../types";

type Tab = "theory" | "questions" | "tasks";

export function LessonPage() {
  const { part = "", block = "", lesson = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab) || "theory";
  const [data, setData] = useState<Lesson | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { course, units, statuses, items } = useCourseState();
  const update = useProgress((s) => s.update);
  const runtime = useRuntime(part);
  const unitKey = `${part}/${block}/${lesson}`;
  const unit = units.find((u) => u.key === unitKey);
  const status = statuses.get(unitKey);

  useEffect(() => {
    setData(null);
    setError(null);
    api.lesson(part, block, lesson).then(setData).catch((e: Error) => setError(e.message));
  }, [part, block, lesson]);

  useEffect(() => {
    if (status && status !== "locked" && !items[itemKey(unitKey, "visited")]) {
      update(itemKey(unitKey, "visited"), { status: "done", attempts: 0 });
    }
  }, [status, unitKey, items, update]);

  if (error) return <ErrorBox message={error} />;
  if (!data || !course) return <Loading />;
  if (status === "locked") return <LockedNotice />;

  const partNode = course.parts.find((p) => p.id === part);
  const blockNode = partNode?.blocks.find((b) => b.id === block);
  const lessonIndex = blockNode?.lessons.findIndex((l) => l.id === lesson) ?? 0;
  const stats = unit ? unitStats(unit, items) : { done: 0, total: 1 };
  const answeredQuestions = data.questions.filter((q) => isItemDone(items[itemKey(unitKey, `q/${q.id}`)])).length;
  const solvedTasks = data.tasks.filter((t) => isItemDone(items[itemKey(unitKey, `t/${t.id}`)])).length;

  function setTab(next: Tab) {
    setParams(next === "theory" ? {} : { tab: next });
    window.scrollTo(0, 0);
  }

  return (
    <div className="page lesson-page">
      <div className="breadcrumbs">
        <Link to="/">Курс</Link> / <span>{partNode?.title}</span> / <span>{blockNode?.title}</span>
      </div>
      <h1>
        <span className="muted">Урок {lessonIndex + 1}.</span> {data.title}
      </h1>
      <div className="lesson-progress">
        <ProgressBar value={(stats.done / stats.total) * 100} />
        <span className="muted small">
          {stats.done} из {stats.total}
        </span>
      </div>

      <div className="tabs" role="tablist">
        <button className={tab === "theory" ? "is-active" : ""} onClick={() => setTab("theory")}>
          📘 Теория
        </button>
        <button className={tab === "questions" ? "is-active" : ""} onClick={() => setTab("questions")}>
          ❓ Вопросы <span className="tab-count">{answeredQuestions}/{data.questions.length}</span>
        </button>
        <button className={tab === "tasks" ? "is-active" : ""} onClick={() => setTab("tasks")}>
          💻 Задачи <span className="tab-count">{solvedTasks}/{data.tasks.length}</span>
        </button>
      </div>

      {tab === "theory" && (
        <section>
          <Markdown runnable={runtime !== "local"}>{data.theory}</Markdown>
          <div className="next-step">
            <button className="btn btn-primary" onClick={() => setTab(data.questions.length ? "questions" : "tasks")}>
              Перейти к вопросам →
            </button>
          </div>
        </section>
      )}

      {tab === "questions" && (
        <section className="stack">
          {data.questions.map((question, index) => (
            <QuestionCard key={question.id} question={question} index={index} itemKey={itemKey(unitKey, `q/${question.id}`)} mode="lesson" />
          ))}
          <div className="next-step">
            <button className="btn btn-primary" onClick={() => setTab("tasks")}>
              Перейти к задачам →
            </button>
          </div>
        </section>
      )}

      {tab === "tasks" && (
        <section className="stack">
          {data.tasks.map((task, index) => (
            <TaskCard key={task.id} task={task} index={index} itemKey={itemKey(unitKey, `t/${task.id}`)} part={part} block={block} scope={lesson} />
          ))}
          {data.tasks.length === 0 && <p className="muted">В этом уроке нет задач.</p>}
        </section>
      )}

      <UnitNav unitKey={unitKey} />
    </div>
  );
}
