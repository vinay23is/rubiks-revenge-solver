"use client";

import { useEffect, useRef } from "react";
import { describeMove } from "@/lib/cube/describe";
import { useCube } from "@/store/cubeStore";
import { CheckIcon, EndIcon, NextIcon, PauseIcon, PlayIcon, PrevIcon, RestartIcon } from "./Icons";

const STAGE_COLORS: Record<string, string> = {
  centers1: "#6366f1",
  centers2: "#8b5cf6",
  centers3: "#a855f7",
  edges: "#0ea5e9",
  three: "#10b981",
};

function CtrlButton({
  onClick,
  label,
  children,
  primary,
  disabled,
  testId,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
  primary?: boolean;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className={[
        "inline-flex h-11 items-center justify-center rounded-xl transition disabled:opacity-35",
        primary
          ? "w-14 bg-[var(--accent)] text-white shadow-md hover:brightness-110"
          : "w-11 border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)]",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

export function SolveControls() {
  const { solution, step, playing, speed, next, prev, setStep, togglePlay, setSpeed, setPlaying } = useCube();

  // Playback timer: advance one move per tick while playing.
  useEffect(() => {
    if (!playing || !solution) return;
    if (step >= solution.moves.length) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(next, 1000 / speed);
    return () => clearTimeout(t);
  }, [playing, step, speed, solution, next, setPlaying]);

  if (!solution) return null;
  const total = solution.moves.length;
  const current = step < total ? solution.moves[step] : null;
  const stage = solution.stages.find((s) => step >= s.start && step < s.end) ?? solution.stages[solution.stages.length - 1];

  return (
    <div className="flex flex-col gap-3" data-testid="solve-controls">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="flex items-center justify-between text-xs text-[var(--muted)]">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: STAGE_COLORS[stage.id] }} />
            {current ? stage.name : "Finished"}
          </span>
          <span className="tabular-nums" data-testid="progress-text">
            Move {Math.min(step + (current ? 1 : 0), total)} of {total}
          </span>
        </div>
        <div className="mt-2 flex items-end gap-3" aria-live="polite">
          <span className="font-mono text-4xl font-bold tracking-tight" data-testid="current-move">
            {current ?? "✓"}
          </span>
          <span className="pb-1 text-sm leading-snug text-[var(--muted)]">
            {current ? describeMove(current) : "The cube is solved. Every face shows one colour."}
          </span>
        </div>
        {/* progress with stage segments */}
        <div
          className="relative mt-3 h-2.5 w-full overflow-hidden rounded-full bg-[var(--surface-2)]"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={step}
          aria-label="Solution progress"
        >
          {solution.stages.map((s) =>
            s.end > s.start ? (
              <div
                key={s.id}
                className="absolute top-0 h-full opacity-25"
                style={{ left: `${(s.start / total) * 100}%`, width: `${((s.end - s.start) / total) * 100}%`, background: STAGE_COLORS[s.id] }}
              />
            ) : null,
          )}
          <div
            className="absolute top-0 h-full rounded-full bg-[var(--accent)] transition-[width] duration-200"
            style={{ width: `${total ? (step / total) * 100 : 100}%` }}
          />
        </div>
        <div className="mt-3 flex items-center justify-center gap-2">
          <CtrlButton onClick={() => setStep(0)} label="Restart (Home)" disabled={step === 0} testId="restart">
            <RestartIcon />
          </CtrlButton>
          <CtrlButton onClick={prev} label="Previous move (←)" disabled={step === 0} testId="prev">
            <PrevIcon />
          </CtrlButton>
          <CtrlButton onClick={togglePlay} label={playing ? "Pause (Space)" : "Play (Space)"} primary testId="play">
            {playing ? <PauseIcon /> : <PlayIcon />}
          </CtrlButton>
          <CtrlButton onClick={next} label="Next move (→)" disabled={step >= total} testId="next">
            <NextIcon />
          </CtrlButton>
          <CtrlButton onClick={() => setStep(total)} label="Jump to end (End)" disabled={step >= total} testId="end">
            <EndIcon />
          </CtrlButton>
        </div>
        <label className="mt-3 flex items-center gap-3 text-xs text-[var(--muted)]">
          <span className="w-12 shrink-0">Speed</span>
          <input
            type="range"
            min={0.5}
            max={4}
            step={0.25}
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="w-full accent-[var(--accent)]"
            aria-label="Animation speed in moves per second"
          />
          <span className="w-16 shrink-0 text-right tabular-nums">{speed.toFixed(2)} /s</span>
        </label>
      </div>
    </div>
  );
}

export function SolutionList() {
  const { solution, step, setStep, exitSolve } = useCube();
  const activeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [step]);
  if (!solution) return null;
  const total = solution.moves.length;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="mr-auto">
          <p className="text-2xl font-bold tabular-nums" data-testid="move-count">
            {total} moves
          </p>
          <p className="text-xs text-[var(--muted)]">Computed in {(solution.timings.totalMs / 1000).toFixed(2)} s in your browser</p>
        </div>
        <span
          className="inline-flex items-center gap-1 rounded-full bg-[var(--success-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--success)]"
          data-testid="verified-badge"
          title="The full solution was replayed on the cube simulator (in the worker and again on the page) and ends solved."
        >
          <CheckIcon width={14} height={14} /> Verified
        </span>
        <div className="w-full text-xs leading-relaxed text-[var(--muted)]">
          {solution.parity.wingParityOdd ? (
            <p>• OLL parity was present (odd edge-wing permutation); it was fixed while solving the centers.</p>
          ) : (
            <p>• No OLL parity (even edge-wing permutation).</p>
          )}
          {solution.parity.pllParityAvoided ? (
            <p>• PLL parity would have appeared; the edges were paired so that it cannot occur.</p>
          ) : (
            <p>• No PLL parity.</p>
          )}
          <p>• Keep the cube in the same orientation you entered it: Front facing you, Up on top. The solution never rotates the whole cube.</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4" data-testid="solution-list">
        {solution.stages.map((s, si) => (
          <section key={s.id} aria-label={s.name}>
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: STAGE_COLORS[s.id] }} />
              {si + 1}. {s.name}
              <span className="font-normal text-[var(--muted)]">· {s.end - s.start} moves</span>
            </h3>
            <p className="mb-1.5 mt-0.5 text-xs text-[var(--muted)]">{s.description}</p>
            {s.end === s.start ? (
              <p className="text-xs italic text-[var(--muted)]">Already done — nothing to do.</p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {solution.moves.slice(s.start, s.end).map((m, k) => {
                  const idx = s.start + k;
                  const done = idx < step;
                  const active = idx === step;
                  return (
                    <button
                      key={idx}
                      ref={active ? activeRef : undefined}
                      type="button"
                      onClick={() => setStep(idx)}
                      aria-label={`Move ${idx + 1}: ${m}${active ? " (next)" : ""}`}
                      aria-current={active ? "step" : undefined}
                      className={[
                        "min-w-9 rounded-md px-1.5 py-1 font-mono text-xs font-semibold transition",
                        active
                          ? "bg-[var(--accent)] text-white shadow"
                          : done
                            ? "bg-[var(--surface-2)] text-[var(--muted)] opacity-50"
                            : "bg-[var(--surface-2)] hover:bg-[var(--accent-soft)]",
                      ].join(" ")}
                    >
                      {m}
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        ))}
      </div>
      <button
        type="button"
        onClick={() => exitSolve()}
        data-testid="back-to-edit"
        className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm font-medium hover:bg-[var(--surface-2)]"
      >
        ← Back to editing
      </button>
    </div>
  );
}
