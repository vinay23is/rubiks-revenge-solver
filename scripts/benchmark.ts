/**
 * Solver benchmark (run: npm run bench [-- <count> <seed>]).
 * Solves uniformly random legal positions and random-move scrambles, replays
 * every solution on the sticker simulator and prints statistics.
 */
import { applyMoves, formatMoves, parseMoves } from "../src/lib/cube/moves";
import { mulberry32, randomMoves, randomState } from "../src/lib/cube/random";
import { isSolved, serialize, solvedState } from "../src/lib/cube/state";
import { prepareSolver, solve } from "../src/lib/solver/solver";

const count = Number(process.argv[2] ?? 200);
const seed = Number(process.argv[3] ?? 12345);
const rnd = mulberry32(seed);

console.log(`tables built in ${prepareSolver()} ms`);
const lens: number[] = [];
const times: number[] = [];
const stageTotals: Record<string, number> = {};
let oll = 0;
let pll = 0;
for (let i = 0; i < count; i++) {
  const s = randomState(rnd);
  const t = performance.now();
  const r = solve(s);
  times.push(performance.now() - t);
  if (!isSolved(applyMoves(s, parseMoves(r.moves.join(" "))))) throw new Error(`replay failed for ${serialize(s)}`);
  lens.push(r.moves.length);
  for (const st of r.stages) stageTotals[st.id] = (stageTotals[st.id] ?? 0) + (st.end - st.start);
  if (r.parity.wingParityOdd) oll++;
  if (r.parity.pllParityAvoided) pll++;
  if (i < 3) console.log(`example ${i + 1}: state ${serialize(s)}\n  ${r.moves.length} moves: ${r.moves.join(" ")}`);
}
const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
const sorted = [...lens].sort((a, b) => a - b);
console.log(`\nrandom-state positions: ${count} solved, ${count} verified by replay (seed ${seed})`);
console.log(`  moves: avg ${avg(lens).toFixed(1)}, median ${sorted[Math.floor(count / 2)]}, min ${sorted[0]}, max ${sorted[count - 1]}`);
console.log(`  time:  avg ${avg(times).toFixed(0)} ms, max ${Math.max(...times).toFixed(0)} ms`);
console.log(`  stage averages: ${Object.entries(stageTotals).map(([k, v]) => `${k} ${(v / count).toFixed(1)}`).join(", ")}`);
console.log(`  OLL parity present in ${oll}/${count}; PLL parity avoided in ${pll}/${count}`);

for (const n of [1, 3, 5, 10, 20, 40, 80]) {
  const ls: number[] = [];
  for (let i = 0; i < 10; i++) {
    const scr = randomMoves(n, rnd);
    const s = applyMoves(solvedState(), scr);
    const r = solve(s);
    if (!isSolved(applyMoves(s, parseMoves(r.moves.join(" "))))) throw new Error(`replay failed for ${formatMoves(scr)}`);
    ls.push(r.moves.length);
  }
  console.log(`scrambles of ${String(n).padStart(2)} moves: 10/10 verified, solution avg ${avg(ls).toFixed(1)} (min ${Math.min(...ls)}, max ${Math.max(...ls)})`);
}
