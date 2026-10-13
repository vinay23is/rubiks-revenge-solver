import { FACES, STICKER_COUNT, buildLayerTurn } from "./geometry";

/**
 * Move notation (WCA / SiGN compatible):
 *   R  R'  R2      outer layer
 *   Rw Rw' Rw2     wide turn (two outer layers); lowercase `r` is accepted as an alias (SiGN)
 *   2R 2R' 2R2     inner slice only (second layer)
 *   x  y  z        whole-cube rotations (follow R, U and F respectively)
 */
export type MoveKind = "outer" | "wide" | "slice" | "rotation";

export interface Move {
  /** Face the move is named after (0..5 = U R F D L B). Rotations use R (x), U (y), F (z). */
  face: number;
  kind: MoveKind;
  /** Quarter turns clockwise: 1, 2 or 3. */
  amount: 1 | 2 | 3;
}

const KIND_LAYERS: Record<MoveKind, number> = { outer: 0b0001, wide: 0b0011, slice: 0b0010, rotation: 0b1111 };
const ROTATION_NAMES: Record<number, string> = { 1: "x", 0: "y", 2: "z" };
const ROTATION_FACES: Record<string, number> = { x: 1, y: 0, z: 2 };

export function moveLayers(m: Move): number {
  return KIND_LAYERS[m.kind];
}

export function formatMove(m: Move): string {
  const suffix = m.amount === 1 ? "" : m.amount === 2 ? "2" : "'";
  const f = FACES[m.face];
  switch (m.kind) {
    case "outer":
      return f + suffix;
    case "wide":
      return f + "w" + suffix;
    case "slice":
      return "2" + f + suffix;
    case "rotation":
      return ROTATION_NAMES[m.face] + suffix;
  }
}

export function formatMoves(ms: readonly Move[]): string {
  return ms.map(formatMove).join(" ");
}

const TOKEN = /^(2)?([URFDLBurfdlbxyz])(w)?(2|'|2'|’)?$/;

export function parseMove(token: string): Move {
  const t = token.trim();
  const m = TOKEN.exec(t);
  if (!m) throw new Error(`Invalid move "${token}"`);
  const [, slice, letter, w, suf] = m;
  const amount: 1 | 2 | 3 = suf === "2" || suf === "2'" ? 2 : suf === "'" || suf === "’" ? 3 : 1;
  if ("xyz".includes(letter)) {
    if (slice || w) throw new Error(`Invalid move "${token}"`);
    return { face: ROTATION_FACES[letter], kind: "rotation", amount };
  }
  const lower = letter === letter.toLowerCase();
  const face = FACES.indexOf(letter.toUpperCase() as (typeof FACES)[number]);
  if (slice) {
    if (w || lower) throw new Error(`Invalid move "${token}"`);
    return { face, kind: "slice", amount };
  }
  if (w && lower) throw new Error(`Invalid move "${token}"`);
  return { face, kind: w || lower ? "wide" : "outer", amount };
}

export function parseMoves(text: string): Move[] {
  return text
    .replace(/[()[\],]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map(parseMove);
}

export function invertMove(m: Move): Move {
  return { ...m, amount: (4 - m.amount) as 1 | 2 | 3 };
}

export function invertMoves(ms: readonly Move[]): Move[] {
  return ms.map(invertMove).reverse();
}

const destCache = new Map<string, Int16Array>();

/** dest[i] = where sticker i ends up after the move. */
export function moveDest(m: Move): Int16Array {
  const key = `${m.face}${m.kind}${m.amount}`;
  let d = destCache.get(key);
  if (!d) {
    d = buildLayerTurn(m.face, moveLayers(m), m.amount);
    destCache.set(key, d);
  }
  return d;
}

export function applyMove<T extends ArrayLike<number>>(state: T, m: Move): Uint8Array {
  const d = moveDest(m);
  const out = new Uint8Array(STICKER_COUNT);
  for (let i = 0; i < STICKER_COUNT; i++) out[d[i]] = state[i];
  return out;
}

export function applyMoves(state: ArrayLike<number>, ms: readonly Move[]): Uint8Array {
  let s: Uint8Array = Uint8Array.from(state as ArrayLike<number>);
  for (const m of ms) s = applyMove(s, m);
  return s;
}

// ---------------------------------------------------------------------------
// Simplification: all turns about the same axis commute, so a run of same-axis
// moves is reduced to a per-layer rotation vector and re-expressed with the
// unique minimal combination of outer and wide turns (no rotations introduced).

const AXIS_OF_FACE = [1, 0, 2, 1, 0, 2]; // y x z y x z  (index: 0=x 1=y 2=z)
const POSITIVE_FACE_OF_AXIS = [1, 0, 2]; // R U F
const NEGATIVE_FACE_OF_AXIS = [4, 3, 5]; // L D B

export function moveAxis(m: Move): number {
  return AXIS_OF_FACE[m.face];
}

function layerVector(m: Move): number[] {
  const v = [0, 0, 0, 0];
  const mask = moveLayers(m);
  const positive = m.face === POSITIVE_FACE_OF_AXIS[AXIS_OF_FACE[m.face]];
  for (let k = 0; k < 4; k++) {
    if (mask & (1 << k)) {
      const idx = positive ? k : 3 - k;
      v[idx] = positive ? m.amount : 4 - m.amount;
    }
  }
  return v;
}

function vectorToMoves(axis: number, v: number[]): Move[] {
  const out: Move[] = [];
  const pos = POSITIVE_FACE_OF_AXIS[axis];
  const neg = NEGATIVE_FACE_OF_AXIS[axis];
  const md = (a: number) => ((a % 4) + 4) % 4;
  const push = (face: number, kind: MoveKind, amt: number) => {
    const a = md(amt);
    if (a) out.push({ face, kind, amount: a as 1 | 2 | 3 });
  };
  // Positive side: layer2 comes only from the wide move, layer1 = wide + outer.
  push(pos, "wide", v[1]);
  push(pos, "outer", v[0] - v[1]);
  // Negative side (amounts measured in the positive direction, negate).
  push(neg, "wide", -v[2]);
  push(neg, "outer", -(v[3] - v[2]));
  return out;
}

/** Merge and cancel adjacent same-axis turns. Never increases the move count. */
export function simplifyMoves(ms: readonly Move[]): Move[] {
  const out: Move[] = [];
  let i = 0;
  while (i < ms.length) {
    if (ms[i].kind === "rotation" || ms[i].kind === "slice") {
      out.push(ms[i]);
      i++;
      continue;
    }
    const axis = moveAxis(ms[i]);
    const v = [0, 0, 0, 0];
    let j = i;
    while (j < ms.length && ms[j].kind !== "rotation" && ms[j].kind !== "slice" && moveAxis(ms[j]) === axis) {
      const lv = layerVector(ms[j]);
      for (let k = 0; k < 4; k++) v[k] = (v[k] + lv[k]) % 4;
      j++;
    }
    const merged = vectorToMoves(axis, v);
    // Merging might in principle rewrite a run; keep whichever is shorter.
    out.push(...(merged.length <= j - i ? merged : ms.slice(i, j)));
    i = j;
  }
  // A merge can make new neighbours adjacent; repeat until stable.
  return out.length < ms.length ? simplifyMoves(out) : out;
}

/** The 36 turns the solver may output: outer and wide turns of every face, all powers. */
export const SOLVER_MOVES: Move[] = [];
for (let f = 0; f < 6; f++)
  for (const kind of ["outer", "wide"] as const)
    for (const amount of [1, 2, 3] as const) SOLVER_MOVES.push({ face: f, kind, amount });

export function sameMove(a: Move, b: Move): boolean {
  return a.face === b.face && a.kind === b.kind && a.amount === b.amount;
}
