"use client";

import { useMemo, useState } from "react";
import { COLOR_HEX, COLOR_NAMES, EMPTY, deserialize } from "@/lib/cube/state";
import { useCube } from "@/store/cubeStore";
import { AlertIcon, CheckIcon, CubeIcon, EraserIcon, RedoIcon, ShuffleIcon, TrashIcon, UndoIcon } from "./Icons";

export function Palette() {
  const selected = useCube((s) => s.selectedColor);
  const setColor = useCube((s) => s.setColor);
  const stickers = useCube((s) => s.stickers);
  const counts = useMemo(() => {
    const c = new Array(7).fill(0);
    for (const x of deserialize(stickers)) c[x]++;
    return c;
  }, [stickers]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">Colour palette</h2>
        <span className="text-xs text-[var(--muted)]" data-testid="painted-count">
          {96 - counts[EMPTY]}/96 painted
        </span>
      </div>
      <div className="grid grid-cols-7 gap-1.5" role="radiogroup" aria-label="Paint colour">
        {COLOR_NAMES.map((name, c) => {
          const n = counts[c];
          const active = selected === c;
          return (
            <button
              key={name}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={`${name} (${n} of 16 placed). Shortcut ${c + 1}`}
              title={`${name} — key ${c + 1}`}
              onClick={() => setColor(c)}
              data-testid={`color-${name.toLowerCase()}`}
              className={[
                "group flex flex-col items-center gap-1 rounded-xl border p-1.5 transition",
                active
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] shadow-sm"
                  : "border-[var(--border)] hover:border-[var(--muted)]",
              ].join(" ")}
            >
              <span
                className="block aspect-square w-full rounded-lg shadow-inner ring-1 ring-black/10"
                style={{ background: COLOR_HEX[c] }}
              />
              <span
                className={`text-[10px] font-medium tabular-nums ${n === 16 ? "text-[var(--success)]" : n > 16 ? "text-[var(--danger)]" : "text-[var(--muted)]"}`}
              >
                {n}/16
              </span>
            </button>
          );
        })}
        <button
          type="button"
          role="radio"
          aria-checked={selected === EMPTY}
          aria-label="Eraser (key 0)"
          title="Eraser — key 0"
          onClick={() => setColor(EMPTY)}
          className={[
            "flex flex-col items-center justify-center gap-1 rounded-xl border p-1.5 transition",
            selected === EMPTY ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--border)] hover:border-[var(--muted)]",
          ].join(" ")}
        >
          <EraserIcon />
          <span className="text-[10px] font-medium text-[var(--muted)]">Erase</span>
        </button>
      </div>
    </div>
  );
}

export function ToolButton({
  onClick,
  disabled,
  label,
  children,
  testId,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      data-testid={testId}
      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-xs font-medium transition hover:bg-[var(--surface-2)] disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export function EditActions() {
  const { undo, redo, clear, resetSolved, randomize, past, future } = useCube();
  const [confirmClear, setConfirmClear] = useState(false);
  return (
    <div className="flex flex-wrap gap-1.5">
      <ToolButton onClick={undo} disabled={!past.length} label="Undo (Ctrl/⌘+Z)" testId="undo">
        <UndoIcon width={15} height={15} /> Undo
      </ToolButton>
      <ToolButton onClick={redo} disabled={!future.length} label="Redo (Ctrl/⌘+Shift+Z)" testId="redo">
        <RedoIcon width={15} height={15} /> Redo
      </ToolButton>
      {confirmClear ? (
        <ToolButton
          onClick={() => {
            clear();
            setConfirmClear(false);
          }}
          label="Confirm clearing every sticker"
          testId="clear-confirm"
        >
          <TrashIcon width={15} height={15} /> Really clear?
        </ToolButton>
      ) : (
        <ToolButton onClick={() => setConfirmClear(true)} label="Clear all stickers" testId="clear">
          <TrashIcon width={15} height={15} /> Clear
        </ToolButton>
      )}
      <ToolButton onClick={resetSolved} label="Fill with a solved cube" testId="reset-solved">
        <CubeIcon width={15} height={15} /> Solved
      </ToolButton>
      <ToolButton onClick={randomize} label="Random legal position" testId="randomize">
        <ShuffleIcon width={15} height={15} /> Random
      </ToolButton>
    </div>
  );
}

export function MovesInput() {
  const applyNotation = useCube((s) => s.applyNotation);
  const stickers = useCube((s) => s.stickers);
  const loadState = useCube((s) => s.loadState);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [stateText, setStateText] = useState("");
  return (
    <details className="group rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
      <summary className="cursor-pointer select-none text-sm font-medium">Apply a scramble / import state</summary>
      <div className="mt-2 flex flex-col gap-2">
        <label className="text-xs text-[var(--muted)]" htmlFor="moves-input">
          Apply moves to the current cube (e.g. <code>Rw U2 2L&apos; F Bw</code>):
        </label>
        <div className="flex gap-1.5">
          <input
            id="moves-input"
            data-testid="moves-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.currentTarget.nextElementSibling as HTMLButtonElement)?.click();
            }}
            className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 font-mono text-sm"
            placeholder="R U Rw' 2F2 …"
          />
          <button
            type="button"
            data-testid="apply-moves"
            onClick={() => {
              const err = applyNotation(text);
              setMsg(err ?? "Applied.");
            }}
            className="rounded-lg bg-[var(--accent)] px-3 text-sm font-medium text-white"
          >
            Apply
          </button>
        </div>
        <label className="text-xs text-[var(--muted)]" htmlFor="state-input">
          State string (96 letters W R G Y O B, or . for empty; faces U R F D L B):
        </label>
        <textarea
          id="state-input"
          rows={2}
          value={stateText}
          placeholder={stickers}
          onChange={(e) => setStateText(e.target.value)}
          className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 font-mono text-[11px] break-all"
        />
        <div className="flex gap-1.5">
          <ToolButton onClick={() => setMsg(loadState(stateText) ?? "State loaded.")} label="Load state string">
            Load
          </ToolButton>
          <ToolButton
            onClick={() => {
              setStateText(stickers);
              navigator.clipboard?.writeText(stickers).catch(() => {});
              setMsg("Current state copied.");
            }}
            label="Copy the current state"
          >
            Copy current
          </ToolButton>
        </div>
        {msg && (
          <p className="text-xs text-[var(--muted)]" role="status">
            {msg}
          </p>
        )}
      </div>
    </details>
  );
}

export function ValidationPanel() {
  const validation = useCube((s) => s.validation);
  const status = useCube((s) => s.status);
  const error = useCube((s) => s.error);
  if (status === "error" && error)
    return (
      <div role="alert" className="rounded-xl border border-[var(--danger)] bg-[var(--danger-soft)] p-3 text-sm">
        <p className="font-semibold">The solver could not solve this cube</p>
        <ul className="mt-1 list-disc pl-5">
          {error.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      </div>
    );
  if (!validation) return null;
  if (validation.ok)
    return (
      <div role="status" data-testid="validation-ok" className="flex items-center gap-2 rounded-xl border border-[var(--success)] bg-[var(--success-soft)] p-3 text-sm">
        <CheckIcon className="text-[var(--success)]" /> This is a valid, solvable 4×4×4 position.
      </div>
    );
  return (
    <div role="alert" data-testid="validation-errors" className="rounded-xl border border-[var(--danger)] bg-[var(--danger-soft)] p-3 text-sm">
      <p className="flex items-center gap-2 font-semibold">
        <AlertIcon className="text-[var(--danger)]" /> {validation.issues.length} problem{validation.issues.length > 1 ? "s" : ""} found
      </p>
      <ul className="mt-2 flex max-h-56 flex-col gap-1.5 overflow-auto pl-1">
        {validation.issues.slice(0, 12).map((i, k) => (
          <li key={k} className="leading-snug">
            • {i.message}
          </li>
        ))}
        {validation.issues.length > 12 && <li>…and {validation.issues.length - 12} more.</li>}
      </ul>
      <p className="mt-2 text-xs text-[var(--muted)]">Affected stickers are outlined in red on the cube and the net.</p>
    </div>
  );
}
