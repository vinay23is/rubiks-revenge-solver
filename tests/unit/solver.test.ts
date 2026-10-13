import { beforeAll, describe, expect, it } from "vitest";
import { SOLVER_MOVES, applyMoves, formatMoves, parseMoves } from "@/lib/cube/moves";
import { mulberry32, randomMoves, randomState } from "@/lib/cube/random";
import { CubeState, isSolved, solvedState } from "@/lib/cube/state";
import { permutationParity } from "@/lib/solver/centers";
import { readWings } from "@/lib/solver/orientation";
import { InvalidCubeError, prepareSolver, solve } from "@/lib/solver/solver";
import { recolor, swapWings, twistCorner } from "./helpers";

/** Solve, then replay the returned notation on the ORIGINAL state and assert it is solved. */
function solveAndVerify(s: CubeState) {
  const r = solve(s);
  expect(r.verified).toBe(true);
  const replayed = applyMoves(s, parseMoves(r.moves.join(" ")));
  expect(isSolved(replayed)).toBe(true);
  // stage boundaries partition the move list
  expect(r.stages[0].start).toBe(0);
  expect(r.stages[r.stages.length - 1].end).toBe(r.moves.length);
  for (let i = 1; i < r.stages.length; i++) expect(r.stages[i].start).toBe(r.stages[i - 1].end);
  // only outer and wide turns are emitted (no rotations, no slice moves)
  for (const m of r.moves) expect(m).toMatch(/^[URFDLB]w?['2]?$/);
  // the 3x3 stage uses outer turns only
  const three = r.stages.find((x) => x.id === "three")!;
  for (const m of r.moves.slice(three.start, three.end)) expect(m).toMatch(/^[URFDLB]['2]?$/);
  return r;
}

const stats: { name: string; len: number; ms: number }[] = [];

beforeAll(() => {
  prepareSolver();
});

describe("solver: basic positions", () => {
  it("returns an empty solution for a solved cube", () => {
    expect(solveAndVerify(solvedState()).moves).toEqual([]);
  });

  it("solves a cube that is solved but rotated", () => {
    solveAndVerify(applyMoves(solvedState(), parseMoves("x y2")));
  });

  it("solves every single outer and wide turn", () => {
    for (const m of SOLVER_MOVES) solveAndVerify(applyMoves(solvedState(), [m]));
  });

  it("solves single inner-slice turns", () => {
    for (const t of ["2R", "2U'", "2F2", "2L", "2D", "2B'"]) solveAndVerify(applyMoves(solvedState(), parseMoves(t)));
  });
});

describe("solver: parity cases", () => {
  it("OLL parity: a single flipped dedge (classic parity algorithm)", () => {
    const s = applyMoves(solvedState(), parseMoves("2R2 B2 U2 2L U2 2R' U2 2R U2 F2 2R F2 2L' B2 2R2"));
    expect(s).toEqual(swapWings(solvedState(), 2, 3)); // exactly the UF dedge flipped
    expect(permutationParity(readWings(s, [0, 1, 2, 3, 4, 5]))).toBe(1);
    const r = solveAndVerify(s);
    expect(r.parity.wingParityOdd).toBe(true);
  });

  it("PLL parity: two dedges swapped (classic parity algorithm)", () => {
    const s = applyMoves(solvedState(), parseMoves("2R2 U2 2R2 Uw2 2R2 Uw2 U2"));
    expect(s).toEqual(swapWings(swapWings(solvedState(), 2, 7), 3, 6)); // UF and UB dedges exchanged
    solveAndVerify(s);
  });

  it("OLL + PLL parity together, and parity on every dedge", () => {
    for (let slot = 0; slot < 12; slot++) {
      solveAndVerify(swapWings(solvedState(), 2 * slot, 2 * slot + 1));
      const other = (slot + 5) % 12;
      solveAndVerify(swapWings(swapWings(solvedState(), 2 * slot, 2 * other), 2 * slot + 1, 2 * other + 1));
    }
    let s = swapWings(solvedState(), 0, 1);
    s = swapWings(swapWings(s, 4, 10), 5, 11);
    solveAndVerify(s);
  });

  it("parity hidden inside scrambles", () => {
    const rnd = mulberry32(2024);
    for (let i = 0; i < 6; i++) {
      const base = applyMoves(solvedState(), randomMoves(25, rnd));
      solveAndVerify(swapWings(base, 6, 7)); // flip one dedge slot of a scrambled cube
    }
  });

  it("solves twisted-corner pairs and pure center 3-cycles", () => {
    solveAndVerify(twistCorner(twistCorner(solvedState(), 1, 1), 6, 2));
    solveAndVerify(applyMoves(solvedState(), parseMoves("2R U 2R' U' 2R U 2R' U'")));
  });
});

describe("solver: random scrambles of increasing complexity", () => {
  for (const len of [1, 2, 3, 5, 8, 12, 20, 30, 50, 80]) {
    it(`scrambles of ${len} moves (seeded)`, () => {
      const rnd = mulberry32(1000 + len);
      for (let i = 0; i < 4; i++) {
        const scr = randomMoves(len, rnd);
        const t = Date.now();
        const r = solveAndVerify(applyMoves(solvedState(), scr));
        stats.push({ name: `scramble-${len}: ${formatMoves(scr)}`, len: r.moves.length, ms: Date.now() - t });
      }
    });
  }
});

describe("solver: uniformly random legal states (manual-entry equivalent)", () => {
  it("solves 60 random-state positions (seed 4444)", () => {
    const rnd = mulberry32(4444);
    for (let i = 0; i < 60; i++) {
      const t = Date.now();
      const r = solveAndVerify(randomState(rnd));
      stats.push({ name: `random-state #${i}`, len: r.moves.length, ms: Date.now() - t });
    }
    const rs = stats.filter((s) => s.name.startsWith("random-state"));
    const lens = rs.map((s) => s.len);
    const avg = lens.reduce((a, b) => a + b, 0) / lens.length;
    console.log(
      `random-state: n=${lens.length} avg=${avg.toFixed(1)} min=${Math.min(...lens)} max=${Math.max(...lens)} ` +
        `avgMs=${(rs.reduce((a, s) => a + s.ms, 0) / rs.length).toFixed(0)}`,
    );
    expect(Math.max(...lens)).toBeLessThan(140);
  });

  it("solves cubes with a non-standard colour scheme", () => {
    const rnd = mulberry32(77);
    for (const map of [
      [1, 0, 2, 3, 4, 5],
      [5, 4, 3, 2, 1, 0],
      [2, 5, 0, 4, 3, 1],
    ])
      solveAndVerify(recolor(randomState(rnd), map));
  });
});

describe("solver: invalid input", () => {
  it("throws a descriptive error instead of solving", () => {
    expect(() => solve(twistCorner(solvedState(), 0))).toThrow(InvalidCubeError);
    const s = solvedState();
    s[0] = 2;
    expect(() => solve(s)).toThrow(/appears 15 times/);
  });
});
