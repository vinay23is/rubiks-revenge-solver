import { STICKER_COUNT } from "../cube/geometry";
import { Move, SOLVER_MOVES, formatMoves, invertMoves, moveDest, simplifyMoves } from "../cube/moves";
import { CENTER_SLOT, CENTER_STICKERS, CORNER_STICKERS, WING_OF_STICKER, WING_STICKERS } from "../cube/pieces";

/**
 * Generator for the library of wing-edge 3-cycles used by the edge-pairing
 * stage. Every entry is a move sequence that cycles exactly three wing
 * positions (piece at a -> b, b -> c, c -> a) and leaves all corners in place,
 * all other wings in place and every center on its own face (so solved centers
 * stay solved).
 *
 * Base cycles are found by exhaustively evaluating commutators [A, B] where A is
 * a wide or inner-slice quarter turn and B a sequence of up to three outer
 * turns. They are then extended to all 4,048 directed 3-cycles by conjugation
 * X C X'. Conjugating a cycle that fixes every center exactly by any move
 * sequence again fixes every center; cycles that only keep centers on their
 * faces are conjugated by outer turns only (outer turns map faces to faces).
 *
 * This runs offline (scripts/generate-wing-library.ts); the solver ships the
 * resulting table and the test-suite re-verifies every entry.
 */

type Perm = Int16Array;

const identity = (): Perm => Int16Array.from({ length: STICKER_COUNT }, (_, i) => i);

function compose(a: Perm, b: Perm): Perm {
  // first a then b
  const out = new Int16Array(STICKER_COUNT);
  for (let i = 0; i < STICKER_COUNT; i++) out[i] = b[a[i]];
  return out;
}
function inverse(a: Perm): Perm {
  const out = new Int16Array(STICKER_COUNT);
  for (let i = 0; i < STICKER_COUNT; i++) out[a[i]] = i;
  return out;
}
export function seqDest(ms: readonly Move[]): Perm {
  let d = identity();
  for (const m of ms) d = compose(d, moveDest(m));
  return d;
}

export type CycleClass = "pure" | "facewise";

/** Classify a sticker permutation; returns the wing cycle if it is a clean wing 3-cycle. */
export function classifyWingCycle(d: Perm): { cycle: [number, number, number]; cls: CycleClass } | null {
  for (const c of CORNER_STICKERS) for (const s of c) if (d[s] !== s) return null;
  let pure = true;
  for (const s of CENTER_STICKERS) {
    if (d[s] !== s) {
      pure = false;
      if (Math.floor(d[s] / 16) !== Math.floor(s / 16)) return null;
    }
  }
  const moved: number[] = [];
  for (let w = 0; w < 24; w++) {
    const [a, b] = WING_STICKERS[w];
    if (d[a] !== a) moved.push(w);
    // Orientation is forced, but double check the b sticker follows a.
    const dw = WING_OF_STICKER[d[a]];
    if (WING_STICKERS[dw][1] !== d[b]) return null;
  }
  if (moved.length !== 3) return null;
  const a = moved[0];
  const b = WING_OF_STICKER[d[WING_STICKERS[a][0]]];
  const c = WING_OF_STICKER[d[WING_STICKERS[b][0]]];
  if (WING_OF_STICKER[d[WING_STICKERS[c][0]]] !== a) return null;
  return { cycle: [a, b, c], cls: pure ? "pure" : "facewise" };
}

export function cycleKey(a: number, b: number, c: number): number {
  // rotate so the smallest element comes first
  if (a < b && a < c) return a * 576 + b * 24 + c;
  if (b < a && b < c) return b * 576 + c * 24 + a;
  return c * 576 + a * 24 + b;
}

export const ALL_CYCLE_COUNT = (24 * 23 * 22) / 3;

const OUTER = SOLVER_MOVES.filter((m) => m.kind === "outer");

function sequences(moves: Move[], maxLen: number): Move[][] {
  const out: Move[][] = [];
  const rec = (seq: Move[]) => {
    if (seq.length) out.push(seq);
    if (seq.length === maxLen) return;
    const last = seq[seq.length - 1];
    for (const m of moves) {
      if (last && last.face === m.face) continue;
      if (last && last.face % 3 === m.face % 3 && last.face > m.face) continue;
      rec([...seq, m]);
    }
  };
  rec([]);
  return out;
}

export function generateWingLibrary(opts: { setupDepth?: number; log?: (s: string) => void } = {}): Map<number, Move[]> {
  const log = opts.log ?? (() => {});
  const setupDepth = opts.setupDepth ?? 3;

  // A: wide quarter turns and inner-slice quarter turns (written with wide + outer turns).
  const As: Move[][] = [];
  for (let f = 0; f < 6; f++)
    for (const amount of [1, 3] as const) {
      As.push([{ face: f, kind: "wide", amount }]);
      As.push([
        { face: f, kind: "wide", amount },
        { face: f, kind: "outer", amount: (4 - amount) as 1 | 3 },
      ]);
    }
  const Bs = sequences(OUTER, 3);
  log(`evaluating ${As.length * Bs.length * 2} commutators`);

  const base = new Map<number, { moves: Move[]; cls: CycleClass; cycle: [number, number, number] }>();
  const consider = (moves: Move[], d: Perm) => {
    const r = classifyWingCycle(d);
    if (!r) return;
    const key = cycleKey(...r.cycle);
    const prev = base.get(key);
    const better = !prev || moves.length < prev.moves.length || (prev.cls === "facewise" && r.cls === "pure" && moves.length <= prev.moves.length);
    if (better) base.set(key, { moves, cls: r.cls, cycle: r.cycle });
  };
  for (const A of As) {
    const pa = seqDest(A);
    const pai = inverse(pa);
    for (const Bq of Bs) {
      const pb = seqDest(Bq);
      const pbi = inverse(pb);
      // A B A' B'
      consider([...A, ...Bq, ...invertMoves(A), ...invertMoves(Bq)], compose(compose(compose(pa, pb), pai), pbi));
      // B A B' A'
      consider([...Bq, ...A, ...invertMoves(Bq), ...invertMoves(A)], compose(compose(compose(pb, pa), pbi), pai));
    }
  }
  log(`found ${base.size} base cycles`);

  const best = new Map<number, Move[]>();
  for (const [key, b] of base) best.set(key, simplifyMoves(b.moves));

  const pureSetups = sequences(SOLVER_MOVES, setupDepth);
  const outerSetups = sequences(OUTER, setupDepth);
  const wingDestOf = (d: Perm) => Int8Array.from(WING_STICKERS.map(([a]) => WING_OF_STICKER[d[a]]));

  const setupInfo = (setups: Move[][]) =>
    setups.map((X) => {
      const wd = wingDestOf(seqDest(X));
      const inv = new Int8Array(24);
      for (let w = 0; w < 24; w++) inv[wd[w]] = w;
      return { X, inv };
    });
  const pureInfo = setupInfo(pureSetups);
  const outerInfo = setupInfo(outerSetups);

  for (const b of base.values()) {
    const info = b.cls === "pure" ? pureInfo : outerInfo;
    const [a, bb, c] = b.cycle;
    for (const { X, inv } of info) {
      const key = cycleKey(inv[a], inv[bb], inv[c]);
      const prev = best.get(key);
      const est = 2 * X.length + b.moves.length;
      if (prev && prev.length <= est - 4) continue; // cannot win even with maximal cancellation
      const seq = simplifyMoves([...X, ...b.moves, ...invertMoves(X)]);
      if (!prev || seq.length < prev.length) best.set(key, seq);
    }
  }
  log(`library covers ${best.size} / ${ALL_CYCLE_COUNT} directed 3-cycles`);
  return best;
}

export function serializeLibrary(lib: Map<number, Move[]>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of [...lib.keys()].sort((x, y) => x - y)) out[key] = formatMoves(lib.get(key)!);
  return out;
}

export { CENTER_SLOT };
