export function Guide() {
  return (
    <details className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm" data-testid="guide">
      <summary className="cursor-pointer select-none font-semibold">New here? How to enter your cube</summary>
      <ol className="mt-3 list-decimal space-y-2 pl-5 leading-relaxed text-[var(--muted)]">
        <li>
          <b className="text-[var(--text)]">Choose how you hold the cube.</b> Pick any face to be <b>Front</b> (facing you) and any
          neighbouring face to be <b>Up</b>. A 4×4×4 has no fixed centers, so any choice works — just keep it for the whole solve.
        </li>
        <li>
          <b className="text-[var(--text)]">Paint the stickers.</b> Select a colour (or press keys 1–6) and click stickers on the 3D cube
          or on the flat net. Faces on the net are drawn as if you look straight at them:
          <ul className="mt-1 list-disc pl-5">
            <li>
              <b>Front, Right, Back, Left</b>: Up side on top. (Turn the cube around a vertical axis to look at each — keep Up on top.)
            </li>
            <li>
              <b>Up</b>: tilt the cube towards you; the edge next to Front is the bottom row on the net.
            </li>
            <li>
              <b>Down</b>: tilt the cube away; the edge next to Front is the top row on the net.
            </li>
          </ul>
        </li>
        <li>
          <b className="text-[var(--text)]">Check and solve.</b> The solver checks colour counts and that every corner and edge piece really
          exists. Problems are outlined in red with an explanation.
        </li>
        <li>
          <b className="text-[var(--text)]">Follow the moves</b> holding the cube exactly as you entered it. Use Play or step with ← →.
          The layer about to turn is highlighted on the 3D cube and the net.
        </li>
      </ol>
      <h3 className="mt-4 font-semibold">Notation</h3>
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[var(--muted)]">
        <dt className="font-mono font-bold text-[var(--text)]">R</dt>
        <dd>turn the right outer layer clockwise (looking at the right face). Same for U, F, D, L, B.</dd>
        <dt className="font-mono font-bold text-[var(--text)]">R&apos;</dt>
        <dd>counter-clockwise</dd>
        <dt className="font-mono font-bold text-[var(--text)]">R2</dt>
        <dd>half turn (180°)</dd>
        <dt className="font-mono font-bold text-[var(--text)]">Rw</dt>
        <dd>turn the two right layers together (wide turn)</dd>
        <dt className="font-mono font-bold text-[var(--text)]">2R</dt>
        <dd>inner slice only (accepted as input; the solver only outputs outer and wide turns)</dd>
      </dl>
      <p className="mt-3 text-xs text-[var(--muted)]">
        Shortcuts: 1–6 colours · 0 eraser · Ctrl/⌘+Z undo · Ctrl/⌘+Shift+Z redo · while solving: Space play/pause · ← → step · Home restart.
      </p>
    </details>
  );
}
