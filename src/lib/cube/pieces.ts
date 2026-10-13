import {
  B,
  D,
  F,
  FACE_NORMALS,
  L,
  R,
  STICKER_COUNT,
  U,
  Vec3,
  buildLayerTurn,
  cross,
  dot,
  stickerAt,
  stickerFace,
} from "./geometry";

/**
 * Piece structure of the 4x4x4:
 *   24 center stickers (4 per face, indistinguishable within a colour)
 *   24 wing edges (2 per edge slot, each wing has a fixed orientation per position)
 *    8 corners
 */

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

export const CENTER_STICKERS: number[] = [];
for (let f = 0; f < 6; f++)
  for (const r of [1, 2]) for (const c of [1, 2]) CENTER_STICKERS.push(f * 16 + r * 4 + c);

/** Map sticker index -> center slot (0..23) or -1. */
export const CENTER_SLOT = new Int8Array(STICKER_COUNT).fill(-1);
CENTER_STICKERS.forEach((s, i) => (CENTER_SLOT[s] = i));

// ---------------------------------------------------------------- corners
/** Kociemba corner order: URF UFL ULB UBR DFR DLF DBL DRB. */
export const CORNER_NAMES = ["URF", "UFL", "ULB", "UBR", "DFR", "DLF", "DBL", "DRB"];
const CORNER_CUBIES: Vec3[] = [
  [3, 3, 3],
  [-3, 3, 3],
  [-3, 3, -3],
  [3, 3, -3],
  [3, -3, 3],
  [-3, -3, 3],
  [-3, -3, -3],
  [3, -3, -3],
];

/**
 * Sticker indices for each corner, starting with the U/D sticker and continuing
 * clockwise when looking at the corner from outside.
 */
export const CORNER_STICKERS: number[][] = CORNER_CUBIES.map((c) => {
  const faces = [0, 1, 2, 3, 4, 5].filter((f) => dot(FACE_NORMALS[f], c) === 3);
  const ud = faces.find((f) => f === U || f === D)!;
  const others = faces.filter((f) => f !== ud);
  let [f2, f3] = others;
  if (dot(cross(FACE_NORMALS[ud], FACE_NORMALS[f2]), c) > 0) [f2, f3] = [f3, f2];
  return [ud, f2, f3].map((f) => stickerAt(add(c, FACE_NORMALS[f])));
});

/** Faces of each corner in the same order as CORNER_STICKERS. */
export const CORNER_FACES: number[][] = CORNER_STICKERS.map((s) => s.map(stickerFace));

// ---------------------------------------------------------------- edges / wings
/** Kociemba edge order. Each slot is a face pair (f1, f2). */
export const EDGE_NAMES = ["UR", "UF", "UL", "UB", "DR", "DF", "DL", "DB", "FR", "FL", "BL", "BR"];
export const EDGE_FACES: [number, number][] = [
  [U, R], [U, F], [U, L], [U, B],
  [D, R], [D, F], [D, L], [D, B],
  [F, R], [F, L], [B, L], [B, R],
];

/** For every slot the two wing positions; wing index = slot * 2 + k. */
export const WING_COUNT = 24;
/** Sticker pair (a, b) per wing position, oriented consistently (moves map a -> a). */
export const WING_STICKERS: [number, number][] = [];
/** Raw stickers on (f1, f2) of each wing, used as a starting point for orientation labelling. */
const rawWings: [number, number][] = [];
for (const [f1, f2] of EDGE_FACES) {
  const n1 = FACE_NORMALS[f1];
  const n2 = FACE_NORMALS[f2];
  const free = [0, 1, 2].find((k) => n1[k] === 0 && n2[k] === 0)!;
  for (const t of [-1, 1]) {
    const c: number[] = [0, 0, 0];
    for (let k = 0; k < 3; k++) c[k] = 3 * n1[k] + 3 * n2[k];
    c[free] = t;
    const cv = c as unknown as Vec3;
    rawWings.push([stickerAt(add(cv, n1)), stickerAt(add(cv, n2))]);
  }
}

export const WING_OF_STICKER = new Int8Array(STICKER_COUNT).fill(-1);
rawWings.forEach(([a, b], w) => {
  WING_OF_STICKER[a] = w;
  WING_OF_STICKER[b] = w;
});

export const SLOT_OF_WING = (w: number) => w >> 1;
export const PARTNER_WING = (w: number) => w ^ 1;

// Propagate a consistent orientation: a wing can never be flipped in place, so
// the image of sticker "a" under any move is again an "a" sticker.
(() => {
  const generators: Int16Array[] = [];
  for (let f = 0; f < 6; f++) for (const mask of [1, 2]) generators.push(buildLayerTurn(f, mask, 1));
  const label: ([number, number] | null)[] = new Array(WING_COUNT).fill(null);
  label[0] = rawWings[0];
  const queue = [0];
  while (queue.length) {
    const w = queue.shift()!;
    const [a, b] = label[w]!;
    for (const g of generators) {
      const na = g[a];
      const nb = g[b];
      const nw = WING_OF_STICKER[na];
      if (label[nw] === null) {
        label[nw] = [na, nb];
        queue.push(nw);
      } else if (label[nw]![0] !== na) {
        throw new Error("Inconsistent wing orientation");
      }
    }
  }
  for (let w = 0; w < WING_COUNT; w++) WING_STICKERS.push(label[w]!);
})();

export const ALL_FACES = [U, R, F, D, L, B];
