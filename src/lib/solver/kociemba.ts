/**
 * Two-phase 3x3x3 solver (after Herbert Kociemba's algorithm), implemented from
 * scratch. Used for the final stage of the 4x4x4 reduction method, once centers
 * are solved and the edges are paired.
 *
 * Phase 1 brings the cube into G1 = <U, D, R2, L2, F2, B2> (all orientations
 * solved and the four middle-slice edges in the middle slice). Phase 2 solves
 * the cube within G1. Both phases use IDA* with exact pruning tables.
 *
 * Cubie conventions (replaced-by representation):
 *   corners URF UFL ULB UBR DFR DLF DBL DRB, edges UR UF UL UB DR DF DL DB FR FL BL BR.
 * Moves are indexed face * 3 + (power - 1) with faces U R F D L B.
 */

export interface CubieCube {
  cp: number[];
  co: number[];
  ep: number[];
  eo: number[];
}

const BASIC: CubieCube[] = [
  // U
  { cp: [3, 0, 1, 2, 4, 5, 6, 7], co: [0, 0, 0, 0, 0, 0, 0, 0], ep: [3, 0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11], eo: Array(12).fill(0) },
  // R
  { cp: [4, 1, 2, 0, 7, 5, 6, 3], co: [2, 0, 0, 1, 1, 0, 0, 2], ep: [8, 1, 2, 3, 11, 5, 6, 7, 4, 9, 10, 0], eo: Array(12).fill(0) },
  // F
  { cp: [1, 5, 2, 3, 0, 4, 6, 7], co: [1, 2, 0, 0, 2, 1, 0, 0], ep: [0, 9, 2, 3, 4, 8, 6, 7, 1, 5, 10, 11], eo: [0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0] },
  // D
  { cp: [0, 1, 2, 3, 5, 6, 7, 4], co: [0, 0, 0, 0, 0, 0, 0, 0], ep: [0, 1, 2, 3, 5, 6, 7, 4, 8, 9, 10, 11], eo: Array(12).fill(0) },
  // L
  { cp: [0, 2, 6, 3, 4, 1, 5, 7], co: [0, 1, 2, 0, 0, 2, 1, 0], ep: [0, 1, 10, 3, 4, 5, 9, 7, 8, 2, 6, 11], eo: Array(12).fill(0) },
  // B
  { cp: [0, 1, 3, 7, 4, 5, 2, 6], co: [0, 0, 1, 2, 0, 0, 2, 1], ep: [0, 1, 2, 11, 4, 5, 6, 10, 8, 9, 3, 7], eo: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1] },
];

export function identityCube(): CubieCube {
  return { cp: [0, 1, 2, 3, 4, 5, 6, 7], co: Array(8).fill(0), ep: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], eo: Array(12).fill(0) };
}

export function multiply(a: CubieCube, b: CubieCube): CubieCube {
  const r = identityCube();
  for (let i = 0; i < 8; i++) {
    r.cp[i] = a.cp[b.cp[i]];
    r.co[i] = (a.co[b.cp[i]] + b.co[i]) % 3;
  }
  for (let i = 0; i < 12; i++) {
    r.ep[i] = a.ep[b.ep[i]];
    r.eo[i] = (a.eo[b.ep[i]] + b.eo[i]) % 2;
  }
  return r;
}

/** All 18 face turns as cubie cubes. */
export const MOVE_CUBES: CubieCube[] = [];
for (let f = 0; f < 6; f++) {
  let c = identityCube();
  for (let p = 0; p < 3; p++) {
    c = multiply(c, BASIC[f]);
    MOVE_CUBES.push(c);
  }
}

export function applyMoveIndex(c: CubieCube, m: number): CubieCube {
  return multiply(c, MOVE_CUBES[m]);
}

function permParity(p: number[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) if (p[i] > p[j]) s ^= 1;
  return s;
}

export function cornerParity(c: CubieCube): number {
  return permParity(c.cp);
}
export function edgeParity(c: CubieCube): number {
  return permParity(c.ep);
}

/** Returns null if solvable, otherwise a description of the violated invariant. */
export function verifyCubie(c: CubieCube): string | null {
  const seenC = new Set(c.cp);
  const seenE = new Set(c.ep);
  if (seenC.size !== 8) return "duplicate corner";
  if (seenE.size !== 12) return "duplicate edge";
  if (c.co.reduce((a, b) => a + b, 0) % 3 !== 0) return "corner twist";
  if (c.eo.reduce((a, b) => a + b, 0) % 2 !== 0) return "edge flip";
  if (cornerParity(c) !== edgeParity(c)) return "permutation parity";
  return null;
}

// ------------------------------------------------------------ coordinates
const FACT = [1, 1, 2, 6, 24, 120, 720, 5040, 40320];
const C = (n: number, k: number): number => {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return Math.round(r);
};

function getTwist(c: CubieCube): number {
  let t = 0;
  for (let i = 0; i < 7; i++) t = t * 3 + c.co[i];
  return t;
}
function setTwist(c: CubieCube, t: number) {
  let s = 0;
  for (let i = 6; i >= 0; i--) {
    c.co[i] = t % 3;
    s += c.co[i];
    t = Math.floor(t / 3);
  }
  c.co[7] = (3 - (s % 3)) % 3;
}
function getFlip(c: CubieCube): number {
  let t = 0;
  for (let i = 0; i < 11; i++) t = t * 2 + c.eo[i];
  return t;
}
function setFlip(c: CubieCube, t: number) {
  let s = 0;
  for (let i = 10; i >= 0; i--) {
    c.eo[i] = t & 1;
    s += c.eo[i];
    t >>= 1;
  }
  c.eo[11] = s % 2;
}
/** Combination index (0..494) of the positions holding slice edges (8..11). */
function getSlice(c: CubieCube): number {
  let idx = 0;
  let k = 0;
  for (let i = 0; i < 12; i++) {
    if (c.ep[i] >= 8) {
      k++;
      idx += C(i, k);
    }
  }
  return idx;
}
function setSlice(c: CubieCube, idx: number) {
  const occupied = Array(12).fill(false);
  let k = 4;
  for (let i = 11; i >= 0 && k > 0; i--) {
    if (C(i, k) <= idx) {
      idx -= C(i, k);
      occupied[i] = true;
      k--;
    }
  }
  let s = 8;
  let o = 0;
  for (let i = 0; i < 12; i++) c.ep[i] = occupied[i] ? s++ : o++;
}
function permRank(p: number[]): number {
  // Lehmer code
  const n = p.length;
  let r = 0;
  for (let i = 0; i < n; i++) {
    let smaller = 0;
    for (let j = i + 1; j < n; j++) if (p[j] < p[i]) smaller++;
    r += smaller * FACT[n - 1 - i];
  }
  return r;
}
function permUnrank(r: number, n: number): number[] {
  const items = Array.from({ length: n }, (_, i) => i);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const f = FACT[n - 1 - i];
    const q = Math.floor(r / f);
    r %= f;
    out.push(items.splice(q, 1)[0]);
  }
  return out;
}
const getCornerPerm = (c: CubieCube) => permRank(c.cp);
const getUDEdgePerm = (c: CubieCube) => permRank(c.ep.slice(0, 8));
const getSlicePerm = (c: CubieCube) => permRank(c.ep.slice(8, 12).map((e) => e - 8));

// ------------------------------------------------------------ tables
const N_TWIST = 2187, N_FLIP = 2048, N_SLICE = 495, N_CPERM = 40320, N_EPERM = 40320, N_SPERM = 24;
const PHASE2_MOVES = [0, 1, 2, 4, 7, 9, 10, 11, 13, 16]; // U1 U2 U3 R2 F2 D1 D2 D3 L2 B2

interface Tables {
  twistMove: Uint16Array;
  flipMove: Uint16Array;
  sliceMove: Uint16Array;
  cpermMove: Uint16Array;
  cperm2Move: Uint16Array; // corner permutation, indexed by phase-2 move slot
  epermMove: Uint16Array; // indexed by phase-2 move slot
  spermMove: Uint8Array; // indexed by phase-2 move slot
  pruneSliceTwist: Int8Array;
  pruneSliceFlip: Int8Array;
  pruneSpermCperm: Int8Array;
  pruneSpermEperm: Int8Array;
  sliceGoal: number;
}

let tables: Tables | null = null;

function buildMoveTable(n: number, moves: number[], set: (c: CubieCube, i: number) => void, get: (c: CubieCube) => number) {
  const t = new Uint16Array(n * moves.length);
  for (let i = 0; i < n; i++) {
    const c = identityCube();
    set(c, i);
    for (let k = 0; k < moves.length; k++) t[i * moves.length + k] = get(multiply(c, MOVE_CUBES[moves[k]]));
  }
  return t;
}

function buildPrune(n1: number, n2: number, m1: Uint16Array | Uint8Array, m2: Uint16Array, nMoves: number, goal1: number, goal2: number) {
  const size = n1 * n2;
  const prune = new Int8Array(size).fill(-1);
  prune[goal1 * n2 + goal2] = 0;
  let filled = 1;
  let depth = 0;
  while (filled < size) {
    let changed = 0;
    for (let i = 0; i < size; i++) {
      if (prune[i] !== depth) continue;
      const a = Math.floor(i / n2);
      const b = i % n2;
      for (let k = 0; k < nMoves; k++) {
        const j = m1[a * nMoves + k] * n2 + m2[b * nMoves + k];
        if (prune[j] === -1) {
          prune[j] = depth + 1;
          changed++;
        }
      }
    }
    if (!changed) break;
    filled += changed;
    depth++;
  }
  return prune;
}

export function initKociemba(): void {
  if (tables) return;
  const all = Array.from({ length: 18 }, (_, i) => i);
  const twistMove = buildMoveTable(N_TWIST, all, setTwist, getTwist);
  const flipMove = buildMoveTable(N_FLIP, all, setFlip, getFlip);
  const sliceMove = buildMoveTable(N_SLICE, all, setSlice, getSlice);
  const cpermMove = buildMoveTable(N_CPERM, all, (c, i) => (c.cp = permUnrank(i, 8)), getCornerPerm);
  const epermMove = buildMoveTable(
    N_EPERM,
    PHASE2_MOVES,
    (c, i) => (c.ep = [...permUnrank(i, 8), 8, 9, 10, 11]),
    getUDEdgePerm,
  );
  const spermMove8 = buildMoveTable(
    N_SPERM,
    PHASE2_MOVES,
    (c, i) => (c.ep = [0, 1, 2, 3, 4, 5, 6, 7, ...permUnrank(i, 4).map((e) => e + 8)]),
    getSlicePerm,
  );
  const spermMove = Uint8Array.from(spermMove8);
  const solved = identityCube();
  const sliceGoal = getSlice(solved);

  const pruneSliceTwist = buildPrune(N_SLICE, N_TWIST, sliceMove, twistMove, 18, sliceGoal, 0);
  const pruneSliceFlip = buildPrune(N_SLICE, N_FLIP, sliceMove, flipMove, 18, sliceGoal, 0);
  // Phase-2 corner move table restricted to the phase-2 moves.
  const cperm2 = new Uint16Array(N_CPERM * PHASE2_MOVES.length);
  for (let i = 0; i < N_CPERM; i++)
    for (let k = 0; k < PHASE2_MOVES.length; k++) cperm2[i * PHASE2_MOVES.length + k] = cpermMove[i * 18 + PHASE2_MOVES[k]];
  const pruneSpermCperm = buildPrune(N_SPERM, N_CPERM, spermMove, cperm2, PHASE2_MOVES.length, 0, 0);
  const pruneSpermEperm = buildPrune(N_SPERM, N_EPERM, spermMove, epermMove, PHASE2_MOVES.length, 0, 0);
  tables = {
    twistMove,
    flipMove,
    sliceMove,
    cpermMove,
    epermMove,
    cperm2Move: cperm2,
    spermMove,
    pruneSliceTwist,
    pruneSliceFlip,
    pruneSpermCperm,
    pruneSpermEperm,
    sliceGoal,
  };
}

const FACE_OF = (m: number) => Math.floor(m / 3);
/** Disallow same face twice and enforce an order on commuting opposite faces. */
function allowedAfter(prev: number, m: number): boolean {
  if (prev < 0) return true;
  const pf = FACE_OF(prev);
  const f = FACE_OF(m);
  if (pf === f) return false;
  if (pf % 3 === f % 3 && pf > f) return false; // opposite faces: only U before D etc.
  return true;
}

export interface SolveOptions {
  /** Stop improving once a solution of this length or shorter is found. */
  targetLength?: number;
  /** Time budget for improving the solution (ms). */
  timeLimitMs?: number;
}

/** Solve a cubie cube, returning move indices (face * 3 + power - 1). */
export function solveCubie(cube: CubieCube, opts: SolveOptions = {}): number[] {
  const problem = verifyCubie(cube);
  if (problem) throw new Error(`Unsolvable 3x3 state (${problem})`);
  initKociemba();
  const T = tables!;
  const target = opts.targetLength ?? 20;
  const deadline = Date.now() + (opts.timeLimitMs ?? 400);

  const twist0 = getTwist(cube);
  const flip0 = getFlip(cube);
  const slice0 = getSlice(cube);

  let best: number[] | null = null;
  let maxTotal = 30;
  const path1: number[] = [];
  const path2: number[] = [];
  let nodes = 0;
  let timeUp = false;

  const phase2 = (cp: number, ep: number, sp: number, depth: number, limit: number, prev: number): boolean => {
    if (depth === limit) return cp === 0 && ep === 0 && sp === 0;
    const h = Math.max(T.pruneSpermCperm[sp * N_CPERM + cp], T.pruneSpermEperm[sp * N_EPERM + ep]);
    if (h > limit - depth) return false;
    for (let k = 0; k < PHASE2_MOVES.length; k++) {
      const m = PHASE2_MOVES[k];
      if (!allowedAfter(prev, m)) continue;
      path2.push(m);
      if (
        phase2(
          T.cperm2Move[cp * 10 + k],
          T.epermMove[ep * 10 + k],
          T.spermMove[sp * 10 + k],
          depth + 1,
          limit,
          m,
        )
      )
        return true;
      path2.pop();
    }
    return false;
  };

  const startPhase2 = (): boolean => {
    let c = cube;
    for (const m of path1) c = applyMoveIndex(c, m);
    const cp = getCornerPerm(c);
    const ep = getUDEdgePerm(c);
    const sp = getSlicePerm(c);
    const prev = path1.length ? path1[path1.length - 1] : -1;
    const maxDepth2 = Math.min(maxTotal - 1 - path1.length, 18);
    for (let d2 = 0; d2 <= maxDepth2; d2++) {
      path2.length = 0;
      if (phase2(cp, ep, sp, 0, d2, prev)) {
        best = [...path1, ...path2];
        maxTotal = best.length;
        return true;
      }
    }
    return false;
  };

  const phase1 = (tw: number, fl: number, sl: number, depth: number, limit: number, prev: number): boolean => {
    if ((++nodes & 1023) === 0 && best && Date.now() > deadline) {
      timeUp = true;
      return true;
    }
    if (depth === limit) {
      if (tw !== 0 || fl !== 0 || sl !== T.sliceGoal) return false;
      // The last phase-1 move must not be a phase-2 move (otherwise this is a
      // duplicate of a shorter phase-1 solution).
      if (prev >= 0 && PHASE2_MOVES.includes(prev) && depth > 0) return false;
      if (startPhase2() && best!.length <= target) return true;
      return false;
    }
    const h = Math.max(T.pruneSliceTwist[sl * N_TWIST + tw], T.pruneSliceFlip[sl * N_FLIP + fl]);
    if (h > limit - depth) return false;
    for (let m = 0; m < 18; m++) {
      if (!allowedAfter(prev, m)) continue;
      path1.push(m);
      if (phase1(T.twistMove[tw * 18 + m], T.flipMove[fl * 18 + m], T.sliceMove[sl * 18 + m], depth + 1, limit, m)) return true;
      path1.pop();
    }
    return false;
  };

  for (let d1 = 0; d1 < maxTotal && !timeUp; d1++) {
    path1.length = 0;
    if (phase1(twist0, flip0, slice0, 0, d1, -1)) break;
  }
  if (!best) throw new Error("3x3 search failed");
  return best;
}

export const FACE_LETTERS = "URFDLB";
export function moveIndexToString(m: number): string {
  return FACE_LETTERS[FACE_OF(m)] + ["", "2", "'"][m % 3];
}
