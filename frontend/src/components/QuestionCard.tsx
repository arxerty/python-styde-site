import { useMemo, useState } from "react";
import type { Question } from "../types";
import { useProgress } from "../store/progress";
import { Markdown } from "./Markdown";

const TYPE_LABELS: Record<Question["type"], string> = {
  single: "Один ответ",
  multiple: "Несколько ответов",
  output: "Что выведет код?",
  find_bug: "Найди ошибку",
};

/** Детерминированное перемешивание вариантов (одинаковое при каждом открытии). */
function shuffledOrder(length: number, seed: string): number[] {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const order = Array.from({ length }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    hash = (hash * 1103515245 + 12345) >>> 0;
    const j = hash % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

function normalizeAnswer(text: string) {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

interface Props {
  question: Question;
  itemKey: string;
  index: number;
  /** lesson — можно отвечать заново; practicum — одна попытка; review — повтор ошибок */
  mode: "lesson" | "practicum" | "review";
}

export function QuestionCard({ question, itemKey, index, mode }: Props) {
  const state = useProgress((s) => s.items[itemKey]);
  const update = useProgress((s) => s.update);
  const order = useMemo(() => shuffledOrder(question.options.length, question.id + question.prompt), [question]);
  const answered = !!state && (state.status === "correct" || state.status === "wrong");
  const [retrying, setRetrying] = useState(false);
  const showResult = answered && !retrying;
  const [selected, setSelected] = useState<number[]>(() =>
    Array.isArray(state?.answer) ? (state!.answer as number[]) : [],
  );
  const [text, setText] = useState(() => (typeof state?.answer === "string" ? state.answer : ""));

  const isMultiple = question.type === "multiple";
  const usesText = question.options.length === 0;

  function toggle(optionIndex: number) {
    if (showResult) return;
    if (isMultiple) {
      setSelected((prev) => (prev.includes(optionIndex) ? prev.filter((i) => i !== optionIndex) : [...prev, optionIndex]));
    } else {
      setSelected([optionIndex]);
    }
  }

  function submit() {
    let correct: boolean;
    if (usesText) {
      correct = normalizeAnswer(text) === normalizeAnswer(question.answer);
    } else {
      const right = question.options.map((o, i) => (o.correct ? i : -1)).filter((i) => i >= 0);
      correct = right.length === selected.length && right.every((i) => selected.includes(i));
    }
    const attempts = (state?.attempts ?? 0) + 1;
    update(itemKey, {
      status: correct ? "correct" : "wrong",
      attempts,
      answer: usesText ? text : selected,
      firstTry: state?.firstTry ?? (attempts === 1 && correct),
      mistake: !correct,
    });
    setRetrying(false);
  }

  function retry() {
    setSelected([]);
    setText("");
    setRetrying(true);
  }

  const canSubmit = usesText ? text.trim().length > 0 : selected.length > 0;
  const isCorrect = state?.status === "correct";

  return (
    <article className={`card question ${showResult ? (isCorrect ? "is-correct" : "is-wrong") : ""}`} id={`q-${question.id}`}>
      <header className="card-head">
        <span className="card-index">Вопрос {index + 1}</span>
        <span className="tag">{TYPE_LABELS[question.type]}</span>
      </header>
      <Markdown>{question.prompt}</Markdown>
      {question.code && <Markdown>{"```python\n" + question.code.replace(/\n$/, "") + "\n```"}</Markdown>}

      {usesText ? (
        <input
          className="text-answer"
          value={text}
          disabled={showResult}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && canSubmit && !showResult && submit()}
          placeholder="Ваш ответ"
        />
      ) : (
        <ul className="options">
          {order.map((optionIndex) => {
            const option = question.options[optionIndex];
            const chosen = selected.includes(optionIndex);
            let cls = "option";
            if (chosen) cls += " is-chosen";
            if (showResult && option.correct) cls += " is-right";
            if (showResult && chosen && !option.correct) cls += " is-bad";
            return (
              <li key={optionIndex}>
                <button className={cls} onClick={() => toggle(optionIndex)} disabled={showResult}>
                  <span className="option-mark">{isMultiple ? (chosen ? "☑" : "☐") : chosen ? "◉" : "○"}</span>
                  <span className="option-text">
                    <Markdown>{option.text}</Markdown>
                  </span>
                </button>
                {showResult && option.why && (chosen || option.correct) && (
                  <div className={`option-why ${option.correct ? "good" : "bad"}`}>
                    <Markdown>{option.why}</Markdown>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!showResult && (
        <div className="card-actions">
          <button className="btn btn-primary" disabled={!canSubmit} onClick={submit}>
            Ответить
          </button>
          {isMultiple && <span className="muted small">Выберите все верные варианты</span>}
        </div>
      )}

      {showResult && (
        <div className="explanation">
          <div className={`verdict ${isCorrect ? "good" : "bad"}`}>{isCorrect ? "✓ Верно!" : "✗ Неверно"}</div>
          {usesText && !isCorrect && (
            <p>
              Правильный ответ: <code>{question.answer}</code>
            </p>
          )}
          <Markdown>{question.explanation}</Markdown>
          {question.options.some((o) => o.why) && (
            <details className="all-whys">
              <summary>Разбор всех вариантов</summary>
              <ul>
                {question.options.map((option, i) => (
                  <li key={i}>
                    <strong>{option.correct ? "✓" : "✗"}</strong> <Markdown>{option.text}</Markdown>
                    {option.why && <Markdown>{option.why}</Markdown>}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {mode !== "practicum" && (
            <button className="btn btn-ghost btn-small" onClick={retry}>
              ↺ Ответить заново
            </button>
          )}
        </div>
      )}
    </article>
  );
}
