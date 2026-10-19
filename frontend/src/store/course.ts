import { create } from "zustand";
import { api } from "../api";
import type { Course } from "../types";

interface CourseStore {
  course: Course | null;
  error: string | null;
  load: () => Promise<void>;
}

export const useCourse = create<CourseStore>((set) => ({
  course: null,
  error: null,
  async load() {
    try {
      set({ course: await api.course(), error: null });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Не удалось загрузить курс" });
    }
  },
}));
