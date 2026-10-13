import { CENTER_SLOT, CENTER_STICKERS, WING_OF_STICKER, WING_STICKERS } from "../cube/pieces";
import { Move, SOLVER_MOVES, moveDest } from "../cube/moves";

/**
 * Center solving in three exact stages (each stage's pruning table is a full
 * breadth-first search of its state space, so the table value is the true
 * distance and the stage is solved optimally by walking downhill).
 *
 *  Stage 1 — put the 8 centers of the chosen U/D colour pair on the U and D faces.
 *            State: which 8 of the 24 center slots hold a U/D colour (C(24,8) = 735,471).
 *            Moves: all 36 outer/wide turns.
 *  Stage 2 — put the 8 L/R centers on L and R, and fix the wing permutation parity.
 *            State: 8 of 16 side slots x wing parity (12,870 x 2).
 *            Moves: all outer turns, Uw and Dw (all powers), half turns of the other wide layers.
 *            (Without side-face quarter turns the side centers would split into two orbits.)
 *            Wing parity (= the "OLL parity" of the reduction method) only changes on
 *            quarter turns of an inner layer, i.e. on wide quarter turns, so including it
 *            here guarantees the reduced 3x3x3 never shows OLL parity.
 *  Stage 3 — separate each opposite pair so every face is a single colour.
 *            State: 70^3 = 343,000 (4 of 8 slots per axis).
 *            Moves: all outer turns plus half turns of the six wide layers.
 *
 * Center slots are numbered 0..23 in face order U R F D L B (4 per face).
 */

export const SLOT_FACE = (slot: number) => slot >> 2;

/** Center-slot destination maps for the 36 solver moves. */
export const CENTER_DEST: Uint8Array[] = SOLVER_MOVES.map((m) => {
  const d = moveDest(m);
  return Uint8Array.from(CENTER_STICKERS.map((s) => CENTER_SLOT[d[s]]));
});

/** 1 when the move changes the parity of the wing permutation. */
export const WING_PARITY_FLIP: Uint8Array = Uint8Array.from(
  SOLVER_MOVES.map((m) => {
    const d = moveDest(m);
    const perm = WING_STICKERS.map(([a]) => WING_OF_STICKER[d[a]]);
    return permutationParity(perm);
  }),
);

export function permutationParity(p: ArrayLike<number>): number {
  const n = p.length;
  const seen = new Uint8Array(n);
  let parity = 0;
  for (let i = 0; i < n; i++) {
    if (seen[i]) continue;
    let len = 0;
    for (let j = i; !seen[j]; j = p[j]) {
      seen[j] = 1;
      len++;
    }
    if (len % 2 === 0) parity ^= 1;
  }
  return parity;
}

// ------------------------------------------------------------ bit tricks
const POP8 = new Uint8Array(256);
for (let i = 1; i < 256; i++) POP8[i] = (i & 1) + POP8[i >> 1];

const BINOM: number[][] = [];
for (let n = 0; n <= 24; n++) {
  BINOM.push([]);
  for (let k = 0; k <= 24; k++) BINOM[n].push(k === 0 ? 1 : n === 0 ? 0 : BINOM[n - 1][k - 1] + (BINOM[n - 1][k] ?? 0));
}

/** Byte-wise lookup tables mapping a 24-bit slot mask through a move. */
const MASK_MOVE: Uint32Array[][] = CENTER_DEST.map((dest) =>
  [0, 1, 2].map((byte) => {
    const t = new Uint32Array(256);
    for (let v = 0; v < 256; v++) {
      let out = 0;
      for (let b = 0; b < 8; b++) if (v & (1 << b)) out |= 1 << dest[byte * 8 + b];
      t[v] = out >>> 0;
    }
    return t;
  }),
);

export function moveMask(mask: number, m: number): number {
  const t = MASK_MOVE[m];
  return (t[0][mask & 255] | t[1][(mask >>> 8) & 255] | t[2][(mask >>> 16) & 255]) >>> 0;
}

/** Colex rank of an n-bit mask with k bits set (n <= 24). */
function rankMask(mask: number): number {
  let r = 0;
  let k = 0;
  while (mask) {
    const low = mask & -mask;
    const p = 31 - Math.clz32(low);
    k++;
    r += BINOM[p][k];
    mask ^= low;
  }
  return r;
}

/** Enumerate all masks of n bits with k set, in colex order (index = rank). */
function allMasks(n: number, k: number): Uint32Array {
  const out = new Uint32Array(BINOM[n][k]);
  let v = (1 << k) - 1;
  for (let i = 0; i < out.length; i++) {
    out[i] = v;
    const t = (v | (v - 1)) + 1;
    v = t | ((((t & -t) / (v & -v)) >> 1) - 1);
  }
  return out;
}

// Fast rank for 24-bit / 8-bit-set masks used in stage 1.
const RANK_BYTE: Uint32Array[][] = [0, 1, 2].map((byte) =>
  Array.from({ length: 9 }, (_, before) => {
    const t = new Uint32Array(256);
    for (let v = 0; v < 256; v++) {
      let r = 0;
      let k = before;
      for (let b = 0; b < 8; b++)
        if (v & (1 << b)) {
          k++;
          r += k <= 24 ? BINOM[byte * 8 + b][k] : 0;
        }
      t[v] = r;
    }
    return t;
  }),
);
function rank24(mask: number): number {
  const b0 = mask & 255, b1 = (mask >>> 8) & 255, b2 = (mask >>> 16) & 255;
  const c0 = POP8[b0];
  const c1 = c0 + POP8[b1];
  if (c1 > 8) return -1;
  return RANK_BYTE[0][0][b0] + RANK_BYTE[1][c0][b1] + RANK_BYTE[2][c1][b2];
}

// ------------------------------------------------------------ masks / compressions
const faceMask = (...faces: number[]) => faces.reduce((m, f) => m | (0xf << (f * 4)), 0) >>> 0;
const F_U = 0, F_R = 1, F_F = 2, F_D = 3, F_L = 4, F_B = 5;

/** Side slots (R F L B) are bits 4..11 and 16..23. */
const sideCompress = (m: number) => ((m >>> 4) & 0xff) | (((m >>> 16) & 0xff) << 8);
const sideExpand = (c: number) => (((c & 0xff) << 4) | (((c >>> 8) & 0xff) << 16)) >>> 0;

const pair8 = (m: number, fa: number, fb: number) => ((m >>> (fa * 4)) & 0xf) | (((m >>> (fb * 4)) & 0xf) << 4);
const unpair8 = (c: number, fa: number, fb: number) => (((c & 0xf) << (fa * 4)) | (((c >>> 4) & 0xf) << (fb * 4))) >>> 0;

// ------------------------------------------------------------ move sets
const isWideOrOuterOf = (m: Move, faces: number[]) => faces.includes(m.face);
export const STAGE2_MOVES: number[] = SOLVER_MOVES.map((m, i) => [m, i] as const)
  .filter(([m]) => m.kind === "outer" || isWideOrOuterOf(m, [F_U, F_D]) || m.amount === 2)
  .map(([, i]) => i);
export const STAGE3_MOVES: number[] = SOLVER_MOVES.map((m, i) => [m, i] as const)
  .filter(([m]) => m.kind === "outer" || m.amount === 2)
  .map(([, i]) => i);

// ------------------------------------------------------------ tables
export interface CenterTables {
  stage1: Int8Array;
  stage2: Int8Array;
  stage3: Int8Array;
}

let cached: CenterTables | null = null;

function bfs(size: number, goals: number[], neighbours: (idx: number, visit: (j: number) => void) => void): Int8Array {
  const dist = new Int8Array(size).fill(-1);
  let frontier = new Int32Array(goals);
  for (const g of goals) dist[g] = 0;
  let depth = 0;
  while (frontier.length) {
    const next: number[] = [];
    const d1 = depth + 1;
    for (let i = 0; i < frontier.length; i++) {
      neighbours(frontier[i], (j) => {
        if (dist[j] === -1) {
          dist[j] = d1;
          next.push(j);
        }
      });
    }
    frontier = Int32Array.from(next);
    depth++;
  }
  return dist;
}

const MASKS_24_8 = () => allMasks(24, 8);
const MASKS_16_8 = allMasks(16, 8);
const MASKS_8_4 = allMasks(8, 4);
const RANK8 = new Int16Array(256).fill(-1);
MASKS_8_4.forEach((m, i) => (RANK8[m] = i));
const RANK16 = new Int32Array(65536).fill(-1);
MASKS_16_8.forEach((m, i) => (RANK16[m] = i));

export const STAGE1_GOAL_MASK = faceMask(F_U, F_D);
export const STAGE2_GOAL_MASK = faceMask(F_R, F_L);
export const STAGE3_GOAL_MASK = faceMask(F_U, F_R, F_F);

export function stage3Index(mask: number): number {
  return RANK8[pair8(mask, F_U, F_D)] * 4900 + RANK8[pair8(mask, F_R, F_L)] * 70 + RANK8[pair8(mask, F_F, F_B)];
}
function stage3Mask(idx: number): number {
  const a = Math.floor(idx / 4900), b = Math.floor(idx / 70) % 70, c = idx % 70;
  return (unpair8(MASKS_8_4[a], F_U, F_D) | unpair8(MASKS_8_4[b], F_R, F_L) | unpair8(MASKS_8_4[c], F_F, F_B)) >>> 0;
}
export function stage2Index(mask: number, parity: number): number {
  return RANK16[sideCompress(mask)] * 2 + parity;
}

export function getCenterTables(): CenterTables {
  if (cached) return cached;
  const masks24 = MASKS_24_8();
  const stage1 = bfs(masks24.length, [rank24(STAGE1_GOAL_MASK)], (idx, visit) => {
    const mask = masks24[idx];
    for (let m = 0; m < 36; m++) visit(rank24(moveMask(mask, m)));
  });
  const stage2 = bfs(MASKS_16_8.length * 2, [stage2Index(STAGE2_GOAL_MASK, 0)], (idx, visit) => {
    const mask = sideExpand(MASKS_16_8[idx >> 1]) | STAGE1_GOAL_MASK;
    const parity = idx & 1;
    for (const m of STAGE2_MOVES) visit(stage2Index(moveMask(mask, m), parity ^ WING_PARITY_FLIP[m]));
  });
  const stage3 = bfs(343000, [stage3Index(STAGE3_GOAL_MASK)], (idx, visit) => {
    const mask = stage3Mask(idx);
    for (const m of STAGE3_MOVES) visit(stage3Index(moveMask(mask, m)));
  });
  cached = { stage1, stage2, stage3 };
  return cached;
}

export function stage1Index(mask: number): number {
  return rank24(mask);
}

/** Build a 24-bit mask of center slots whose colour satisfies `pred`. */
export function centerMask(centerColors: ArrayLike<number>, pred: (c: number) => boolean): number {
  let m = 0;
  for (let i = 0; i < 24; i++) if (pred(centerColors[i])) m |= 1 << i;
  return m >>> 0;
}

export function readCenters(state: ArrayLike<number>): Uint8Array {
  return Uint8Array.from(CENTER_STICKERS.map((s) => state[s]));
}

export function moveCenters(c: Uint8Array, m: number): Uint8Array {
  const out = new Uint8Array(24);
  const d = CENTER_DEST[m];
  for (let i = 0; i < 24; i++) out[d[i]] = c[i];
  return out;
}

export { rankMask };
