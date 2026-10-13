# Architecture

```
┌──────────────────────── Browser ────────────────────────┐
│  Next.js page (static)                                    │
│   ├─ App.tsx           layout, keyboard shortcuts, theme  │
│   ├─ CubeCanvas.tsx    React Three Fiber 3D cube          │
│   ├─ CubeNet.tsx       accessible 2D net (96 buttons)     │
│   ├─ EditTools.tsx     palette, undo/redo, import, errors │
│   └─ SolvePanels.tsx   playback controls, move list       │
│             │  zustand store (cubeStore.ts, persisted)    │
│             ▼                                             │
│  solverClient.ts ──postMessage──► solver.worker.ts        │
│                                    └─ lib/solver/*        │
└───────────────────────────────────────────────────────────┘
```

## Layers

| Path | Responsibility | Depends on |
| --- | --- | --- |
| `src/lib/cube/` | Pure cube model: geometry, moves & notation, pieces, state (de)serialization, validation, random states | nothing |
| `src/lib/solver/` | Center tables, edge pairing, 3x3x3 two-phase, orchestration (`solver.ts`) | `lib/cube` |
| `src/workers/solver.worker.ts` | Runs the solver off the main thread | `lib/solver` |
| `src/store/cubeStore.ts` | UI state: stickers, history, mode, solution, playback | `lib/*`, worker client |
| `src/components/` | Presentation | store |

`lib/` has no React or DOM dependencies and is exercised directly by Vitest.

## Key decisions and trade-offs

* **Client-side solving in a Web Worker.** Tables total ≈1.7 MB of `Int8Array`s for
  centers plus ≈4 MB for the 3x3x3 stage, built in ≈1.5 s on first use (started in the
  background when the page loads). No backend means no Vercel function time limits, no
  cold starts and no data leaving the device. Trade-off: a slower first solve on
  low-end phones.
* **Original solver instead of a dependency.** No permissively licensed JavaScript
  library solves arbitrary 4x4x4 *states*; implementing it allowed every stage to be
  verified against the same simulator.
* **Wing library generated offline** (`npm run gen:wings`, ≈13 s) and shipped as 163 kB
  JSON (≈30 kB gzipped) instead of generating at runtime.
* **Animation model.** Stickers have fixed world positions; a turn temporarily moves the
  stickers and cubies of the turning layers into a rotating group, and the new colours
  are committed when the turn ends. This keeps the 3D view a pure function of the state.
* **Outer + wide turns only in solutions.** Users never have to rotate the cube or turn
  an isolated inner slice, the common notation people already know.
* **Persistence.** Unfinished input, history (last 50 steps), theme and speed are kept
  in `localStorage` (with an in-memory fallback when storage is blocked).

## Environment variables

None. The app is fully static and needs no configuration or secrets. Optional variables
used only by the tests:

| Variable | Used by | Purpose |
| --- | --- | --- |
| `E2E_BASE_URL` | Playwright | Run the E2E suite against an already deployed URL instead of a local build |
| `E2E_PORT` | Playwright | Port of the local server (default 3124) |
| `CI` | Playwright | Enables retries and the GitHub reporter |
