import { useMemo } from "react";
import { useCourse } from "../store/course";
import { useProgress } from "../store/progress";
import { computeStatuses, flattenCourse } from "./progress";

export function useCourseState() {
  const course = useCourse((s) => s.course);
  const items = useProgress((s) => s.items);
  const freeMode = useProgress((s) => s.freeMode);
  const units = useMemo(() => (course ? flattenCourse(course) : []), [course]);
  const statuses = useMemo(() => computeStatuses(units, items, freeMode), [units, items, freeMode]);
  return { course, units, statuses, items, freeMode };
}

export function useRuntime(partId: string | undefined): "browser" | "local" | "mixed" {
  const course = useCourse((s) => s.course);
  return course?.parts.find((p) => p.id === partId)?.runtime ?? "browser";
}
