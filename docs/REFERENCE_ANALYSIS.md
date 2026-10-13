# Phase 1 — Reference analysis

Reference: the Grubiks *Rubik's Revenge Solver 4x4x4* page. It was studied only for its
interaction model. No source code, assets, branding or APIs were reused; everything in
this repository is an independent implementation.

## What the reference does

| Area | Observation |
| --- | --- |
| Layout | Title bar, a row of six large colour swatches, a single 3D cube in the middle, a bottom toolbar with *Reset*, view arrows (rotate left / up / right), full-screen and *Solve!* |
| Colour entry | Select a swatch, then click/tap stickers on the 3D cube. The cube starts blank (white/unpainted tiles). |
| Navigation | Drag / swipe to orbit the cube; arrow buttons snap the view so hidden faces become reachable. |
| Validation | A modal "coloring issues" dialog when the input is wrong, without saying *which* sticker is wrong. |
| Solving | *Solve!* computes for up to ~10 s, then shows the solution step by step with Back/Next. Their text says the solver is not optimal. |
| Instructions | A short note on how to hold the puzzle and an explanation that a 4x4x4 is solved by grouping centers, pairing edges and then solving it like a 3x3x3. |

## UX gaps I set out to improve

* Validation should point at the offending stickers / pieces and say what's wrong
  (count, impossible corner, mirrored corner, duplicate wing, twisted corners).
* A synchronized 2D net is much faster for entering 96 stickers than a 3D view alone.
* Solving mode should be clearly separate from editing, with play/pause/speed controls,
  stage labels (centers → edges → 3x3), the layer being turned highlighted, and a
  "verified" badge computed by replaying the solution.
* Undo/redo and local persistence of half-entered cubes.

## Algorithmic requirements

A 4x4x4 has no fixed centers, 24 *wing* edges (two per edge slot, each wing has a fixed
orientation per position) and 8 corners. The standard computer approach is **reduction**:

1. **Centers** — group the 24 center stickers so each face has one colour.
2. **Edge pairing** — join the 24 wings into 12 dedges without breaking centers.
3. **3x3x3 stage** — the cube now behaves like a 3x3x3 (outer turns only).
4. **Parity** — a reduced cube can be an illegal 3x3x3:
   * *OLL parity*: a single flipped dedge ⇔ the wing permutation is odd.
   * *PLL parity*: two dedges swapped ⇔ dedge permutation parity ≠ corner permutation parity.

Legality of an entered position (with interchangeable centers): 16 stickers per colour,
8 distinct corners of one colour scheme with twist sum ≡ 0 (mod 3), and 24 distinct
wings. Wing and corner permutation parity are *not* constrained on a 4x4x4.

## Libraries considered

| Option | Verdict |
| --- | --- |
| `cubing.js` (MPL-2.0 / GPL) | Excellent puzzle library and random-state 4x4 *scrambles*, but no public API to solve an arbitrary user-entered 4x4 state. |
| `min2phase`, `cubejs` (3x3 two-phase) | Only solve 3x3x3 — not sufficient by themselves; could be used for stage 3 only. |
| TPR / cstimer 4x4 solver (GPL-3.0) | Strong, but Java/legacy JS with large tables and a copyleft licence. |
| `rubiks-cube-NxNxN-solver` (MIT, Python) | Needs hundreds of MB of lookup tables; not suitable for the browser. |

**Decision:** implement the entire engine from scratch in TypeScript (MIT licensed):
geometry-derived move model, three optimal center sub-stages with exact BFS pruning
tables (~1.7 MB total, built in < 1 s), an offline-generated library of all 4,048 pure
wing 3-cycles for edge pairing, and an original two-phase 3x3x3 solver. This keeps
everything client-side in a Web Worker (no backend, no Vercel function limits) and
lets every component be tested against the same sticker simulator.

## Proposed architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) and [SOLVER.md](./SOLVER.md).
