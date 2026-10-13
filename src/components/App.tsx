"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { prepareSolverInWorker } from "@/lib/solverClient";
import { Theme, useCube } from "@/store/cubeStore";
import CubeNet from "./CubeNet";
import { EditActions, MovesInput, Palette, ValidationPanel } from "./EditTools";
import { Guide } from "./Guide";
import { LogoMark, MonitorIcon, MoonIcon, ResetViewIcon, SunIcon, ZoomInIcon, ZoomOutIcon } from "./Icons";
import { SolutionList, SolveControls } from "./SolvePanels";

const CubeCanvas = dynamic(() => import("./CubeCanvas"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-[var(--muted)]">Loading 3D view…</div>
  ),
});

function useResolvedDark(theme: Theme): boolean {
  const [systemDark, setSystemDark] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setSystemDark(mq.matches);
    const on = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const dark = theme === "dark" || (theme === "system" && systemDark);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
  }, [dark]);
  return dark;
}

function ThemeSwitch() {
  const theme = useCube((s) => s.theme);
  const setTheme = useCube((s) => s.setTheme);
  const opts: [Theme, React.ReactNode, string][] = [
    ["light", <SunIcon key="l" width={16} height={16} />, "Light theme"],
    ["system", <MonitorIcon key="s" width={16} height={16} />, "Use system theme"],
    ["dark", <MoonIcon key="d" width={16} height={16} />, "Dark theme"],
  ];
  return (
    <div className="flex rounded-xl border border-[var(--border)] bg-[var(--surface)] p-0.5" role="radiogroup" aria-label="Colour theme">
      {opts.map(([t, icon, label]) => (
        <button
          key={t}
          type="button"
          role="radio"
          aria-checked={theme === t}
          aria-label={label}
          title={label}
          onClick={() => setTheme(t)}
          className={`rounded-lg p-1.5 transition ${theme === t ? "bg-[var(--surface-2)] text-[var(--text)]" : "text-[var(--muted)] hover:text-[var(--text)]"}`}
        >
          {icon}
        </button>
      ))}
    </div>
  );
}

function ViewBar() {
  const requestView = useCube((s) => s.requestView);
  const btn = "rounded-lg px-2 py-1.5 text-xs font-medium hover:bg-[var(--surface-2)]";
  return (
    <div className="flex flex-wrap items-center gap-0.5 rounded-xl border border-[var(--border)] bg-[var(--surface)]/90 p-1 shadow-sm backdrop-blur">
      <button type="button" className={btn} onClick={() => requestView("default")} title="Reset view (front, right and top visible)" aria-label="Reset view">
        <ResetViewIcon width={15} height={15} />
      </button>
      <button type="button" className={btn} onClick={() => requestView("back")} title="Show back, left and top" data-testid="view-back">
        Back
      </button>
      <button type="button" className={btn} onClick={() => requestView("left")} title="Show left side">
        Left
      </button>
      <button type="button" className={btn} onClick={() => requestView("top")} title="Look down at the top">
        Top
      </button>
      <button type="button" className={btn} onClick={() => requestView("bottom")} title="Look up at the bottom">
        Bottom
      </button>
      <button type="button" className={btn} onClick={() => requestView("zoom-in")} aria-label="Zoom in" title="Zoom in">
        <ZoomInIcon width={15} height={15} />
      </button>
      <button type="button" className={btn} onClick={() => requestView("zoom-out")} aria-label="Zoom out" title="Zoom out">
        <ZoomOutIcon width={15} height={15} />
      </button>
    </div>
  );
}

function SolveButton({ ready }: { ready: boolean }) {
  const { solve, check, status } = useCube();
  const solving = status === "solving";
  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={check}
        data-testid="check"
        className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm font-semibold hover:bg-[var(--surface-2)]"
      >
        Check
      </button>
      <button
        type="button"
        onClick={() => void solve()}
        disabled={solving}
        data-testid="solve"
        className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white shadow-md transition hover:brightness-110 disabled:opacity-70"
      >
        {solving ? (
          <>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />
            {ready ? "Solving…" : "Preparing solver…"}
          </>
        ) : (
          "Solve cube"
        )}
      </button>
    </div>
  );
}

export default function App() {
  const theme = useCube((s) => s.theme);
  const mode = useCube((s) => s.mode);
  const showNet = useCube((s) => s.showNet);
  const setShowNet = useCube((s) => s.setShowNet);
  const dark = useResolvedDark(theme);
  const [ready, setReady] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
    prepareSolverInWorker()
      .then(() => setReady(true))
      .catch(() => setReady(false));
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const s = useCube.getState();
      const mod = e.metaKey || e.ctrlKey;
      if (s.mode === "edit") {
        if (mod && e.key.toLowerCase() === "z") {
          e.preventDefault();
          if (e.shiftKey) s.redo();
          else s.undo();
        } else if (mod && e.key.toLowerCase() === "y") {
          e.preventDefault();
          s.redo();
        } else if (!mod && /^[0-6]$/.test(e.key)) {
          s.setColor(e.key === "0" ? 6 : Number(e.key) - 1);
        }
      } else {
        if (e.key === " " && t.tagName !== "BUTTON") {
          e.preventDefault();
          s.togglePlay();
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          s.setPlaying(false);
          s.next();
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          s.prev();
        } else if (e.key === "Home") s.setStep(0);
        else if (e.key === "End") s.setStep(s.solution?.moves.length ?? 0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="mx-auto flex min-h-dvh max-w-[1400px] flex-col px-4 pb-10 sm:px-6">
      <header className="flex items-center gap-3 py-4">
        <LogoMark />
        <div className="mr-auto leading-tight">
          <h1 className="text-base font-bold tracking-tight sm:text-lg">Quadrant</h1>
          <p className="text-xs text-[var(--muted)]">4×4×4 Rubik&apos;s Revenge solver</p>
        </div>
        <span
          className={`hidden rounded-full px-2.5 py-1 text-xs font-semibold sm:inline ${mode === "edit" ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "bg-[var(--success-soft)] text-[var(--success)]"}`}
          data-testid="mode-badge"
        >
          {mode === "edit" ? "Editing" : "Solving"}
        </span>
        <span className="hidden text-xs text-[var(--muted)] md:inline" role="status" data-testid="solver-status">
          {ready ? "Solver ready" : "Preparing solver…"}
        </span>
        <ThemeSwitch />
      </header>

      <main className="app-grid">
        <section className="[grid-area:canvas]">
          <div className="relative h-[48vh] min-h-[300px] overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--stage)] lg:h-[60vh]">
            {hydrated && <CubeCanvas dark={dark} />}
            <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-2">
              <div className="pointer-events-auto">
                <ViewBar />
              </div>
            </div>
            <p className="pointer-events-none absolute bottom-2 left-0 right-0 text-center text-[11px] text-[var(--muted)]">
              {mode === "edit" ? "Drag to rotate · scroll/pinch to zoom · tap a sticker to paint" : "The highlighted layer turns next"}
            </p>
          </div>
        </section>

        <section className="[grid-area:primary] flex flex-col gap-3">
          {mode === "edit" ? (
            <div className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <Palette />
              <EditActions />
            </div>
          ) : (
            <SolveControls />
          )}
        </section>

        <section className="[grid-area:net] flex flex-col items-center gap-2">
          <div className="flex w-full max-w-[560px] items-center justify-between">
            <h2 className="text-sm font-semibold">Flat view</h2>
            <button type="button" onClick={() => setShowNet(!showNet)} className="text-xs text-[var(--accent)] hover:underline" aria-expanded={showNet}>
              {showNet ? "Hide" : "Show"}
            </button>
          </div>
          {showNet && hydrated && <CubeNet />}
        </section>

        <section className="[grid-area:secondary] flex flex-col gap-3">
          {mode === "edit" ? (
            <>
              <SolveButton ready={ready} />
              <ValidationPanel />
              <Guide />
              <MovesInput />
            </>
          ) : (
            <SolutionList />
          )}
        </section>
      </main>

      <footer className="mt-10 text-center text-xs text-[var(--muted)]">
        Independent open-source project · solver runs entirely in your browser · not affiliated with the Rubik&apos;s brand.
      </footer>
    </div>
  );
}
