import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { aggregate, type UnitStatus } from "../lib/progress";
import { useCourseState } from "../lib/hooks";
import { ProgressBar } from "./ProgressBar";

export const STATUS_ICON: Record<UnitStatus, string> = {
  done: "✓",
  progress: "◐",
  available: "○",
  locked: "🔒",
};

export const STATUS_TITLE: Record<UnitStatus, string> = {
  done: "Пройдено",
  progress: "В процессе",
  available: "Доступно",
  locked: "Заблокировано — пройдите предыдущий шаг",
};

function StatusIcon({ status }: { status: UnitStatus }) {
  return (
    <span className={`status status-${status}`} title={STATUS_TITLE[status]}>
      {STATUS_ICON[status]}
    </span>
  );
}

export function Sidebar({ onNavigate }: { onNavigate: () => void }) {
  const { course, units, statuses, items } = useCourseState();
  const location = useLocation();
  const [openParts, setOpenParts] = useState<Record<string, boolean>>({});
  const [openBlocks, setOpenBlocks] = useState<Record<string, boolean>>({});

  // Раскрываем ветку текущей страницы
  useEffect(() => {
    const [, , part, block] = location.pathname.split("/");
    if (part) setOpenParts((prev) => ({ ...prev, [part]: true }));
    if (part && block) setOpenBlocks((prev) => ({ ...prev, [`${part}/${block}`]: true }));
  }, [location.pathname]);

  if (!course) return <nav className="sidebar">Загрузка…</nav>;

  return (
    <nav className="sidebar">
      {course.parts.map((part, partIndex) => {
        const partUnits = units.filter((u) => u.part === part.id);
        const partProgress = aggregate(partUnits, items);
        const open = openParts[part.id] ?? false;
        return (
          <div className="tree-part" key={part.id}>
            <button className="tree-part-head" onClick={() => setOpenParts({ ...openParts, [part.id]: !open })}>
              <span className="chevron">{open ? "▾" : "▸"}</span>
              <span className="tree-part-title">
                <span className="muted small">
                  {part.optional ? "Необязательно" : `Часть ${partIndex + 1 - course.parts.slice(0, partIndex).filter((p) => p.optional).length}`}
                </span>
                {part.title}
              </span>
              <span className="tree-percent">{partProgress.percent}%</span>
            </button>
            {open && (
              <div className="tree-part-body">
                {part.blocks.map((block) => {
                  const blockKey = `${part.id}/${block.id}`;
                  const blockUnits = partUnits.filter((u) => u.block === block.id);
                  const blockProgress = aggregate(blockUnits, items);
                  const blockOpen = openBlocks[blockKey] ?? false;
                  return (
                    <div className="tree-block" key={block.id}>
                      <button className="tree-block-head" onClick={() => setOpenBlocks({ ...openBlocks, [blockKey]: !blockOpen })}>
                        <span className="chevron">{blockOpen ? "▾" : "▸"}</span>
                        <span className="tree-block-title">{block.title}</span>
                        <span className="tree-percent">{blockProgress.percent}%</span>
                      </button>
                      <ProgressBar value={blockProgress.percent} thin />
                      {blockOpen && (
                        <ul className="tree-units">
                          {blockUnits.map((unit) => {
                            const status = statuses.get(unit.key) ?? "available";
                            return (
                              <li key={unit.key}>
                                <NavLink to={unit.path} onClick={onNavigate} className={`tree-link ${status === "locked" ? "is-locked" : ""}`}>
                                  <StatusIcon status={status} />
                                  <span>{unit.kind === "practicum" ? `🏋 ${unit.title}` : unit.title}</span>
                                </NavLink>
                              </li>
                            );
                          })}
                          {block.has_cheatsheet && (
                            <li>
                              <NavLink to={`/learn/${part.id}/${block.id}/cheatsheet`} onClick={onNavigate} className="tree-link">
                                <span className="status">📄</span>
                                <span>Шпаргалка</span>
                              </NavLink>
                            </li>
                          )}
                        </ul>
                      )}
                    </div>
                  );
                })}
                {part.project && (
                  <NavLink to={`/learn/${part.id}/project`} onClick={onNavigate} className="tree-link tree-project">
                    <StatusIcon
                      status={(() => {
                        const stageStatuses = partUnits.filter((u) => u.kind === "stage").map((u) => statuses.get(u.key));
                        if (stageStatuses.every((s) => s === "done")) return "done";
                        if (stageStatuses.every((s) => s === "locked")) return "locked";
                        if (stageStatuses.some((s) => s === "done" || s === "progress")) return "progress";
                        return "available";
                      })()}
                    />
                    <span>🚀 Проект: {part.project.title}</span>
                  </NavLink>
                )}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
