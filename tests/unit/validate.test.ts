import { describe, expect, it } from "vitest";
import { applyMoves, parseMoves } from "@/lib/cube/moves";
import { mulberry32, randomState } from "@/lib/cube/random";
import { EMPTY, solvedState } from "@/lib/cube/state";
import { validate } from "@/lib/cube/validate";
import { recolor, swapStickers, swapWings, twistCorner } from "./helpers";
import { CORNER_STICKERS, WING_STICKERS } from "@/lib/cube/pieces";

const kinds = (s: Uint8Array) => validate(s).issues.map((i) => i.kind);

describe("validation", () => {
  it("accepts solved, scrambled and random legal states", () => {
    expect(validate(solvedState()).ok).toBe(true);
    expect(validate(applyMoves(solvedState(), parseMoves("Rw U 2F' L2 Dw B x"))).ok).toBe(true);
    const rnd = mulberry32(11);
    for (let i = 0; i < 25; i++) expect(validate(randomState(rnd)).ok).toBe(true);
  });

  it("accepts any consistent colour scheme", () => {
    const s = recolor(applyMoves(solvedState(), parseMoves("R Uw F")), [5, 3, 1, 0, 2, 4]);
    expect(validate(s).ok).toBe(true);
  });

  it("reports missing stickers", () => {
    const s = solvedState();
    s[0] = EMPTY;
    s[40] = EMPTY;
    const v = validate(s);
    expect(v.ok).toBe(false);
    expect(v.issues[0].kind).toBe("incomplete");
    expect(v.issues[0].stickers).toEqual([0, 40]);
    expect(v.issues[0].message).toMatch(/2 stickers/);
  });

  it("reports wrong colour counts", () => {
    const s = solvedState();
    s[0] = 1; // one white sticker painted red
    const v = validate(s);
    expect(v.ok).toBe(false);
    expect(kinds(s)).toEqual(["count", "count"]);
    expect(v.issues.map((i) => i.message).join(" ")).toMatch(/White appears 15 times.*Red appears 17 times/);
  });

  it("detects a twisted corner", () => {
    const v = validate(twistCorner(solvedState(), 0));
    expect(v.ok).toBe(false);
    expect(v.issues.map((i) => i.kind)).toEqual(["twist"]);
  });

  it("accepts two opposite corner twists", () => {
    expect(validate(twistCorner(twistCorner(solvedState(), 0, 1), 3, 2)).ok).toBe(true);
  });

  it("detects a mirrored corner (two stickers swapped)", () => {
    const [a, b] = CORNER_STICKERS[0];
    const v = validate(swapStickers(solvedState(), a, b));
    expect(v.ok).toBe(false);
    expect(v.issues.some((i) => i.kind === "corner" && /mirror/.test(i.message))).toBe(true);
  });

  it("detects a flipped single wing (impossible on a real cube)", () => {
    const [a, b] = WING_STICKERS[4];
    const v = validate(swapStickers(solvedState(), a, b));
    expect(v.ok).toBe(false);
    expect(v.issues.some((i) => i.kind === "edge")).toBe(true);
  });

  it("detects an impossible colour pair on an edge", () => {
    // Make a wing white/yellow while keeping colour counts (swap with a yellow/white elsewhere)
    const s = solvedState();
    const yellowWing = WING_STICKERS.find(([x, y]) => s[x] === 3 || s[y] === 3)!;
    const yellowSticker = s[yellowWing[0]] === 3 ? yellowWing[0] : yellowWing[1];
    const t = swapStickers(s, WING_STICKERS[2][1], yellowSticker);
    const v = validate(t);
    expect(v.ok).toBe(false);
    expect(v.issues.some((i) => i.kind === "edge")).toBe(true);
  });

  it("accepts the OLL-parity and PLL-parity positions (they are legal on a 4x4x4)", () => {
    expect(validate(swapWings(solvedState(), 2, 3)).ok).toBe(true);
    expect(validate(swapWings(swapWings(solvedState(), 2, 7), 3, 6)).ok).toBe(true);
  });
});
