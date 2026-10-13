import { stickerFace } from "./geometry";
import { Move, SOLVER_MOVES } from "./moves";
import { CENTER_STICKERS, CORNER_FACES, CORNER_STICKERS, WING_STICKERS } from "./pieces";
import { CubeState } from "./state";

/** Small deterministic PRNG (mulberry32) so randomized tests are repeatable. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rnd: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Uniformly random legal 4x4x4 position (standard colour scheme, face i = colour i).
 * Every combination of corner permutation, corner twist (sum 0 mod 3), wing
 * permutation and center arrangement is reachable on a 4x4x4.
 */
export function randomState(rnd: () => number = Math.random): CubeState {
  const s = new Uint8Array(96);
  const cp = shuffle([0, 1, 2, 3, 4, 5, 6, 7], rnd);
  const co = cp.map(() => Math.floor(rnd() * 3));
  co[7] = (3 - (co.slice(0, 7).reduce((a, b) => a + b, 0) % 3)) % 3;
  for (let i = 0; i < 8; i++)
    for (let k = 0; k < 3; k++) s[CORNER_STICKERS[i][(co[i] + k) % 3]] = CORNER_FACES[cp[i]][k];
  const wp = shuffle([...Array(24).keys()], rnd);
  for (let p = 0; p < 24; p++) {
    const [a, b] = WING_STICKERS[p];
    const [ha, hb] = WING_STICKERS[wp[p]];
    s[a] = stickerFace(ha);
    s[b] = stickerFace(hb);
  }
  const centers = shuffle(CENTER_STICKERS.map((x) => stickerFace(x)), rnd);
  CENTER_STICKERS.forEach((x, i) => (s[x] = centers[i]));
  return s;
}

/** Random sequence of outer/wide turns (no immediate same-layer repeats). */
export function randomMoves(n: number, rnd: () => number = Math.random): Move[] {
  const out: Move[] = [];
  while (out.length < n) {
    const m = SOLVER_MOVES[Math.floor(rnd() * SOLVER_MOVES.length)];
    const last = out[out.length - 1];
    if (last && last.face === m.face && last.kind === m.kind) continue;
    out.push(m);
  }
  return out;
}
