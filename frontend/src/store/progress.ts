import { create } from "zustand";
import { api, getToken } from "../api";

export type ItemStatus = "correct" | "wrong" | "passed" | "failed" | "done";

/** Состояние одного элемента прогресса. Ключ: part/block/scope/(q|t)/id */
export interface ItemState {
  status: ItemStatus;
  attempts: number;
  answer?: number[] | string; // выбранные варианты (индексы в исходном порядке) или текст
  firstTry?: boolean; // ответ верный с первой попытки (для оценки практикума)
  code?: string; // последний код задачи
  mistake?: boolean; // попадает в «Мои ошибки»
  solutionShown?: boolean;
  output?: string; // вывод pytest для local-заданий
  checks?: boolean[]; // чек-лист критериев проекта
  updatedAt: number;
}

const STORAGE_KEY = "progress_v1";
const FREE_MODE_KEY = "free_mode";

function loadLocal(): Record<string, ItemState> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveLocal(items: Record<string, ItemState>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* хранилище недоступно */
  }
}

function loadFreeMode(): boolean {
  try {
    return localStorage.getItem(FREE_MODE_KEY) === "1";
  } catch {
    return false;
  }
}

interface ProgressStore {
  items: Record<string, ItemState>;
  freeMode: boolean;
  syncError: string | null;
  update: (key: string, patch: Partial<ItemState>) => void;
  reset: (prefix: string) => Promise<void>;
  setFreeMode: (value: boolean) => void;
  syncWithServer: () => Promise<void>;
  clearLocal: () => void;
}

const dirty = new Set<string>();
let syncTimer: number | undefined;

function scheduleSync() {
  if (!getToken()) return;
  window.clearTimeout(syncTimer);
  syncTimer = window.setTimeout(flush, 800);
}

async function flush() {
  if (!getToken() || dirty.size === 0) return;
  const { items } = useProgress.getState();
  const keys = [...dirty];
  dirty.clear();
  try {
    await api.putProgress(keys.filter((k) => items[k]).map((key) => ({ key, data: items[key] })));
    useProgress.setState({ syncError: null });
  } catch (error) {
    keys.forEach((k) => dirty.add(k));
    useProgress.setState({ syncError: error instanceof Error ? error.message : "Ошибка синхронизации" });
  }
}

export const useProgress = create<ProgressStore>((set, get) => ({
  items: loadLocal(),
  freeMode: loadFreeMode(),
  syncError: null,

  update(key, patch) {
    const previous = get().items[key];
    const base: ItemState = previous ?? { status: "failed", attempts: 0, updatedAt: 0 };
    const next: ItemState = { ...base, ...patch, updatedAt: Date.now() };
    const items = { ...get().items, [key]: next };
    set({ items });
    saveLocal(items);
    dirty.add(key);
    scheduleSync();
  },

  async reset(prefix) {
    const items = Object.fromEntries(Object.entries(get().items).filter(([key]) => !key.startsWith(prefix)));
    set({ items });
    saveLocal(items);
    if (getToken()) {
      try {
        await api.deleteProgress(prefix);
      } catch {
        /* при следующей синхронизации сервер вернёт старое — не критично */
      }
    }
  },

  setFreeMode(value) {
    try {
      localStorage.setItem(FREE_MODE_KEY, value ? "1" : "0");
    } catch {
      /* ignore */
    }
    set({ freeMode: value });
  },

  /** Слияние локального и серверного прогресса: побеждает более свежая запись. */
  async syncWithServer() {
    if (!getToken()) return;
    const server = (await api.getProgress()).items as Record<string, ItemState>;
    const local = get().items;
    const merged: Record<string, ItemState> = { ...server };
    for (const [key, value] of Object.entries(local)) {
      if (!server[key] || (server[key].updatedAt ?? 0) < value.updatedAt) {
        merged[key] = value;
        dirty.add(key);
      }
    }
    set({ items: merged });
    saveLocal(merged);
    await flush();
  },

  clearLocal() {
    set({ items: {} });
    saveLocal({});
  },
}));

export function isItemDone(state: ItemState | undefined): boolean {
  return !!state && state.status !== "failed";
}
