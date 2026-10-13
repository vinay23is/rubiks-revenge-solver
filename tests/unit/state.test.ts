import { describe, expect, it } from "vitest";
import { applyMoves, parseMoves } from "@/lib/cube/moves";
import { mulberry32, randomState } from "@/lib/cube/random";
import { EMPTY, deserialize, emptyState, isSolved, serialize, solvedState, statesEqual } from "@/lib/cube/state";

describe("solved-state recognition", () => {
  it("recognises the solved cube in any orientation", () => {
    const s = solvedState();
    expect(isSolved(s)).toBe(true);
    for (const r of ["x", "y", "z", "x y", "x2 z'", "y' x' z2"]) expect(isSolved(applyMoves(s, parseMoves(r)))).toBe(true);
  });
  it("rejects scrambled, partially entered and empty cubes", () => {
    for (const m of ["R", "2R", "Uw", "F2", "2U'"]) expect(isSolved(applyMoves(solvedState(), parseMoves(m)))).toBe(false);
    expect(isSolved(emptyState())).toBe(false);
    const s = solvedState();
    s[5] = EMPTY;
    expect(isSolved(s)).toBe(false);
  });
  it("recognises solved after a move sequence and its inverse", () => {
    const seq = parseMoves("Rw U2 2L' F Bw2 D' x Lw");
    const inv = seq.map((m) => ({ ...m, amount: (4 - m.amount) as 1 | 2 | 3 })).reverse();
    expect(isSolved(applyMoves(applyMoves(solvedState(), seq), inv))).toBe(true);
  });
});

describe("serialization", () => {
  it("round-trips states", () => {
    const rnd = mulberry32(3);
    for (let i = 0; i < 20; i++) {
      const s = randomState(rnd);
      expect(statesEqual(deserialize(serialize(s)), s)).toBe(true);
    }
    const e = emptyState();
    e[10] = 2;
    expect(serialize(deserialize(serialize(e)))).toBe(serialize(e));
    expect(serialize(solvedState())).toBe("W".repeat(16) + "R".repeat(16) + "G".repeat(16) + "Y".repeat(16) + "O".repeat(16) + "B".repeat(16));
  });
  it("rejects malformed input", () => {
    expect(() => deserialize("WRG")).toThrow(/96/);
    expect(() => deserialize("X".repeat(96))).toThrow(/Invalid colour/);
  });
});
