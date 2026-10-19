import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { QuestionCard } from "../components/QuestionCard";
import { TaskCard } from "../components/TaskCard";
import { Loading } from "../components/UnitNav";
import { parseItemKey } from "../lib/progress";
import { useProgress } from "../store/progress";
import type { Question, Task } from "../types";

interface Source {
  questions: Question[];
  tasks: Task[];
}

/** Повтор вопросов и задач, в которых были ошибки. Элемент уходит из списка после верного ответа. */
export function MistakesPage() {
  const items = useProgress((s) => s.items);
  // Фиксируем список на время сессии, чтобы исправленный элемент не исчезал из-под рук
  const [keys] = useState(() =>
    Object.entries(items)
      .filter(([, state]) => state.mistake)
      .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
      .map(([key]) => key),
  );
  const [sources, setSources] = useState<Record<string, Source>>({});
  const [loading, setLoading] = useState(true);

  const scopes = useMemo(() => {
    const set = new Set(keys.map((key) => key.split("/").slice(0, 3).join("/")));
    return [...set];
  }, [keys]);

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      scopes.map(async (scope) => {
        const [part, block, name] = scope.split("/");
        try {
          if (block === "project") {
            const project = await api.project(part);
            const stage = project.stages.find((s) => s.id === name);
            return [scope, { questions: [], tasks: stage?.tasks ?? [] }] as const;
          }
          const data = name === "practicum" ? await api.practicum(part, block) : await api.lesson(part, block, name);
          return [scope, { questions: data.questions, tasks: data.tasks }] as const;
        } catch {
          return [scope, { questions: [], tasks: [] }] as const;
        }
      }),
    ).then((entries) => {
      if (!cancelled) {
        setSources(Object.fromEntries(entries));
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [scopes]);

  const remaining = Object.values(items).filter((s) => s.mistake).length;

  return (
    <div className="page">
      <h1>Мои ошибки</h1>
      <p className="muted">
        Здесь собраны вопросы и задачи, в которых вы ошиблись. Ответьте или решите заново — после верного ответа элемент
        уйдёт из списка. Осталось: <b>{remaining}</b>.
      </p>
      {loading && keys.length > 0 && <Loading />}
      {keys.length === 0 && (
        <div className="empty">
          <div className="empty-icon">🎯</div>
          <p>Ошибок нет. Так держать!</p>
          <Link to="/" className="btn btn-primary">
            К курсу
          </Link>
        </div>
      )}
      <div className="stack">
        {!loading &&
          keys.map((key) => {
            const { part, block, scope, kind, id } = parseItemKey(key);
            const source = sources[`${part}/${block}/${scope}`];
            if (!source) return null;
            const location = (
              <div className="mistake-source muted small">
                Из: <Link to={block === "project" ? `/learn/${part}/project#${scope}` : `/learn/${part}/${block}/${scope}`}>{`${part} / ${block} / ${scope}`}</Link>
              </div>
            );
            if (kind === "q") {
              const question = source.questions.find((q) => q.id === id);
              return question ? (
                <div key={key}>
                  {location}
                  <QuestionCard question={question} index={0} itemKey={key} mode="review" />
                </div>
              ) : null;
            }
            const task = source.tasks.find((t) => t.id === id);
            return task ? (
              <div key={key}>
                {location}
                <TaskCard task={task} index={0} itemKey={key} part={part} block={block} scope={scope} />
              </div>
            ) : null;
          })}
      </div>
    </div>
  );
}
