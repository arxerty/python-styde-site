import { create } from "zustand";
import { api, getToken, setToken, type User } from "../api";
import { useProgress } from "./progress";

interface AuthStore {
  user: User | null;
  ready: boolean;
  init: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, name: string, password: string) => Promise<void>;
  logout: () => void;
}

export const useAuth = create<AuthStore>((set) => ({
  user: null,
  ready: false,

  async init() {
    if (!getToken()) {
      set({ ready: true });
      return;
    }
    try {
      const user = await api.me();
      set({ user, ready: true });
      await useProgress.getState().syncWithServer();
    } catch {
      setToken(null);
      set({ user: null, ready: true });
    }
  },

  async login(email, password) {
    const { token, user } = await api.login(email, password);
    setToken(token);
    set({ user });
    await useProgress.getState().syncWithServer();
  },

  async register(email, name, password) {
    const { token, user } = await api.register(email, name, password);
    setToken(token);
    set({ user });
    await useProgress.getState().syncWithServer();
  },

  logout() {
    setToken(null);
    useProgress.getState().clearLocal();
    set({ user: null });
  },
}));
