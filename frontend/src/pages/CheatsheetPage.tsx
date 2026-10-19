import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { Markdown } from "../components/Markdown";
import { ErrorBox, Loading } from "../components/UnitNav";
import { useCourseState } from "../lib/hooks";

export function CheatsheetPage() {
  const { part = "", block = "" } = useParams();
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { course } = useCourseState();

  useEffect(() => {
    setText(null);
    api.cheatsheet(part, block).then(setText).catch((e: Error) => setError(e.message));
  }, [part, block]);

  if (error) return <ErrorBox message={error} />;
  if (text === null) return <Loading />;
  const blockNode = course?.parts.find((p) => p.id === part)?.blocks.find((b) => b.id === block);

  return (
    <div className="page cheatsheet">
      <div className="breadcrumbs">
        <Link to="/">Курс</Link> / <span>{blockNode?.title}</span>
      </div>
      <div className="cheatsheet-actions">
        <button className="btn btn-ghost btn-small" onClick={() => window.print()}>
          🖨 Распечатать
        </button>
      </div>
      <Markdown>{text}</Markdown>
    </div>
  );
}
