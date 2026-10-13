import { stickerFace } from "../cube/geometry";
import { applyMove } from "../cube/moves";
import { CORNER_FACES, CORNER_STICKERS, EDGE_FACES, WING_STICKERS } from "../cube/pieces";
import { CubieCube, identityCube } from "./kociemba";

/** An orientation assigns a colour to each face position (U R F D L B). */
export type Orientation = number[];

/** All 24 rotations of a colour scheme. */
export function allOrientations(scheme: Orientation): Orientation[] {
  const s = new Uint8Array(96);
  for (let i = 0; i < 96; i++) s[i] = scheme[Math.floor(i / 16)];
  const seen = new Map<string, Orientation>();
  const queue: Uint8Array[] = [s];
  while (queue.length) {
    const cur = queue.shift()!;
    const o = [0, 1, 2, 3, 4, 5].map((f) => cur[f * 16]);
    const key = o.join("");
    if (seen.has(key)) continue;
    seen.set(key, o);
    for (const face of [1, 0]) queue.push(applyMove(cur, { face, kind: "rotation", amount: 1 }));
  }
  return [...seen.values()];
}

/** Home wing index for each (colour at sticker a, colour at sticker b). */
export function wingHomeTable(o: Orientation): Int8Array {
  const t = new Int8Array(36).fill(-1);
  WING_STICKERS.forEach(([a, b], h) => (t[o[stickerFace(a)] * 6 + o[stickerFace(b)]] = h));
  return t;
}

/** Wing identity at each wing position. */
export function readWings(state: ArrayLike<number>, o: Orientation): number[] {
  const home = wingHomeTable(o);
  return WING_STICKERS.map(([a, b]) => {
    const h = home[state[a] * 6 + state[b]];
    if (h < 0) throw new Error("invalid wing");
    return h;
  });
}

/** Convert a reduced 4x4x4 (centers solved, edges paired) into a 3x3x3 cubie cube. */
export function toCubie(state: ArrayLike<number>, o: Orientation): CubieCube {
  const faceOf = new Array(6);
  o.forEach((c, f) => (faceOf[c] = f));
  const cc = identityCube();
  for (let i = 0; i < 8; i++) {
    const faces = CORNER_STICKERS[i].map((s) => faceOf[state[s]]);
    const ori = faces.findIndex((f) => f === 0 || f === 3);
    const a = faces[(ori + 1) % 3];
    const b = faces[(ori + 2) % 3];
    const j = CORNER_FACES.findIndex((cf) => cf[1] === a && cf[2] === b);
    if (j < 0 || ori < 0) throw new Error("invalid corner");
    cc.cp[i] = j;
    cc.co[i] = ori;
  }
  for (let i = 0; i < 12; i++) {
    const [f1] = EDGE_FACES[i];
    const [sa, sb] = WING_STICKERS[i * 2];
    const s1 = stickerFace(sa) === f1 ? sa : sb;
    const s2 = s1 === sa ? sb : sa;
    const g1 = faceOf[state[s1]];
    const g2 = faceOf[state[s2]];
    let found = false;
    for (let j = 0; j < 12; j++) {
      const [h1, h2] = EDGE_FACES[j];
      if (h1 === g1 && h2 === g2) {
        cc.ep[i] = j;
        cc.eo[i] = 0;
        found = true;
      } else if (h1 === g2 && h2 === g1) {
        cc.ep[i] = j;
        cc.eo[i] = 1;
        found = true;
      }
    }
    if (!found) throw new Error("invalid edge");
  }
  return cc;
}
