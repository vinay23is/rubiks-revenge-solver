import { FACES, STICKER_COUNT, layerDepth, stickerFace } from "./geometry";
import { CENTER_STICKERS, CORNER_FACES, CORNER_NAMES, CORNER_STICKERS, EDGE_FACES, EDGE_NAMES, WING_STICKERS } from "./pieces";
import { COLOR_COUNT, COLOR_NAMES, CubeState, EMPTY } from "./state";

/**
 * Validation of a manually entered 4x4x4.
 *
 * A sticker configuration is a reachable 4x4x4 position exactly when
 *   - every colour appears 16 times,
 *   - the 8 corners are the 8 distinct corners of one colour scheme (correct chirality),
 *   - the corner twists sum to 0 mod 3,
 *   - the 24 wings are the 24 distinct wings of the same scheme.
 * Centers of one colour are interchangeable, which makes corner permutation
 * parity and wing permutation parity independent and unconstrained, so there
 * is no further permutation-parity condition on a 4x4x4 (unlike the 3x3x3).
 */

export type IssueKind = "incomplete" | "count" | "corner" | "edge" | "twist" | "scheme";

export interface ValidationIssue {
  kind: IssueKind;
  message: string;
  /** Stickers to highlight in the UI. */
  stickers: number[];
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
  /** face -> colour of a solved orientation compatible with the corners (when determinable). */
  scheme: number[] | null;
  counts: number[];
}

const PERMS6: number[][] = (() => {
  const out: number[][] = [];
  const rec = (pre: number[], rest: number[]) => {
    if (!rest.length) out.push(pre);
    rest.forEach((v, i) => rec([...pre, v], [...rest.slice(0, i), ...rest.slice(i + 1)]));
  };
  rec([], [0, 1, 2, 3, 4, 5]);
  return out;
})();

const name = (c: number) => (c === EMPTY ? "empty" : COLOR_NAMES[c]);

export function wingLabel(w: number): string {
  const slot = w >> 1;
  const [f1, f2] = EDGE_FACES[slot];
  const opposite = (f: number) => (f + 3) % 6;
  const others = [0, 1, 2, 3, 4, 5].filter((f) => f !== f1 && f !== f2 && f !== opposite(f1) && f !== opposite(f2));
  // A wing is one layer in from the neighbouring face it is closer to.
  const side = others.find((f) => layerDepth(WING_STICKERS[w][0], f) === 2) ?? others[0];
  return `${EDGE_NAMES[slot]} edge (${FACES[side]} side)`;
}

export function cornerLabel(i: number): string {
  return `${CORNER_NAMES[i]} corner`;
}

interface Match {
  cornerPiece: number[]; // per corner position: piece index or -1
  cornerTwist: number[]; // per position: twist, -1 if no match
  cornerMirror: boolean[];
  wingPiece: number[]; // per wing position: home wing, or -1
  score: number;
}

function matchScheme(s: CubeState, perm: number[]): Match {
  const cornerPiece: number[] = [];
  const cornerTwist: number[] = [];
  const cornerMirror: boolean[] = [];
  let score = 0;
  for (let i = 0; i < 8; i++) {
    const col = CORNER_STICKERS[i].map((x) => s[x]);
    let piece = -1;
    let twist = -1;
    let mirror = false;
    for (let j = 0; j < 8 && piece < 0; j++) {
      const home = CORNER_FACES[j].map((f) => perm[f]);
      for (let t = 0; t < 3; t++) {
        if (col[t] === home[0] && col[(t + 1) % 3] === home[1] && col[(t + 2) % 3] === home[2]) {
          piece = j;
          twist = t;
        }
      }
      if (piece < 0) {
        const setMatch = [...col].sort().join() === [...home].sort().join();
        if (setMatch) mirror = true;
      }
    }
    cornerPiece.push(piece);
    cornerTwist.push(twist);
    cornerMirror.push(piece < 0 && mirror);
    if (piece >= 0) score++;
  }
  const wingPiece: number[] = [];
  for (let w = 0; w < 24; w++) {
    const [a, b] = WING_STICKERS[w];
    let piece = -1;
    for (let h = 0; h < 24; h++) {
      const [ha, hb] = WING_STICKERS[h];
      if (perm[stickerFace(ha)] === s[a] && perm[stickerFace(hb)] === s[b]) {
        piece = h;
        break;
      }
    }
    wingPiece.push(piece);
    if (piece >= 0) score++;
  }
  // Count distinct pieces only, so that duplicated pieces count against a scheme.
  score = new Set(cornerPiece.filter((p) => p >= 0)).size + new Set(wingPiece.filter((p) => p >= 0)).size;
  return { cornerPiece, cornerTwist, cornerMirror, wingPiece, score };
}

export function validate(s: CubeState): ValidationResult {
  const issues: ValidationIssue[] = [];
  const counts = new Array(COLOR_COUNT).fill(0);
  const empty: number[] = [];
  for (let i = 0; i < STICKER_COUNT; i++) {
    if (s[i] === EMPTY || s[i] >= COLOR_COUNT) empty.push(i);
    else counts[s[i]]++;
  }
  if (empty.length) {
    issues.push({
      kind: "incomplete",
      message: `${empty.length} sticker${empty.length === 1 ? " is" : "s are"} not coloured yet. All 96 stickers must be entered.`,
      stickers: empty,
    });
  }
  const badCounts = counts.map((n, c) => [c, n]).filter(([, n]) => n !== 16);
  if (badCounts.length) {
    for (const [c, n] of badCounts) {
      issues.push({
        kind: "count",
        message: `${COLOR_NAMES[c]} appears ${n} time${n === 1 ? "" : "s"}; each colour must appear exactly 16 times (${n > 16 ? `${n - 16} too many` : `${16 - n} missing`}).`,
        stickers: [...Array(STICKER_COUNT).keys()].filter((i) => s[i] === c && n > 16),
      });
    }
  }
  if (issues.length) return { ok: false, issues, scheme: null, counts };

  // Centers must also hold 4 of each colour (implied by the piece checks, but clearer to report).
  const centerCounts = new Array(COLOR_COUNT).fill(0);
  for (const x of CENTER_STICKERS) centerCounts[s[x]]++;

  let best: Match | null = null;
  let bestPerm: number[] = PERMS6[0];
  for (const perm of PERMS6) {
    const m = matchScheme(s, perm);
    if (!best || m.score > best.score) {
      best = m;
      bestPerm = perm;
    }
  }
  const m = best!;

  // Corners
  const seenCorner = new Map<number, number>();
  for (let i = 0; i < 8; i++) {
    const stickers = CORNER_STICKERS[i];
    const cols = stickers.map((x) => name(s[x]));
    if (m.cornerPiece[i] < 0) {
      const uniq = new Set(stickers.map((x) => s[x]));
      let why: string;
      if (uniq.size < 3) why = "a corner cannot show the same colour twice";
      else if (m.cornerMirror[i]) why = "two of its stickers are swapped (this corner is a mirror image of a real one)";
      else why = "this colour combination does not exist on a cube with this colour scheme (it may contain two opposite colours)";
      issues.push({ kind: "corner", message: `The ${cornerLabel(i)} shows ${cols.join(" / ")}: ${why}.`, stickers });
    } else if (seenCorner.has(m.cornerPiece[i])) {
      const other = seenCorner.get(m.cornerPiece[i])!;
      issues.push({
        kind: "corner",
        message: `The ${cornerLabel(i)} and the ${cornerLabel(other)} are the same piece (${[...new Set(cols)].join(" / ")}); every corner exists only once.`,
        stickers: [...stickers, ...CORNER_STICKERS[other]],
      });
    } else seenCorner.set(m.cornerPiece[i], i);
  }

  // Wings
  const seenWing = new Map<number, number>();
  for (let w = 0; w < 24; w++) {
    const stickers = WING_STICKERS[w];
    const cols = stickers.map((x) => name(s[x]));
    if (m.wingPiece[w] < 0) {
      const why =
        s[stickers[0]] === s[stickers[1]]
          ? "an edge piece cannot have two stickers of the same colour"
          : "these two colours are opposite each other, so no edge piece has them";
      issues.push({ kind: "edge", message: `The ${wingLabel(w)} shows ${cols.join(" / ")}: ${why}.`, stickers: [...stickers] });
    } else if (seenWing.has(m.wingPiece[w])) {
      const other = seenWing.get(m.wingPiece[w])!;
      issues.push({
        kind: "edge",
        message: `The ${wingLabel(w)} and the ${wingLabel(other)} are the same edge piece (${cols.join(" / ")}). Each colour pair exists twice on a 4x4x4, but in mirror-image orientations — one of these two is flipped.`,
        stickers: [...stickers, ...WING_STICKERS[other]],
      });
    } else seenWing.set(m.wingPiece[w], w);
  }

  const structural = issues.length > 0;
  if (!structural) {
    const twist = m.cornerTwist.reduce((a, b) => a + b, 0) % 3;
    if (twist !== 0) {
      issues.push({
        kind: "twist",
        message: `The corners are twisted: the total corner twist is ${twist === 1 ? "+1" : "−1"} (mod 3). On a real cube one corner has probably been entered rotated — re-check the corner stickers.`,
        stickers: CORNER_STICKERS.flat(),
      });
    }
  }
  if (centerCounts.some((n) => n !== 4) && !structural) {
    issues.push({
      kind: "count",
      message: "Each colour must appear on exactly 4 center stickers.",
      stickers: CENTER_STICKERS,
    });
  }

  return { ok: issues.length === 0, issues, scheme: issues.length === 0 ? bestPerm : null, counts };
}
