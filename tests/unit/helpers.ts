import { WING_STICKERS, CORNER_STICKERS } from "@/lib/cube/pieces";
import { CubeState } from "@/lib/cube/state";

/** Put wing piece currently at position `from` into `to` and vice versa (a pure wing swap). */
export function swapWings(s: CubeState, p: number, q: number): CubeState {
  const out = Uint8Array.from(s);
  const [a1, b1] = WING_STICKERS[p];
  const [a2, b2] = WING_STICKERS[q];
  out[a1] = s[a2];
  out[b1] = s[b2];
  out[a2] = s[a1];
  out[b2] = s[b1];
  return out;
}

/** Rotate the stickers of a corner in place (twist). */
export function twistCorner(s: CubeState, i: number, k = 1): CubeState {
  const out = Uint8Array.from(s);
  const st = CORNER_STICKERS[i];
  for (let j = 0; j < 3; j++) out[st[(j + k) % 3]] = s[st[j]];
  return out;
}

export function swapStickers(s: CubeState, a: number, b: number): CubeState {
  const out = Uint8Array.from(s);
  out[a] = s[b];
  out[b] = s[a];
  return out;
}

/** Re-label colours: colour c becomes map[c]. */
export function recolor(s: CubeState, map: number[]): CubeState {
  return s.map((c) => map[c]);
}
