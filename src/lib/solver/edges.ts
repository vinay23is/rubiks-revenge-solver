import { stickerFace } from "../cube/geometry";
import { Move, applyMoves, parseMoves, simplifyMoves } from "../cube/moves";
import { WING_STICKERS } from "../cube/pieces";
import { permutationParity } from "./centers";
import { verifyCubie } from "./kociemba";
import { Orientation, readWings, toCubie } from "./orientation";
import { cycleKey } from "./wingLibraryGen";
import LIBRARY_JSON from "./wingLibrary.json";

/**
 * Edge pairing.
 *
 * With centers solved, every wing is identified by its two colours. We pick a
 * target "paired" arrangement T (which dedge goes into which slot, and which
 * way round) that keeps as many wings where they already are as possible
 * (exact bitmask DP over the 12 slots), subject to two constraints that make
 * the reduced cube a legal 3x3x3:
 *   - the wing permutation from the current state to T is even, so it can be
 *     written as 3-cycles (this is automatic, because stage 2 of the center
 *     solve already fixed wing parity — it is the OLL-parity condition),
 *   - the dedge permutation parity matches the corner permutation parity
 *     (PLL parity). If the best pairing would show PLL parity we choose the
 *     cheapest pairing with two dedges exchanged instead.
 * The required wing permutation is then executed with library 3-cycles,
 * preferring cycles that fix two wings at once.
 */

let library: Map<number, Move[]> | null = null;
export function getWingLibrary(): Map<number, Move[]> {
  if (!library) {
    library = new Map();
    for (const [k, v] of Object.entries(LIBRARY_JSON as Record<string, string>)) library.set(Number(k), parseMoves(v));
  }
  return library;
}

export interface PairingInfo {
  /** The natural pairing had to be changed to avoid PLL parity. */
  pllParityAvoided: boolean;
  cycles: number;
  wingsAlreadyPlaced: number;
}

function recolorWings(state: Uint8Array, target: number[], o: Orientation): Uint8Array {
  const s = Uint8Array.from(state);
  for (let p = 0; p < 24; p++) {
    const [a, b] = WING_STICKERS[p];
    const [ha, hb] = WING_STICKERS[target[p]];
    s[a] = o[stickerFace(ha)];
    s[b] = o[stickerFace(hb)];
  }
  return s;
}

function chooseTarget(state: Uint8Array, cur: number[], o: Orientation) {
  // weight of putting edge e into slot s with orientation k
  const w = (s: number, e: number, k: number) =>
    (cur[2 * s] === 2 * e + k ? 1 : 0) + (cur[2 * s + 1] === 2 * e + (1 - k) ? 1 : 0);
  const size = 1 << 12;
  const dp = new Int16Array(size).fill(-1);
  const choice = new Int16Array(size);
  dp[0] = 0;
  for (let mask = 0; mask < size; mask++) {
    if (dp[mask] < 0) continue;
    let s = 0;
    for (let m = mask; m; m &= m - 1) s++;
    if (s === 12) continue;
    for (let e = 0; e < 12; e++) {
      if (mask & (1 << e)) continue;
      for (let k = 0; k < 2; k++) {
        const nm = mask | (1 << e);
        const v = dp[mask] + w(s, e, k);
        if (v > dp[nm]) {
          dp[nm] = v;
          choice[nm] = e * 2 + k;
        }
      }
    }
  }
  const assign: [number, number][] = new Array(12);
  for (let mask = size - 1, s = 11; s >= 0; s--) {
    const c = choice[mask];
    assign[s] = [c >> 1, c & 1];
    mask &= ~(1 << (c >> 1));
  }

  const toTarget = (asg: [number, number][]) => {
    const t = new Array(24);
    asg.forEach(([e, k], s) => {
      t[2 * s] = 2 * e + k;
      t[2 * s + 1] = 2 * e + 1 - k;
    });
    return t as number[];
  };
  const score = (asg: [number, number][]) => asg.reduce((a, [e, k], s) => a + w(s, e, k), 0);
  const curParity = permutationParity(cur);
  const legal = (asg: [number, number][]) => {
    const t = toTarget(asg);
    if ((permutationParity(t) ^ curParity) !== 0) return false;
    return verifyCubie(toCubie(recolorWings(state, t, o), o)) === null;
  };

  const baseLegal = legal(assign);
  if (baseLegal) return { target: toTarget(assign), placed: score(assign), pllAvoided: false };

  let best: [number, number][] | null = null;
  let bestScore = -1;
  const tryAsg = (asg: [number, number][]) => {
    const sc = score(asg);
    if (sc > bestScore && legal(asg)) {
      best = asg.map((x) => [...x] as [number, number]);
      bestScore = sc;
    }
  };
  const flipVariants = (asg: [number, number][]) => {
    tryAsg(asg);
    for (let s = 0; s < 12; s++) {
      const a = asg.map((x) => [...x] as [number, number]);
      a[s][1] ^= 1;
      tryAsg(a);
    }
  };
  flipVariants(assign);
  let swapped = false;
  if (!best) swapped = true;
  for (let s1 = 0; s1 < 12; s1++)
    for (let s2 = s1 + 1; s2 < 12; s2++)
      for (let k1 = 0; k1 < 2; k1++)
        for (let k2 = 0; k2 < 2; k2++) {
          const a = assign.map((x) => [...x] as [number, number]);
          a[s1] = [assign[s2][0], k1];
          a[s2] = [assign[s1][0], k2];
          flipVariants(a);
        }
  if (!best) throw new Error("no legal pairing target found");
  // PLL parity was avoided if the dedge-slot assignment had to change.
  const b = best as [number, number][];
  const pllAvoided = swapped || b.some(([e], s) => e !== assign[s][0]);
  return { target: toTarget(b), placed: bestScore, pllAvoided };
}

interface BeamNode {
  cur: number[];
  moves: Move[];
  cycles: number;
}

const misplacedCount = (cur: number[], target: number[]) => cur.reduce((n, h, p) => n + (h !== target[p] ? 1 : 0), 0);

/** Candidate 3-cycles (y -> x -> z) for a node: prefer cycles that place two wings at once. */
function candidateCycles(cur: number[], target: number[], tInv: number[]): [number, number, number][] {
  const pos = new Array(24);
  cur.forEach((h, p) => (pos[h] = p));
  const out: [number, number, number][] = [];
  const misplaced: number[] = [];
  for (let p = 0; p < 24; p++) if (cur[p] !== target[p]) misplaced.push(p);
  for (const x of misplaced) {
    const y = pos[target[x]]; // where the wing that belongs at x is
    const z = tInv[cur[x]]; // where the wing at x belongs
    if (z !== y) out.push([y, x, z]);
  }
  if (out.length) return out;
  // Only 2-cycles remain: place one wing, turning two 2-cycles into a 3-cycle chain.
  for (const x of misplaced) {
    const y = pos[target[x]];
    for (const z of misplaced) if (z !== x && z !== y) out.push([y, x, z]);
  }
  return out;
}

/**
 * Execute the wing permutation with library 3-cycles. A small beam search picks
 * the order of cycles, scoring each by its length after cancelling against the
 * moves already chosen.
 */
export function pairEdges(state: Uint8Array, o: Orientation, beamWidth = 8): { moves: Move[]; info: PairingInfo } {
  const lib = getWingLibrary();
  const cur0 = readWings(state, o);
  const { target, placed, pllAvoided } = chooseTarget(state, cur0, o);
  const tInv: number[] = new Array(24);
  target.forEach((h, p) => (tInv[h] = p));

  const estimate = (n: BeamNode) => n.moves.length + misplacedCount(n.cur, target) * 5.5;
  let beam: BeamNode[] = [{ cur: cur0, moves: [], cycles: 0 }];
  let best: BeamNode | null = null;
  for (let depth = 0; depth < 40 && beam.length; depth++) {
    const next = new Map<string, BeamNode>();
    for (const node of beam) {
      if (misplacedCount(node.cur, target) === 0) {
        if (!best || node.moves.length < best.moves.length) best = node;
        continue;
      }
      for (const [y, x, z] of candidateCycles(node.cur, target, tInv)) {
        const seq = lib.get(cycleKey(y, x, z));
        if (!seq) throw new Error("missing wing cycle");
        const cur = [...node.cur];
        cur[x] = node.cur[y];
        cur[z] = node.cur[x];
        cur[y] = node.cur[z];
        const moves = simplifyMoves([...node.moves, ...seq]);
        const key = cur.join(",");
        const prev = next.get(key);
        if (!prev || moves.length < prev.moves.length) next.set(key, { cur, moves, cycles: node.cycles + 1 });
      }
    }
    beam = [...next.values()].sort((a, b) => estimate(a) - estimate(b)).slice(0, beamWidth);
    if (best && beam.every((n) => n.moves.length >= best!.moves.length)) break;
  }
  if (!best) throw new Error("edge pairing did not converge");

  // Verify on the actual sticker state.
  const final = readWings(applyMoves(state, best.moves), o);
  if (final.some((h, p) => h !== target[p])) throw new Error("edge pairing verification failed");
  return { moves: best.moves, info: { pllParityAvoided: pllAvoided, cycles: best.cycles, wingsAlreadyPlaced: placed } };
}
