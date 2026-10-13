import { describe, expect, it } from "vitest";
import {
  Move,
  SOLVER_MOVES,
  applyMove,
  applyMoves,
  formatMove,
  formatMoves,
  invertMove,
  invertMoves,
  moveDest,
  parseMove,
  parseMoves,
  simplifyMoves,
} from "@/lib/cube/moves";
import { mulberry32, randomMoves } from "@/lib/cube/random";
import { isSolved, solvedState, statesEqual } from "@/lib/cube/state";

const ALL_MOVES: Move[] = [];
for (let face = 0; face < 6; face++)
  for (const kind of ["outer", "wide", "slice"] as const)
    for (const amount of [1, 2, 3] as const) ALL_MOVES.push({ face, kind, amount });
for (const face of [0, 1, 2]) for (const amount of [1, 2, 3] as const) ALL_MOVES.push({ face, kind: "rotation", amount });

const s0 = solvedState();
const changed = (a: ArrayLike<number>, b: ArrayLike<number>) => [...Array(96).keys()].filter((i) => a[i] !== b[i]);

describe("notation", () => {
  it("round-trips every move through format/parse", () => {
    for (const m of ALL_MOVES) expect(parseMove(formatMove(m))).toEqual(m);
  });

  it("parses WCA and SiGN variants", () => {
    expect(parseMove("Rw")).toEqual({ face: 1, kind: "wide", amount: 1 });
    expect(parseMove("r")).toEqual({ face: 1, kind: "wide", amount: 1 });
    expect(parseMove("2R'")).toEqual({ face: 1, kind: "slice", amount: 3 });
    expect(parseMove("Uw2")).toEqual({ face: 0, kind: "wide", amount: 2 });
    expect(parseMove("x'")).toEqual({ face: 1, kind: "rotation", amount: 3 });
    expect(parseMove("F2'")).toEqual({ face: 2, kind: "outer", amount: 2 });
    expect(parseMoves("(R U R' U') [Lw2], y")).toHaveLength(6);
  });

  it("rejects invalid tokens", () => {
    for (const bad of ["Q", "R3", "2x", "rw", "2r", "Rww", "U''"]) expect(() => parseMove(bad)).toThrow();
  });
});

describe("move permutations", () => {
  it("every move is a bijection and has order 4", () => {
    for (const m of ALL_MOVES) {
      expect(new Set(moveDest(m)).size).toBe(96);
      let s = s0;
      for (let i = 0; i < 4; i++) s = applyMove(s, { ...m, amount: 1 });
      expect(statesEqual(s, s0)).toBe(true);
    }
  });

  it("inverse moves undo moves", () => {
    const rnd = mulberry32(7);
    const scr = randomMoves(30, rnd);
    for (const m of ALL_MOVES) {
      const s = applyMoves(s0, scr);
      expect(statesEqual(applyMove(applyMove(s, m), invertMove(m)), s)).toBe(true);
    }
    expect(statesEqual(applyMoves(applyMoves(s0, scr), invertMoves(scr)), s0)).toBe(true);
  });

  it("moves the expected number of sticker positions per layer type", () => {
    const moved = (t: string) => [...moveDest(parseMove(t))].filter((d, i) => d !== i).length;
    expect(moved("R")).toBe(32); // 16 on the face + 4 on each neighbour
    expect(moved("2R")).toBe(16); // inner slice: 4 on each of 4 faces
    expect(moved("Rw")).toBe(48);
    expect(moved("x")).toBe(96 - 0);
    expect(changed(applyMove(s0, parseMove("Rw")), s0)).toHaveLength(32);
    expect(isSolved(applyMove(s0, parseMove("x")))).toBe(true);
  });

  it("R moves the right column of F onto U, D onto F", () => {
    const s = applyMove(s0, parseMove("R"));
    for (let r = 0; r < 4; r++) {
      expect(s[0 * 16 + r * 4 + 3]).toBe(2); // U right column shows front colour
      expect(s[2 * 16 + r * 4 + 3]).toBe(3); // F right column shows down colour
      expect(s[5 * 16 + r * 4 + 0]).toBe(0); // B left column (seen from behind) shows up colour
      expect(s[0 * 16 + r * 4 + 2]).toBe(0); // second column untouched
    }
  });

  it("2R moves only the inner column", () => {
    const s = applyMove(s0, parseMove("2R"));
    for (let r = 0; r < 4; r++) {
      expect(s[r * 4 + 2]).toBe(2);
      expect(s[r * 4 + 3]).toBe(0);
    }
  });

  it("wide turns equal outer + inner slice; rotations equal all layers", () => {
    for (let face = 0; face < 6; face++) {
      const F = "URFDLB"[face];
      expect(statesEqual(applyMoves(s0, parseMoves(`${F}w`)), applyMoves(s0, parseMoves(`${F} 2${F}`)))).toBe(true);
    }
    expect(statesEqual(applyMoves(s0, parseMoves("x")), applyMoves(s0, parseMoves("R 2R 2L' L'")))).toBe(true);
    expect(statesEqual(applyMoves(s0, parseMoves("y")), applyMoves(s0, parseMoves("Uw Dw'")))).toBe(true);
    expect(statesEqual(applyMoves(s0, parseMoves("z")), applyMoves(s0, parseMoves("Fw Bw'")))).toBe(true);
  });

  it("x brings the front face up", () => {
    const s = applyMove(s0, parseMove("x"));
    expect(s[0]).toBe(2);
  });

  it("has the familiar orders of 3x3x3 sequences on outer turns", () => {
    let s = s0;
    for (let i = 0; i < 6; i++) s = applyMoves(s, parseMoves("R U R' U'"));
    expect(statesEqual(s, s0)).toBe(true);
  });
});

describe("simplification", () => {
  it("merges and cancels same-axis turns", () => {
    expect(formatMoves(simplifyMoves(parseMoves("R R")))).toBe("R2");
    expect(simplifyMoves(parseMoves("R R'"))).toEqual([]);
    expect(formatMoves(simplifyMoves(parseMoves("U D U")))).toBe("U2 D");
    expect(formatMoves(simplifyMoves(parseMoves("R Rw'")))).toBe("Rw' R");
    expect(formatMoves(simplifyMoves(parseMoves("F B F' B'")))).toBe("");
    expect(formatMoves(simplifyMoves(parseMoves("R U U' R'")))).toBe("");
  });

  it("never changes the resulting state and never adds moves", () => {
    const rnd = mulberry32(99);
    for (let t = 0; t < 200; t++) {
      const seq = randomMoves(25, rnd);
      const simp = simplifyMoves(seq);
      expect(simp.length).toBeLessThanOrEqual(seq.length);
      expect(statesEqual(applyMoves(s0, seq), applyMoves(s0, simp))).toBe(true);
    }
  });

  it("solver move set has 36 outer/wide turns", () => {
    expect(SOLVER_MOVES).toHaveLength(36);
  });
});
