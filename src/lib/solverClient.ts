import type { SolveResult } from "./solver/solver";

/** Promise-based client for the solver Web Worker (one shared worker per tab). */
export class SolverError extends Error {
  constructor(
    public messages: string[],
    public invalid: boolean,
  ) {
    super(messages.join(" "));
  }
}

type Pending = { resolve: (v: unknown) => void; reject: (e: unknown) => void };

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("../workers/solver.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (e: MessageEvent) => {
    const { id, ok, result, error, invalid } = e.data;
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    if (ok) p.resolve(result);
    else p.reject(new SolverError(error, invalid));
  };
  worker.onerror = (e) => {
    for (const p of pending.values()) p.reject(new SolverError([e.message || "Solver worker crashed"], false));
    pending.clear();
    worker = null;
  };
  return worker;
}

function call<T>(msg: object): Promise<T> {
  const id = nextId++;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    getWorker().postMessage({ id, ...msg });
  });
}

export const prepareSolverInWorker = () => call<{ ms: number }>({ type: "prepare" });
export const solveInWorker = (state: ArrayLike<number>) => call<SolveResult>({ type: "solve", state: Array.from(state) });
