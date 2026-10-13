import { STICKER_COUNT } from "./geometry";

/**
 * A cube state is 96 sticker colours (index = face * 16 + row * 4 + col).
 * Colours are palette indices 0..5; EMPTY marks a sticker the user has not
 * painted yet. Palette index i is the colour of face i in the default
 * (white-top, green-front) orientation, but the solver never assumes a
 * particular colour scheme — it derives it from the corners.
 */
export type CubeState = Uint8Array;

export const EMPTY = 6;
export const COLOR_COUNT = 6;

export const COLOR_NAMES = ["White", "Red", "Green", "Yellow", "Orange", "Blue"] as const;
export const COLOR_LETTERS = ["W", "R", "G", "Y", "O", "B"] as const;
export const COLOR_HEX = ["#f4f5f0", "#c8102e", "#009b48", "#ffd500", "#ff6a13", "#0046ad"] as const;

export function solvedState(): CubeState {
  const s = new Uint8Array(STICKER_COUNT);
  for (let i = 0; i < STICKER_COUNT; i++) s[i] = Math.floor(i / 16);
  return s;
}

export function emptyState(): CubeState {
  return new Uint8Array(STICKER_COUNT).fill(EMPTY);
}

/** Every face shows a single colour (any orientation of the cube counts). */
export function isSolved(s: ArrayLike<number>): boolean {
  for (let f = 0; f < 6; f++) {
    const c = s[f * 16];
    if (c === EMPTY) return false;
    for (let k = 1; k < 16; k++) if (s[f * 16 + k] !== c) return false;
  }
  return true;
}

export function serialize(s: ArrayLike<number>): string {
  let out = "";
  for (let i = 0; i < STICKER_COUNT; i++) out += s[i] === EMPTY ? "." : COLOR_LETTERS[s[i]];
  return out;
}

export function deserialize(text: string): CubeState {
  const t = text.replace(/\s+/g, "");
  if (t.length !== STICKER_COUNT) throw new Error(`Expected ${STICKER_COUNT} stickers, got ${t.length}`);
  const s = new Uint8Array(STICKER_COUNT);
  for (let i = 0; i < STICKER_COUNT; i++) {
    const ch = t[i].toUpperCase();
    if (ch === ".") s[i] = EMPTY;
    else {
      const c = (COLOR_LETTERS as readonly string[]).indexOf(ch);
      if (c < 0) throw new Error(`Invalid colour "${t[i]}" at sticker ${i}`);
      s[i] = c;
    }
  }
  return s;
}

export function statesEqual(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
