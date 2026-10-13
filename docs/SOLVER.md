# How the solver works

The solver is an original TypeScript implementation of the **reduction method** with
computer-search stages. It accepts any legal sticker configuration (not just scrambles
produced by the app) and never returns a solution it has not replayed successfully.

```
input stickers ─► validate ─► centers (3 optimal stages) ─► edge pairing ─► 3x3x3 two-phase ─► replay check
```

## 0. Model

* 96 stickers, indexed `face*16 + row*4 + col` with faces `U R F D L B`.
* Every move permutation is **computed** by rotating the 3D coordinates of the stickers
  in the affected layers (`src/lib/cube/geometry.ts`), so outer turns, inner slices,
  wide turns and rotations cannot be mistyped.
* Pieces: 24 center stickers, 24 *wings* (two per edge slot), 8 corners. Wing orientation
  is fixed by position; a consistent orientation labelling is derived automatically by
  propagating through the move group.
* The colour scheme is **not assumed**: validation finds the face→colour assignment
  that is consistent with the entered corners and wings (any of the 720 assignments is
  tried), so stickers can be entered with any colour scheme.

## 1. Validation (`src/lib/cube/validate.ts`)

A sticker configuration is a reachable 4x4x4 position exactly when:

1. every colour appears 16 times;
2. the 8 corners are the 8 distinct corners of one colour scheme, with correct chirality;
3. the corner twists sum to 0 (mod 3);
4. the 24 wings are the 24 distinct wings of that scheme.

Because same-coloured centers are interchangeable, the corner and wing permutation
parities are independent and unconstrained — there is no extra parity check on a
4x4x4 (unlike the 3x3x3). Each failed rule produces a specific message and the list of
stickers to highlight (e.g. *"The URF corner shows White / Green / Red: two of its
stickers are swapped"*).

## 2. Centers — three optimal stages (`src/lib/solver/centers.ts`)

| Stage | Goal | State space | Moves | Max depth |
| --- | --- | --- | --- | --- |
| 1 | The 8 centers of one opposite colour pair on U/D | C(24,8) = 735,471 | all 36 outer + wide turns | 8 |
| 2 | Next pair on L/R **and even wing permutation** | C(16,8) × 2 = 25,740 | outer turns, Uw/Dw, half turns of other wide layers | 8 |
| 3 | Every face single-coloured | 70³ = 343,000 | outer turns + wide half turns | 11 |

Each table is a complete breadth-first search of its state space (built in ≈0.7 s), so a
table entry is the *exact* distance and each stage is solved optimally by walking
downhill. The solver enumerates many optimal stage-1/stage-2 paths for all 3 axis
choices and all 24 target orientations, then keeps the 20 cheapest center plans for the
next stage.

**OLL parity** (a single flipped dedge after reduction) occurs exactly when the wing
permutation is odd. Only quarter turns of an inner layer (i.e. wide quarter turns)
change wing parity, and stage 3 contains none, so stage 2 carries a parity bit and its
goal requires *even* parity. As a result the reduced cube can never show OLL parity.

> Design note: the first version of stage 2 omitted side-face quarter turns. A
> reachability check of the BFS showed only 9,800 of 25,740 states were reachable
> (side centers split into two diagonal orbits), so those moves were added — every
> stage table is now verified to cover its full state space.

## 3. Edge pairing (`src/lib/solver/edges.ts`)

With centers solved, every wing is identified by its two colours.

1. **Target choice.** An exact bitmask DP over the 12 slots chooses which dedge goes into
   which slot (and which way round) so that the maximum number of wings stay where they
   are. The target must make the reduced cube a legal 3x3x3: the dedge permutation
   parity must equal the corner permutation parity. If it does not (this is
   **PLL parity**), the cheapest alternative with two dedges exchanged is chosen.
2. **Execution with 3-cycles.** The required wing permutation is even (guaranteed by
   center stage 2), so it is executed with wing 3-cycles. A library of all
   **4,048 directed wing 3-cycles** (`wingLibrary.json`, 10–14 moves each) was generated
   offline by evaluating 168,048 commutators `[A, B]` (A = wide / inner-slice quarter
   turn, B = up to three outer turns), keeping those that move exactly three wings and
   nothing else, and extending them by conjugation. Every entry is re-verified by the
   test-suite. A beam search (width 8) orders the cycles, preferring cycles that place
   two wings at once and scoring each by its length after cancellation with the
   previous moves.

## 4. Reduced 3x3x3 (`src/lib/solver/kociemba.ts`)

The reduced cube is converted to a cubie representation and solved with an original
two-phase (Kociemba-style) IDA* search with four exact pruning tables
(slice×twist, slice×flip, slice-perm×corner-perm, slice-perm×edge-perm). It typically
finds 19–22 move solutions within the 300 ms budget. Only outer turns are used.

## 5. Output and verification

Moves are output in WCA notation using only outer turns (`R`) and wide turns (`Rw`) —
no rotations, so the cube is never re-gripped. Same-axis runs are merged
(`simplifyMoves`) inside and across stage boundaries. Finally the complete move list is
replayed on the original sticker state; the worker throws instead of returning if the
result is not solved, and the page replays it once more before showing it.

## Performance (200 random-state positions, seed 12345)

See [TESTING.md](./TESTING.md) for the full output.

* average 84.3 moves (median 84, min 71, max 96)
* stage averages: centers 16.5 · edges 47.5 · 3x3x3 20.2
* average 327 ms per solve in Node; one-time table build ≈1.5 s

## Limitations

* Not optimal. Typical solutions are 75–95 turns. Edge pairing with pure 3-cycles
  (≈48 turns) is the main cost; a free-slice / multi-dedge search would shorten it.
* A 1-move scramble may get a slightly longer (but valid) solution, because the
  stages do not search for the globally shortest sequence.
