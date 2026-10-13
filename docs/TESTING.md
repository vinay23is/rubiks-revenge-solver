# Testing

| Command | What it runs |
| --- | --- |
| `npm test` | Vitest unit + integration suite (52 tests, ~30 s) |
| `npm run test:e2e` | Playwright on desktop Chromium and a Pixel 7 profile (6 scenarios × 2) |
| `npm run bench -- [count] [seed]` | Solver benchmark with replay verification |
| `npm run lint` / `npm run typecheck` | ESLint / `tsc --noEmit` |

All randomness uses a seeded PRNG (`mulberry32`), so every run is reproducible.

## Unit and integration tests (`tests/unit`)

* **moves.test.ts** — notation parse/format round-trip for all 63 moves, invalid tokens,
  every move is a bijection of order 4, inverses, sticker counts per layer type, `R`
  and `2R` column checks, `Rw = R 2R`, `x = R 2R 2L' L'`, `(R U R' U')⁶ = id`, and
  move simplification never changes the state (200 random sequences).
* **state.test.ts** — solved recognition in all orientations, partial/empty cubes,
  serialization round-trip and malformed input.
* **validate.test.ts** — random legal states accepted, any colour scheme, missing
  stickers, colour counts, twisted corner, opposite twists accepted, mirrored corner,
  flipped single wing, impossible colour pair, OLL/PLL parity positions accepted.
* **wingLibrary.test.ts** — all 4,048 library sequences are clean 3-cycles of exactly the
  wings their key names.
* **solver.test.ts** — every solve is replayed on the original state and asserted solved;
  solutions contain only outer/wide turns and the 3x3x3 stage only outer turns:
  * solved and rotated-solved cubes, every single outer/wide/slice turn;
  * **OLL parity** from the classic algorithm `2R2 B2 U2 2L U2 2R' U2 2R U2 F2 2R F2 2L' B2 2R2`
    (asserted to be exactly one flipped dedge), single flips on every slot;
  * **PLL parity** from `2R2 U2 2R2 Uw2 2R2 Uw2 U2` (asserted to be exactly a UF/UB dedge
    swap), dedge swaps on every slot, both parities combined, parity hidden in scrambles;
  * random scrambles of 1, 2, 3, 5, 8, 12, 20, 30, 50, 80 moves (4 each);
  * 60 uniformly random legal states (equivalent to arbitrary manual entry);
  * non-standard colour schemes; invalid input raises `InvalidCubeError`.

## End-to-end tests (`tests/e2e/app.spec.ts`, desktop + mobile)

1. page loads, 96 net stickers, canvas rendered;
2. paint / undo / redo and persistence across reload;
3. validation messages for missing stickers, colour counts and a twisted corner;
4. **manual entry of a full random position sticker-by-sticker**, solve, stepping, and
   comparison of the displayed state with the solution replayed by the library at
   several points, ending solved;
5. scramble via notation, Play animation advances, jump to end is solved;
6. theme switch and painting a sticker by clicking the 3D canvas.

## Latest results

Unit suite: **52 / 52 passed**. E2E: **12 / 12 passed** (desktop-chromium and mobile-chromium).

Benchmark (`npm run bench -- 200 12345`):

```
random-state positions: 200 solved, 200 verified by replay (seed 12345)
  moves: avg 84.3, median 84, min 71, max 96
  time:  avg 327 ms, max 520 ms
  stage averages: centers1 5.8, centers2 4.6, centers3 6.1, edges 47.5, three 20.2
  OLL parity present in 95/200; PLL parity avoided in 78/200
scrambles of  1 moves: 10/10 verified, solution avg 1.7 (min 1, max 8)
scrambles of  3 moves: 10/10 verified, solution avg 4.3 (min 1, max 10)
scrambles of  5 moves: 10/10 verified, solution avg 18.2 (min 4, max 68)
scrambles of 10 moves: 10/10 verified, solution avg 54.8 (min 1, max 84)
scrambles of 20 moves: 10/10 verified, solution avg 82.5 (min 79, max 87)
scrambles of 40 moves: 10/10 verified, solution avg 85.5 (min 80, max 90)
scrambles of 80 moves: 10/10 verified, solution avg 86.8 (min 82, max 93)
```

### Verified example cases

The first three positions of the benchmark run (state string → solution length, all replay-verified):

```
example 1: state GGRGRBBYRGOGRGBBROBOYRGWOOBGYBGBGWWWRWRBYRBYYYGRBRWGWWROOYGYOOBROYBWBYGGRWOOWWROYWOWOYYWYWOGYRBB
  79 moves: U R' Uw' Fw2 U B Lw' R Fw2 R' Uw Rw2 Fw2 Dw2 D' Fw2 U' Fw F' U B2 U' Fw' F U B2 R B Rw R' B' R2 B Rw' R B' D' Rw' R D R' D' Rw R' D R' D R' Dw D' R U2 D' R' Dw' D R U2 R' D' B' R2 B2 D2 R' F2 D L F' U D2 L2 D2 L2 U F2 R2 D' B2
example 2: state WRGWWGOOYWYOOGRBRYBGRBROGGOORYRBGWWWRWBGBOGWRBWYYYBBWYYGWYRBBOOYGORYOORBRBWYORBGRYYOGWGWBBRGOYGW
  84 moves: Fw U Rw R' Fw R Fw2 R Lw2 Uw' U Fw2 U' B' Dw2 Bw2 B' R Bw B' R' B2 R Bw' B R' D' Fw F' D B' D' Fw' F U2 D F' Dw D' F U2 F' Dw' D R' Fw F' R F2 R' Fw' F R F Uw U' F' U' F Uw' U F' U F2 B' U' R2 D2 B2 L D R' B' L2 U' L2 U R2 D R2 U2 D' R2 D2
example 3: state WBWGROROYBWWOYBWBGYOBWRYRGBOYOOWYRYROBOYROYWWRWBOWORYBGGWWRBGBGGGBGBGGGYRWOGYGGBYOWORYROBYYBRRWR
  89 moves: U B Rw2 D Bw' Rw F' Uw B' Rw2 Uw' U' Fw2 U' Bw2 Rw2 L' B L Fw' F L' B' L Fw F R' Fw F' R F2 R' Fw' F Uw U' R D' R' Uw' U R D Lw L' D' L' D Lw' L D' Rw R' L D L' D' Rw' R D F2 L Bw B' L' F2 L Bw' B U' B2 L2 F2 U' F U R U2 L U2 L B2 U B2 U2 R2 D2 L2 D2
```
