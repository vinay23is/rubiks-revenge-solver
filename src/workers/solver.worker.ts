/// <reference lib="webworker" />
import { InvalidCubeError, prepareSolver, solve } from "../lib/solver/solver";

/**
 * Runs the solver off the main thread. Messages:
 *   { id, type: "prepare" }               -> builds the pruning tables
 *   { id, type: "solve", state: number[] } -> SolveResult or an error
 */
type Req = { id: number; type: "prepare" } | { id: number; type: "solve"; state: number[] };

self.onmessage = (e: MessageEvent<Req>) => {
  const msg = e.data;
  try {
    if (msg.type === "prepare") {
      const ms = prepareSolver();
      self.postMessage({ id: msg.id, ok: true, result: { ms } });
    } else {
      const result = solve(Uint8Array.from(msg.state));
      self.postMessage({ id: msg.id, ok: true, result });
    }
  } catch (err) {
    const invalid = err instanceof InvalidCubeError;
    self.postMessage({
      id: msg.id,
      ok: false,
      invalid,
      error: invalid ? (err as InvalidCubeError).issues : [(err as Error).message ?? String(err)],
    });
  }
};
