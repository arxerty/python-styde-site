import { create } from "zustand";
import type { CheckResult, RunResult, Task, TestCase, TestResult } from "../types";

export type RunnerStatus = "idle" | "loading" | "packages" | "running";

export const useRunnerStatus = create<{ status: RunnerStatus; set: (s: RunnerStatus) => void }>((set) => ({
  status: "idle",
  set: (status) => set({ status }),
}));

interface Asset {
  url: string;
  path: string;
}

interface Pending {
  resolve: (value: unknown) => void;
  timeoutMs: number;
  timer?: number;
  onTimeout: () => unknown;
}

const TIMEOUT_MESSAGE =
  "Превышено время выполнения. Возможно, в коде бесконечный цикл (проверьте условие выхода из while) или слишком тяжёлые вычисления.";

/** Очередь заданий к Pyodide-воркеру с таймаутом и перезапуском при зависании. */
class PythonRunner {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private queue: Promise<unknown> = Promise.resolve();

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker("/pyodide-worker.js");
    worker.onmessage = (event: MessageEvent) => {
      const { id, type, status, result } = event.data;
      const job = this.pending.get(id);
      if (!job) return;
      if (type === "status") {
        useRunnerStatus.getState().set(status);
        if (status === "running" && job.timer === undefined) {
          job.timer = window.setTimeout(() => this.handleTimeout(id), job.timeoutMs);
        }
        return;
      }
      if (job.timer !== undefined) window.clearTimeout(job.timer);
      this.pending.delete(id);
      useRunnerStatus.getState().set("idle");
      job.resolve(result);
    };
    this.worker = worker;
    return worker;
  }

  private handleTimeout(id: number) {
    const job = this.pending.get(id);
    if (!job) return;
    this.pending.delete(id);
    this.worker?.terminate();
    this.worker = null;
    useRunnerStatus.getState().set("idle");
    job.resolve(job.onTimeout());
  }

  private exec<T>(kind: string, payload: unknown, timeoutSec: number, assets: Asset[], onTimeout: () => T): Promise<T> {
    const job = () =>
      new Promise<T>((resolve) => {
        const id = this.nextId++;
        this.pending.set(id, {
          resolve: resolve as (value: unknown) => void,
          timeoutMs: timeoutSec * 1000,
          onTimeout,
        });
        this.ensureWorker().postMessage({ id, kind, payload, assets });
      });
    const result = this.queue.then(job, job);
    this.queue = result.catch(() => undefined);
    return result;
  }

  preload() {
    return this.exec("init", {}, 120, [], () => ({ ready: false }));
  }

  run(code: string, options: { stdin?: string; timeout?: number; files?: Record<string, string>; setup?: string; assets?: Asset[] } = {}): Promise<RunResult> {
    return this.exec<RunResult>(
      "run",
      { code, stdin: options.stdin ?? "", files: options.files ?? {}, setup: options.setup ?? "" },
      options.timeout ?? 10,
      options.assets ?? [],
      () => ({ stdout: "", error: TIMEOUT_MESSAGE, images: [] }),
    );
  }

  /** Тесты запускаются по одному: так таймаут одного теста не съедает остальные. */
  async test(task: Task, code: string, assets: Asset[], onProgress?: (done: number) => void): Promise<CheckResult> {
    const results: TestResult[] = [];
    for (const [index, test] of task.tests.entries()) {
      const single = await this.exec<CheckResult>(
        "test",
        {
          code,
          tests: [cleanTest(test)],
          setup: task.setup,
          files: task.files,
          constraints: task.constraints,
        },
        task.timeout,
        assets,
        () => ({ passed: false, error: null, results: [{ name: test.name, passed: false, message: TIMEOUT_MESSAGE }] }),
      );
      if (single.error) return { passed: false, results, error: single.error };
      results.push(...single.results);
      onProgress?.(index + 1);
      if (single.results.some((r) => r.message === TIMEOUT_MESSAGE)) {
        // после зависания остальные тесты почти наверняка тоже зависнут
        for (const rest of task.tests.slice(index + 1)) {
          results.push({ name: rest.name, passed: false, message: "Не запускался из-за таймаута предыдущего теста" });
        }
        break;
      }
    }
    return { passed: results.length > 0 && results.every((r) => r.passed), results, error: null };
  }
}

function cleanTest(test: TestCase) {
  return Object.fromEntries(Object.entries(test).filter(([, value]) => value !== null && value !== undefined));
}

export const python = new PythonRunner();
