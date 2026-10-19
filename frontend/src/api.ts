import type { Course, Lesson, Practicum, Project } from "./types";

const TOKEN_KEY = "auth_token";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* приватный режим */
  }
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}, asText = false): Promise<T> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...init, headers });
  if (!response.ok) {
    let message = `Ошибка ${response.status}`;
    try {
      const body = await response.json();
      if (typeof body.detail === "string") message = body.detail;
      else if (Array.isArray(body.detail)) message = body.detail.map((d: { msg: string }) => d.msg).join("; ");
    } catch {
      /* не JSON */
    }
    throw new ApiError(response.status, message);
  }
  return (asText ? response.text() : response.json()) as Promise<T>;
}

export const api = {
  course: () => request<Course>("/api/course"),
  lesson: (part: string, block: string, lesson: string) =>
    request<Lesson>(`/api/content/${part}/${block}/lessons/${lesson}`),
  practicum: (part: string, block: string) => request<Practicum>(`/api/content/${part}/${block}/practicum`),
  cheatsheet: (part: string, block: string) =>
    request<string>(`/api/content/${part}/${block}/cheatsheet`, {}, true),
  project: (part: string) => request<Project>(`/api/content/${part}/project`),

  register: (email: string, name: string, password: string) =>
    request<AuthResponse>("/api/auth/register", { method: "POST", body: JSON.stringify({ email, name, password }) }),
  login: (email: string, password: string) =>
    request<AuthResponse>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  me: () => request<User>("/api/auth/me"),

  getProgress: () => request<{ items: Record<string, unknown> }>("/api/progress"),
  putProgress: (items: { key: string; data: unknown }[]) =>
    request<{ saved: number }>("/api/progress", { method: "PUT", body: JSON.stringify({ items }) }),
  deleteProgress: (prefix: string) =>
    request<{ deleted: number }>(`/api/progress?prefix=${encodeURIComponent(prefix)}`, { method: "DELETE" }),
};

export interface User {
  id: number;
  email: string;
  name: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export function assetUrl(part: string, block: string, path: string) {
  return `/api/assets/${part}/${block}/${path}`;
}

export function downloadUrl(part: string, block: string, scope: string, taskId: string) {
  return `/api/download/${part}/${block}/${scope}/${taskId}.zip`;
}
