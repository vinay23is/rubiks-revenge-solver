"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { applyMoves, parseMoves } from "@/lib/cube/moves";
import { randomState } from "@/lib/cube/random";
import { EMPTY, deserialize, emptyState, serialize, solvedState } from "@/lib/cube/state";
import { ValidationResult, validate } from "@/lib/cube/validate";
import type { SolveResult } from "@/lib/solver/solver";
import { SolverError, solveInWorker } from "@/lib/solverClient";

export type Mode = "edit" | "solve";
export type SolveStatus = "idle" | "solving" | "error";
export type Theme = "system" | "light" | "dark";

const HISTORY_LIMIT = 300;

interface CubeStore {
  /** Serialized 96-sticker state being edited. */
  stickers: string;
  past: string[];
  future: string[];
  selectedColor: number;
  mode: Mode;
  showNet: boolean;
  theme: Theme;

  validation: ValidationResult | null;
  status: SolveStatus;
  error: string[] | null;

  solution: SolveResult | null;
  /** State the solution starts from. */
  solveStart: string | null;
  step: number;
  playing: boolean;
  /** Moves per second. */
  speed: number;
  /** Incremented to request a camera reset. */
  viewRequest: { name: string; n: number };

  setColor: (c: number) => void;
  paint: (sticker: number) => void;
  commit: (next: string) => void;
  undo: () => void;
  redo: () => void;
  clear: () => void;
  resetSolved: () => void;
  randomize: () => void;
  applyNotation: (text: string) => string | null;
  loadState: (text: string) => string | null;
  check: () => ValidationResult;
  solve: () => Promise<void>;
  exitSolve: (keepResult?: boolean) => void;
  setStep: (n: number) => void;
  next: () => void;
  prev: () => void;
  togglePlay: () => void;
  setPlaying: (p: boolean) => void;
  setSpeed: (s: number) => void;
  setShowNet: (v: boolean) => void;
  setTheme: (t: Theme) => void;
  requestView: (name: string) => void;
}

export const useCube = create<CubeStore>()(
  persist(
    (set, get) => ({
      stickers: serialize(emptyState()),
      past: [],
      future: [],
      selectedColor: 0,
      mode: "edit",
      showNet: true,
      theme: "system",
      validation: null,
      status: "idle",
      error: null,
      solution: null,
      solveStart: null,
      step: 0,
      playing: false,
      speed: 1.5,
      viewRequest: { name: "default", n: 0 },

      setColor: (c) => set({ selectedColor: c }),

      commit: (next) => {
        const cur = get().stickers;
        if (next === cur) return;
        set({
          stickers: next,
          past: [...get().past, cur].slice(-HISTORY_LIMIT),
          future: [],
          validation: null,
          error: null,
        });
      },

      paint: (i) => {
        const { mode, selectedColor, stickers } = get();
        if (mode !== "edit") return;
        const chars = stickers.split("");
        const s = deserialize(stickers);
        s[i] = selectedColor;
        chars[i] = serialize(s)[i];
        get().commit(chars.join(""));
      },

      undo: () => {
        const { past, stickers, future } = get();
        if (!past.length) return;
        set({ stickers: past[past.length - 1], past: past.slice(0, -1), future: [stickers, ...future], validation: null });
      },
      redo: () => {
        const { past, stickers, future } = get();
        if (!future.length) return;
        set({ stickers: future[0], future: future.slice(1), past: [...past, stickers], validation: null });
      },
      clear: () => get().commit(serialize(emptyState())),
      resetSolved: () => get().commit(serialize(solvedState())),
      randomize: () => get().commit(serialize(randomState())),

      applyNotation: (text) => {
        try {
          const moves = parseMoves(text);
          const s = deserialize(get().stickers);
          if (s.some((c) => c === EMPTY)) return "Fill in (or reset) every sticker before applying moves.";
          get().commit(serialize(applyMoves(s, moves)));
          return null;
        } catch (e) {
          return (e as Error).message;
        }
      },

      loadState: (text) => {
        try {
          get().commit(serialize(deserialize(text)));
          return null;
        } catch (e) {
          return (e as Error).message;
        }
      },

      check: () => {
        const v = validate(deserialize(get().stickers));
        set({ validation: v });
        return v;
      },

      solve: async () => {
        const v = get().check();
        if (!v.ok) return;
        const start = get().stickers;
        set({ status: "solving", error: null });
        try {
          const result = await solveInWorker(deserialize(start));
          // Independent check on the main thread before showing anything.
          const end = applyMoves(deserialize(start), parseMoves(result.moves.join(" ")));
          const ok = end.every((c, i) => c === end[Math.floor(i / 16) * 16]);
          if (!ok) throw new SolverError(["Solution failed verification."], false);
          set({ status: "idle", solution: result, solveStart: start, step: 0, playing: false, mode: "solve" });
        } catch (e) {
          const msgs = e instanceof SolverError ? e.messages : [(e as Error).message];
          set({ status: "error", error: msgs });
        }
      },

      exitSolve: () => set({ mode: "edit", playing: false, step: 0, solution: null, solveStart: null }),

      setStep: (n) => {
        const sol = get().solution;
        if (!sol) return;
        set({ step: Math.max(0, Math.min(sol.moves.length, n)) });
      },
      next: () => {
        const { solution, step } = get();
        if (!solution) return;
        if (step >= solution.moves.length) set({ playing: false });
        else set({ step: step + 1 });
      },
      prev: () => set({ step: Math.max(0, get().step - 1), playing: false }),
      togglePlay: () => {
        const { playing, solution, step } = get();
        if (!solution) return;
        if (!playing && step >= solution.moves.length) set({ step: 0, playing: true });
        else set({ playing: !playing });
      },
      setPlaying: (p) => set({ playing: p }),
      setSpeed: (s) => set({ speed: s }),
      setShowNet: (v) => set({ showNet: v }),
      setTheme: (t) => set({ theme: t }),
      requestView: (name) => set({ viewRequest: { name, n: get().viewRequest.n + 1 } }),
    }),
    {
      name: "rrs-cube-v1",
      version: 1,
      storage: createJSONStorage(() => {
        try {
          const k = "__rrs_probe";
          localStorage.setItem(k, "1");
          localStorage.removeItem(k);
          return localStorage;
        } catch {
          const mem = new Map<string, string>();
          return {
            getItem: (k: string) => mem.get(k) ?? null,
            setItem: (k: string, v: string) => void mem.set(k, v),
            removeItem: (k: string) => void mem.delete(k),
          };
        }
      }),
      partialize: (s) => ({
        stickers: s.stickers,
        past: s.past.slice(-50),
        future: s.future.slice(0, 50),
        selectedColor: s.selectedColor,
        showNet: s.showNet,
        theme: s.theme,
        speed: s.speed,
      }),
    },
  ),
);

/** State currently shown on the cube (edit state, or the solution replayed up to `step`). */
export function displayedState(s: Pick<CubeStore, "mode" | "stickers" | "solution" | "solveStart" | "step">): Uint8Array {
  if (s.mode === "solve" && s.solution && s.solveStart) {
    return applyMoves(deserialize(s.solveStart), parseMoves(s.solution.moves.slice(0, s.step).join(" ")));
  }
  return deserialize(s.stickers);
}
