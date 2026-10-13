/**
 * Geometry of the 4x4x4 cube.
 *
 * Every one of the 96 stickers is given a 3D position on the cube surface and a
 * face normal. Moves are then derived by literally rotating those points, which
 * guarantees that every transformation (outer, inner slice, wide, rotation) is
 * geometrically correct instead of relying on hand-typed permutation tables.
 *
 * Coordinates are doubled so that everything stays integral:
 *   cubie layer coordinates are -3, -1, 1, 3 and the surface sits at +/-4.
 *
 * Sticker index = face * 16 + row * 4 + col, with faces ordered U R F D L B.
 * Each face is laid out as seen when looking straight at it in the standard
 * "net" orientation:
 *   U: looking down, B edge at the top        F: looking at front, U at top
 *   R: looking at right, U at top, F on left   B: looking at back, U at top
 *   L: looking at left, U at top, B on left    D: looking up, F edge at the top
 */

export type Vec3 = readonly [number, number, number];

export const FACES = ["U", "R", "F", "D", "L", "B"] as const;
export type FaceName = (typeof FACES)[number];
export const U = 0, R = 1, F = 2, D = 3, L = 4, B = 5;

export const N = 4;
export const STICKERS_PER_FACE = 16;
export const STICKER_COUNT = 96;

export const FACE_NORMALS: readonly Vec3[] = [
  [0, 1, 0], // U
  [1, 0, 0], // R
  [0, 0, 1], // F
  [0, -1, 0], // D
  [-1, 0, 0], // L
  [0, 0, -1], // B
];

export function stickerIndex(face: number, row: number, col: number): number {
  return face * 16 + row * 4 + col;
}

export function stickerFace(i: number): number {
  return Math.floor(i / 16);
}

/** Surface point of a sticker in doubled coordinates. */
export function stickerPoint(face: number, row: number, col: number): Vec3 {
  const a = -3 + 2 * col;
  const b = 3 - 2 * row;
  switch (face) {
    case U:
      return [a, 4, -3 + 2 * row];
    case R:
      return [4, b, 3 - 2 * col];
    case F:
      return [a, b, 4];
    case D:
      return [a, -4, 3 - 2 * row];
    case L:
      return [-4, b, -3 + 2 * col];
    case B:
      return [3 - 2 * col, b, -4];
    default:
      throw new Error(`bad face ${face}`);
  }
}

/** Position of the cubie that carries the sticker (surface coordinate clamped to the layer). */
export function cubiePoint(p: Vec3): Vec3 {
  const c = (v: number) => (v === 4 ? 3 : v === -4 ? -3 : v);
  return [c(p[0]), c(p[1]), c(p[2])];
}

export const STICKER_POINTS: Vec3[] = [];
for (let f = 0; f < 6; f++)
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) STICKER_POINTS.push(stickerPoint(f, r, c));

const pointKey = (p: Vec3) => `${p[0]},${p[1]},${p[2]}`;
const POINT_TO_STICKER = new Map<string, number>();
STICKER_POINTS.forEach((p, i) => POINT_TO_STICKER.set(pointKey(p), i));

export function stickerAt(p: Vec3): number {
  const i = POINT_TO_STICKER.get(pointKey(p));
  if (i === undefined) throw new Error(`no sticker at ${pointKey(p)}`);
  return i;
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/** Rotate p by 90 degrees clockwise as seen from the tip of the unit axis n. */
export function rotateCW(p: Vec3, n: Vec3): Vec3 {
  const c = cross(n, p);
  const d = dot(n, p);
  return [-c[0] + n[0] * d, -c[1] + n[1] * d, -c[2] + n[2] * d];
}

/**
 * Layer depth (1..4) of a sticker relative to a face: 1 is the outer layer of
 * that face, 4 is the opposite outer layer.
 */
export function layerDepth(stickerIdx: number, face: number): number {
  const d = dot(cubiePoint(STICKER_POINTS[stickerIdx]), FACE_NORMALS[face]);
  return (3 - d) / 2 + 1;
}

/**
 * Build the sticker permutation for turning the given layers (bitmask, bit k =
 * depth k+1) of a face clockwise `quarter` times. Returned array `dest` maps a
 * sticker index to the index it moves to.
 */
export function buildLayerTurn(face: number, layerMask: number, quarter: number): Int16Array {
  const n = FACE_NORMALS[face];
  const dest = new Int16Array(STICKER_COUNT);
  for (let i = 0; i < STICKER_COUNT; i++) {
    const depth = layerDepth(i, face);
    if (layerMask & (1 << (depth - 1))) {
      let p = STICKER_POINTS[i];
      for (let q = 0; q < quarter; q++) p = rotateCW(p, n);
      dest[i] = stickerAt(p);
    } else {
      dest[i] = i;
    }
  }
  return dest;
}
