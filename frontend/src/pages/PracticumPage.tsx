import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { Markdown } from "../components/Markdown";
import { ProgressBar } from "../components/ProgressBar";
import { QuestionCard } from "../components/QuestionCard";
import { TaskCard } from "../components/TaskCard";
import { ErrorBox, Loading, LockedNotice, UnitNav } from "../components/UnitNav";
import { useCourseState } from "../lib/hooks";
import { itemKey, practicumScore } from "../lib/progress";
import { useProgress } from "../store/progress";
import type { Practicum } from "../types";

export function PracticumPage() {
  const { part = "", block = "" } = useParams();
  const [data, setData] = useState<Practicum | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { course, units, statuses, items } = useCourseState();
  const reset = useProgress((s) => s.reset);
  const unitKey = `${part}/${block}/practicum`;
  const unit = units.find((u) => u.key === unitKey);
  const status = statuses.get(unitKey);

  useEffect(() => {
    setData(null);
    api.practicum(part, block).then(setData).catch((e: Error) => setError(e.message));
  }, [part, block]);

  if (error) return <ErrorBox message={error} />;
  if (!data || !course || !unit) return <Loading />;
  if (status === "locked") return <LockedNotice />;

  const blockNode = course.parts.find((p) => p.id === part)?.blocks.find((b) => b.id === block);
  const score = practicumScore(unit, items);
  const percent = Math.round(score.score * 100);
  const passed = score.complete && score.score >= data.pass_threshold;

  const wrongQuestions = data.questions.filter((q) => {
    const state = items[itemKey(unitKey, `q/${q.id}`)];
    return state && !state.firstTry;
  });
  const unsolvedTasks = data.tasks.filter((t) => {
    const state = items[itemKey(unitKey, `t/${t.id}`)];
    return !state || (state.status !== "passed" && state.status !== "done");
  });

  async function restart() {
    if (window.confirm("Начать практикум заново? Ответы и решения практикума будут сброшены.")) {
      await reset(unitKey + "/");
      window.scrollTo(0, 0);
    }
  }

  return (
    <div className="page">
      <div className="breadcrumbs">
        <Link to="/">Курс</Link> / <span>{blockNode?.title}</span>
      </div>
      <h1>🏋 {data.title}</h1>
      {data.description && <Markdown>{data.description}</Markdown>}
      <div className="practicum-score">
        <div>
          Результат: <b>{percent}%</b> (нужно {Math.round(data.pass_threshold * 100)}%) · отвечено {score.answered} из {score.total}
        </div>
        <ProgressBar value={percent} />
        <div className="muted small">
          В практикуме у вопросов одна попытка. Задачи можно решать, пока не получится — засчитывается решённая.
        </div>
      </div>

      {score.complete && (
        <div className={`practicum-result ${passed ? "good" : "bad"}`}>
          {passed ? (
            <>
              <h2>🎉 Практикум пройден!</h2>
              <p>Блок завершён — следующий открыт.</p>
            </>
          ) : (
            <>
              <h2>Пока меньше {Math.round(data.pass_threshold * 100)}% — разберём ошибки</h2>
              <p>Перечитайте разборы ниже, вернитесь к теории уроков и пройдите практикум заново.</p>
              {wrongQuestions.length > 0 && (
                <>
                  <h3>Вопросы с ошибками</h3>
                  <ul className="review-list">
                    {wrongQuestions.map((q) => (
                      <li key={q.id}>
                        <a href={`#q-${q.id}`}>{q.prompt.split("\n")[0].slice(0, 120)}</a>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {unsolvedTasks.length > 0 && (
                <>
                  <h3>Нерешённые задачи</h3>
                  <ul className="review-list">
                    {unsolvedTasks.map((t) => (
                      <li key={t.id}>
                        <a href={`#t-${t.id}`}>{t.title}</a>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <button className="btn btn-primary" onClick={restart}>
                ↺ Пройти практикум заново
              </button>
            </>
          )}
        </div>
      )}

      <h2>Вопросы</h2>
      <section className="stack">
        {data.questions.map((question, index) => (
          <QuestionCard key={question.id} question={question} index={index} itemKey={itemKey(unitKey, `q/${question.id}`)} mode="practicum" />
        ))}
      </section>
      <h2>Задачи</h2>
      <section className="stack">
        {data.tasks.map((task, index) => (
          <TaskCard key={task.id} task={task} index={index} itemKey={itemKey(unitKey, `t/${task.id}`)} part={part} block={block} scope="practicum" />
        ))}
      </section>
      {score.complete && !passed && (
        <button className="btn btn-primary" onClick={restart}>
          ↺ Пройти практикум заново
        </button>
      )}
      <UnitNav unitKey={unitKey} />
    </div>
  );
}
