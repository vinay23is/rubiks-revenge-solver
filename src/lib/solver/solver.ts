import { Move, SOLVER_MOVES, applyMoves, formatMove, simplifyMoves } from "../cube/moves";
import { CubeState, isSolved } from "../cube/state";
import { validate } from "../cube/validate";
import {
  CENTER_DEST,
  SLOT_FACE,
  STAGE2_MOVES,
  STAGE3_MOVES,
  WING_PARITY_FLIP,
  centerMask,
  getCenterTables,
  moveMask,
  permutationParity,
  readCenters,
  stage1Index,
  stage2Index,
  stage3Index,
} from "./centers";
import { pairEdges } from "./edges";
import { initKociemba, solveCubie } from "./kociemba";
import { Orientation, allOrientations, readWings, toCubie } from "./orientation";

/**
 * 4x4x4 solver using the reduction method:
 *   1-3. centers (three optimal sub-stages, see centers.ts)
 *   4.   edge pairing with wing 3-cycles (edges.ts)
 *   5.   reduced 3x3x3 solved with a two-phase search (kociemba.ts)
 * OLL parity is prevented in center stage 2 and PLL parity in edge pairing,
 * so the reduced cube is always a legal 3x3x3. The final move list is replayed
 * on the input state and the solver throws instead of returning an unverified
 * solution.
 */

export interface SolveStage {
  id: "centers1" | "centers2" | "centers3" | "edges" | "three";
  name: string;
  description: string;
  start: number;
  end: number;
}

export interface SolveResult {
  moves: string[];
  stages: SolveStage[];
  /** Orientation of the solved cube: colour index per face U R F D L B. */
  finalOrientation: number[];
  parity: { wingParityOdd: boolean; pllParityAvoided: boolean };
  timings: { totalMs: number; tablesMs: number };
  verified: true;
}

export class InvalidCubeError extends Error {
  constructor(public issues: string[]) {
    super(issues.join(" "));
    this.name = "InvalidCubeError";
  }
}

let tablesReady = false;
export function prepareSolver(): number {
  const t0 = Date.now();
  if (!tablesReady) {
    getCenterTables();
    initKociemba();
    tablesReady = true;
  }
  return Date.now() - t0;
}

/** Enumerate shortest paths that walk a distance table down to 0. */
function downhill<S>(
  s0: S,
  dist: (s: S) => number,
  moves: readonly number[],
  step: (s: S, m: number) => S,
  maxPaths: number,
): number[][] {
  const out: number[][] = [];
  const path: number[] = [];
  const rec = (s: S, d: number) => {
    if (out.length >= maxPaths) return;
    if (d === 0) {
      out.push([...path]);
      return;
    }
    for (const m of moves) {
      // Never turn the same face/layer twice in a row.
      if (path.length) {
        const p = SOLVER_MOVES[path[path.length - 1]];
        const q = SOLVER_MOVES[m];
        if (p.face === q.face && p.kind === q.kind) continue;
      }
      const n = step(s, m);
      if (dist(n) === d - 1) {
        path.push(m);
        rec(n, d - 1);
        path.pop();
        if (out.length >= maxPaths) return;
      }
    }
  };
  const d0 = dist(s0);
  if (d0 < 0) throw new Error("center state unreachable");
  rec(s0, d0);
  return out;
}

function applyCenterPath(c: Uint8Array, path: number[]): Uint8Array {
  let cur = c;
  for (const m of path) {
    const out = new Uint8Array(24);
    const d = CENTER_DEST[m];
    for (let i = 0; i < 24; i++) out[d[i]] = cur[i];
    cur = out;
  }
  return cur;
}

const pairKey = (a: number, b: number) => (a < b ? `${a}${b}` : `${b}${a}`);

function stage3MaskFor(c: Uint8Array, o: Orientation): number {
  return centerMask(
    Array.from(c, (col, slot) => {
      const f = SLOT_FACE(slot);
      const ref = f === 0 || f === 3 ? o[0] : f === 1 || f === 4 ? o[1] : o[2];
      return col === ref ? 1 : 0;
    }),
    (v) => v === 1,
  );
}

interface CenterPlan {
  path1: number[];
  path2: number[];
  orientation: Orientation;
  total: number;
}

function planCenters(state: CubeState, orientations: Orientation[], wingParity: number, keep: number): CenterPlan[] {
  const T = getCenterTables();
  const c0 = readCenters(state);

  const udPairs = new Map<string, Orientation[]>();
  for (const o of orientations) {
    const k = pairKey(o[0], o[3]);
    if (!udPairs.has(k)) udPairs.set(k, []);
    udPairs.get(k)!.push(o);
  }

  interface Cand {
    path1: number[];
    c1: Uint8Array;
    parity1: number;
    lr: [number, number];
    os: Orientation[];
    cost: number;
  }
  const cands: Cand[] = [];
  for (const os of udPairs.values()) {
    const ud = [os[0][0], os[0][3]];
    const m1 = centerMask(c0, (c) => ud.includes(c));
    const paths1 = downhill(m1, (m) => T.stage1[stage1Index(m)], [...SOLVER_MOVES.keys()], moveMask, 80);
    const lrPairs = new Map<string, Orientation[]>();
    for (const o of os) {
      const k = pairKey(o[1], o[4]);
      if (!lrPairs.has(k)) lrPairs.set(k, []);
      lrPairs.get(k)!.push(o);
    }
    for (const path1 of paths1) {
      const c1 = applyCenterPath(c0, path1);
      const parity1 = path1.reduce((p, m) => p ^ WING_PARITY_FLIP[m], wingParity);
      for (const los of lrPairs.values()) {
        const lr: [number, number] = [los[0][1], los[0][4]];
        const m2 = centerMask(c1, (c) => lr.includes(c));
        const d2 = T.stage2[stage2Index(m2, parity1)];
        cands.push({ path1, c1, parity1, lr, os: los, cost: path1.length + d2 });
      }
    }
  }
  cands.sort((a, b) => a.cost - b.cost);

  const plans: CenterPlan[] = [];
  const worst = () => (plans.length < keep ? Infinity : plans[plans.length - 1].total);
  for (const cand of cands.slice(0, 24)) {
    if (cand.cost > worst()) break;
    const m2 = centerMask(cand.c1, (c) => cand.lr.includes(c));
    const paths2 = downhill(
      [m2, cand.parity1] as [number, number],
      ([m, p]) => T.stage2[stage2Index(m, p)],
      STAGE2_MOVES,
      ([m, p], mv): [number, number] => [moveMask(m, mv), p ^ WING_PARITY_FLIP[mv]],
      40,
    );
    for (const path2 of paths2) {
      const c2 = applyCenterPath(cand.c1, path2);
      for (const o of cand.os) {
        const d3 = T.stage3[stage3Index(stage3MaskFor(c2, o))];
        const total = cand.path1.length + path2.length + d3;
        if (total < worst()) {
          plans.push({ path1: cand.path1, path2, orientation: o, total });
          plans.sort((a, b) => a.total - b.total);
          if (plans.length > keep) plans.pop();
        }
      }
    }
  }
  if (!plans.length) throw new Error("center planning failed");
  return plans;
}

export function solve(input: CubeState, opts: { threeTimeLimitMs?: number; centerPlans?: number } = {}): SolveResult {
  const t0 = Date.now();
  const v = validate(input);
  if (!v.ok || !v.scheme) throw new InvalidCubeError(v.issues.map((i) => i.message));
  const tablesMs = prepareSolver();

  const orientations = allOrientations(v.scheme);
  const wingParity = permutationParity(readWings(input, orientations[0]));

  // ---- centers + edges: try the best few center plans and keep the shortest combination
  const T = getCenterTables();
  const toMoves = (p: number[]) => p.map((i) => SOLVER_MOVES[i]);
  let chosen: { o: Orientation; c: Move[][]; edges: ReturnType<typeof pairEdges>; afterEdges: Uint8Array; len: number } | null = null;
  for (const plan of planCenters(input, orientations, wingParity, opts.centerPlans ?? 20)) {
    const o = plan.orientation;
    const c2 = applyCenterPath(readCenters(input), [...plan.path1, ...plan.path2]);
    const path3 = downhill(stage3MaskFor(c2, o), (m) => T.stage3[stage3Index(m)], STAGE3_MOVES, moveMask, 1)[0];
    const c = [plan.path1, plan.path2, path3].map((p) => simplifyMoves(toMoves(p)));
    const afterCenters = applyMoves(input, c.flat());
    const edges = pairEdges(afterCenters, o);
    const len = c.flat().length + edges.moves.length;
    if (!chosen || len < chosen.len) chosen = { o, c, edges, afterEdges: applyMoves(afterCenters, edges.moves), len };
  }
  const { o, edges } = chosen!;
  const [c1Moves, c2Moves, c3Moves] = chosen!.c;
  const edgeMoves = edges.moves;
  let s = chosen!.afterEdges;

  // ---- reduced 3x3
  const cubie = toCubie(s, o);
  const threeIdx = solveCubie(cubie, { timeLimitMs: opts.threeTimeLimitMs ?? 300 });
  const threeMoves: Move[] = threeIdx.map((m) => ({ face: Math.floor(m / 3), kind: "outer", amount: ((m % 3) + 1) as 1 | 2 | 3 }));
  s = applyMoves(s, threeMoves);

  const groups: [SolveStage["id"], string, string, Move[]][] = [
    ["centers1", "Centers: first pair", "Bring the eight centers of one opposite colour pair onto the top and bottom faces.", c1Moves],
    ["centers2", "Centers: second pair", "Bring the next colour pair's centers onto the left and right faces (also fixes edge parity).", c2Moves],
    ["centers3", "Centers: finish", "Separate the colours so every face has a single-coloured 2×2 center.", c3Moves],
    ["edges", "Edge pairing", "Pair up the 24 edge wings into 12 matching edges using 3-cycles that keep the centers intact.", edgeMoves],
    ["three", "Solve as 3×3×3", "With centers solved and edges paired, solve the cube like a 3×3×3 using outer-layer turns only.", threeMoves],
  ];
  // Cancel moves across stage boundaries (e.g. "F'" ending one stage and "F'" starting the next),
  // keeping the merged move in the earlier stage.
  for (let g = 1; g < groups.length; g++) {
    let a = g - 1;
    while (a > 0 && groups[a][3].length === 0) a--;
    const A = groups[a][3];
    const Bm = groups[g][3];
    while (A.length && Bm.length) {
      const merged = simplifyMoves([A[A.length - 1], Bm[0]]);
      if (merged.length >= 2) break;
      A.pop();
      Bm.shift();
      A.push(...merged);
    }
  }
  const all: Move[] = [];
  const stages: SolveStage[] = [];
  for (const [id, name, description, ms] of groups) {
    stages.push({ id, name, description, start: all.length, end: all.length + ms.length });
    all.push(...ms);
  }

  // ---- verification on the original sticker state
  if (!isSolved(s) || !isSolved(applyMoves(input, all))) throw new Error("internal error: solution failed verification");

  return {
    moves: all.map(formatMove),
    stages,
    finalOrientation: o,
    parity: { wingParityOdd: wingParity === 1, pllParityAvoided: edges.info.pllParityAvoided },
    timings: { totalMs: Date.now() - t0, tablesMs },
    verified: true,
  };
}
