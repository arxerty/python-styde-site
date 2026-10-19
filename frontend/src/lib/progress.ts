import type { Course, PartNode } from "../types";
import { isItemDone, type ItemState } from "../store/progress";

export type UnitKind = "lesson" | "practicum" | "stage";
export type UnitStatus = "done" | "progress" | "available" | "locked";

/** Единица прохождения курса: урок, практикум или этап проекта. */
export interface Unit {
  key: string; // префикс ключей прогресса: part/block/scope
  kind: UnitKind;
  part: string;
  block: string; // id блока или "project"
  scope: string; // lesson-NN | practicum | id этапа
  title: string;
  items: string[]; // q/id, t/id, check
  path: string; // URL страницы
  threshold?: number;
  optional?: boolean; // из необязательной части: не блокирует курс
}

export function flattenCourse(course: Course): Unit[] {
  const units: Unit[] = [];
  for (const part of course.parts) {
    for (const block of part.blocks) {
      for (const lesson of block.lessons) {
        units.push({
          key: `${part.id}/${block.id}/${lesson.id}`,
          kind: "lesson",
          part: part.id,
          block: block.id,
          scope: lesson.id,
          title: lesson.title,
          items: lesson.items,
          path: `/learn/${part.id}/${block.id}/${lesson.id}`,
        });
      }
      if (block.practicum) {
        units.push({
          key: `${part.id}/${block.id}/practicum`,
          kind: "practicum",
          part: part.id,
          block: block.id,
          scope: "practicum",
          title: block.practicum.title,
          items: block.practicum.items,
          path: `/learn/${part.id}/${block.id}/practicum`,
          threshold: block.practicum.pass_threshold,
        });
      }
    }
    if (part.project) {
      for (const stage of part.project.stages) {
        units.push({
          key: `${part.id}/project/${stage.id}`,
          kind: "stage",
          part: part.id,
          block: "project",
          scope: stage.id,
          title: stage.title,
          items: stage.items,
          path: `/learn/${part.id}/project#${stage.id}`,
        });
      }
    }
  }
  const optionalParts = new Set(course.parts.filter((p) => p.optional).map((p) => p.id));
  return units.map((unit) => (optionalParts.has(unit.part) ? { ...unit, optional: true } : unit));
}

export function itemKey(unitKey: string, item: string) {
  return `${unitKey}/${item}`;
}

/** Оценка практикума: вопросы — верно с первой попытки, задачи — решены. */
export function practicumScore(unit: Unit, items: Record<string, ItemState>) {
  let earned = 0;
  let answered = 0;
  for (const item of unit.items) {
    const state = items[itemKey(unit.key, item)];
    if (!isItemDone(state)) continue;
    answered += 1;
    if (item.startsWith("q/") ? state!.firstTry : state!.status === "passed" || state!.status === "done") earned += 1;
  }
  const total = unit.items.length || 1;
  return { earned, answered, total, score: earned / total, complete: answered === unit.items.length };
}

export function unitStats(unit: Unit, items: Record<string, ItemState>) {
  if (unit.items.length === 0) {
    const visited = !!items[itemKey(unit.key, "visited")];
    return { done: visited ? 1 : 0, total: 1 };
  }
  const done = unit.items.filter((item) => isItemDone(items[itemKey(unit.key, item)])).length;
  return { done, total: unit.items.length };
}

export function isUnitDone(unit: Unit, items: Record<string, ItemState>): boolean {
  if (unit.kind === "practicum") {
    const result = practicumScore(unit, items);
    return result.complete && result.score >= (unit.threshold ?? 0.7);
  }
  const { done, total } = unitStats(unit, items);
  return done === total;
}

export function computeStatuses(units: Unit[], items: Record<string, ItemState>, freeMode: boolean) {
  const statuses = new Map<string, UnitStatus>();
  let previousDone = true;
  for (const unit of units) {
    const done = isUnitDone(unit, items);
    let status: UnitStatus;
    if (done) status = "done";
    else if (!previousDone && !freeMode && !unit.optional) status = "locked";
    else {
      const started =
        unitStats(unit, items).done > 0 || !!items[itemKey(unit.key, "visited")];
      status = started ? "progress" : "available";
    }
    statuses.set(unit.key, status);
    if (!unit.optional) previousDone = done;
  }
  return statuses;
}

export function aggregate(units: Unit[], items: Record<string, ItemState>) {
  let done = 0;
  let total = 0;
  for (const unit of units) {
    const stats = unitStats(unit, items);
    done += stats.done;
    total += stats.total;
  }
  return { done, total, percent: total ? Math.round((done / total) * 100) : 0 };
}

export function partUnits(units: Unit[], part: PartNode) {
  return units.filter((unit) => unit.part === part.id);
}

export function parseItemKey(key: string) {
  // part/block/scope/kind/id
  const [part, block, scope, kind, id] = key.split("/");
  return { part, block, scope, kind, id };
}
