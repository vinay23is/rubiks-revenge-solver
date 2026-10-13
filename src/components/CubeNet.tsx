"use client";

import { useMemo } from "react";
import { layerDepth } from "@/lib/cube/geometry";
import { moveLayers, parseMove } from "@/lib/cube/moves";
import { COLOR_HEX, COLOR_NAMES, EMPTY } from "@/lib/cube/state";
import { displayedState, useCube } from "@/store/cubeStore";

const FACE_TITLES = ["Up", "Right", "Front", "Down", "Left", "Back"];
// Grid placement (column, row) of each face in a 4-wide x 3-tall cross.
const PLACE: Record<number, [number, number]> = { 0: [2, 1], 4: [1, 2], 2: [2, 2], 1: [3, 2], 5: [4, 2], 3: [2, 3] };

export default function CubeNet() {
  const mode = useCube((s) => s.mode);
  const stickers = useCube((s) => s.stickers);
  const solution = useCube((s) => s.solution);
  const solveStart = useCube((s) => s.solveStart);
  const step = useCube((s) => s.step);
  const validation = useCube((s) => s.validation);
  const paint = useCube((s) => s.paint);

  const state = useMemo(
    () => displayedState({ mode, stickers, solution, solveStart, step }),
    [mode, stickers, solution, solveStart, step],
  );
  const flagged = useMemo(
    () => new Set(validation && !validation.ok ? validation.issues.flatMap((i) => i.stickers) : []),
    [validation],
  );
  const next = mode === "solve" && solution && step < solution.moves.length ? parseMove(solution.moves[step]) : null;
  const inNext = (i: number) => next !== null && (moveLayers(next) & (1 << (layerDepth(i, next.face) - 1))) !== 0;
  const editable = mode === "edit";

  return (
    <div
      className="grid w-full max-w-[560px] grid-cols-4 grid-rows-3 gap-1.5 sm:gap-2"
      role="group"
      aria-label="Cube net: Up on top, then Left, Front, Right, Back, and Down at the bottom"
      data-testid="cube-net"
    >
      {[0, 4, 2, 1, 5, 3].map((f) => (
        <div
          key={f}
          className="flex flex-col gap-0.5"
          style={{ gridColumn: PLACE[f][0], gridRow: PLACE[f][1] }}
        >
          <div className="grid aspect-square grid-cols-4 gap-[2px] rounded-md bg-[var(--cube-body)] p-[3px]">
            {Array.from({ length: 16 }, (_, k) => {
              const i = f * 16 + k;
              const c = state[i];
              const label = `${FACE_TITLES[f]} face, row ${(k >> 2) + 1}, column ${(k % 4) + 1}: ${c === EMPTY ? "empty" : COLOR_NAMES[c]}`;
              return (
                <button
                  key={k}
                  type="button"
                  disabled={!editable}
                  aria-label={label}
                  title={label}
                  data-sticker={i}
                  onClick={() => paint(i)}
                  className={[
                    "relative aspect-square rounded-[3px] transition-transform focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)]",
                    editable ? "cursor-pointer hover:scale-110" : "cursor-default",
                    flagged.has(i) ? "ring-2 ring-[#ff2d55] ring-offset-1 ring-offset-[var(--cube-body)]" : "",
                    inNext(i) ? "outline-2 outline-[var(--accent)]" : "",
                  ].join(" ")}
                  style={{
                    background: c === EMPTY ? "var(--empty-sticker)" : COLOR_HEX[c],
                  }}
                />
              );
            })}
          </div>
          <span className="text-center text-[10px] font-medium uppercase tracking-wider text-[var(--muted)]">
            {FACE_TITLES[f]}
          </span>
        </div>
      ))}
    </div>
  );
}
