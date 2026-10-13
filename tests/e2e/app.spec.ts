import { Page, expect, test } from "@playwright/test";
import { mulberry32, randomState } from "../../src/lib/cube/random";
import { applyMoves, parseMoves } from "../../src/lib/cube/moves";
import { COLOR_NAMES, serialize, solvedState } from "../../src/lib/cube/state";

const sticker = (page: Page, i: number) => page.locator(`[data-testid=cube-net] [data-sticker="${i}"]`);

async function open(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByTestId("cube-net")).toBeVisible();
}

async function netColors(page: Page): Promise<string[]> {
  return page.locator("[data-testid=cube-net] [data-sticker]").evaluateAll((els) =>
    els
      .sort((a, b) => Number(a.getAttribute("data-sticker")) - Number(b.getAttribute("data-sticker")))
      .map((e) => (e.getAttribute("aria-label") ?? "").split(": ").pop() ?? ""),
  );
}

function expectSolved(colors: string[]) {
  for (let f = 0; f < 6; f++) {
    const face = colors.slice(f * 16, f * 16 + 16);
    expect(new Set(face).size, `face ${f}: ${face.join(",")}`).toBe(1);
    expect(face[0]).not.toBe("empty");
  }
}

async function loadState(page: Page, text: string) {
  await page.getByText("Apply a scramble / import state").click();
  await page.locator("#state-input").fill(text);
  await page.getByRole("button", { name: "Load", exact: true }).click();
}

test("loads with 96 paintable stickers and a ready solver", async ({ page }) => {
  await open(page);
  await expect(page.locator("[data-testid=cube-net] [data-sticker]")).toHaveCount(96);
  await expect(page.getByTestId("painted-count")).toHaveText("0/96 painted");
  await expect(page.locator("canvas")).toBeVisible();
});

test("paint, undo, redo and persistence", async ({ page }) => {
  await open(page);
  await page.getByTestId("color-red").click();
  await sticker(page, 5).click();
  await expect(sticker(page, 5)).toHaveAttribute("aria-label", /Red$/);
  await expect(page.getByTestId("painted-count")).toHaveText("1/96 painted");
  await page.getByTestId("undo").click();
  await expect(sticker(page, 5)).toHaveAttribute("aria-label", /empty$/);
  await page.getByTestId("redo").click();
  await expect(sticker(page, 5)).toHaveAttribute("aria-label", /Red$/);
  await page.reload();
  await expect(sticker(page, 5)).toHaveAttribute("aria-label", /Red$/);
});

test("validation explains invalid input", async ({ page }) => {
  await open(page);
  await page.getByTestId("solve").click();
  await expect(page.getByTestId("validation-errors")).toContainText("96 stickers are not coloured");
  await page.getByTestId("reset-solved").click();
  await page.getByTestId("color-red").click();
  await sticker(page, 0).click();
  await page.getByTestId("check").click();
  await expect(page.getByTestId("validation-errors")).toContainText("White appears 15 times");
  await expect(page.getByTestId("validation-errors")).toContainText("Red appears 17 times");
  // A twisted corner is reported as such.
  const twisted = solvedState();
  [twisted[15], twisted[16], twisted[35]] = [twisted[35], twisted[15], twisted[16]];
  await loadState(page, serialize(twisted));
  await page.getByTestId("check").click();
  await expect(page.getByTestId("validation-errors")).toContainText("twisted");
});

test("manual entry of a random position, solve, and replay to solved", async ({ page }) => {
  test.slow();
  await open(page);
  const target = randomState(mulberry32(20261013));
  // Enter all 96 stickers by hand, colour by colour.
  for (let c = 0; c < 6; c++) {
    await page.getByTestId(`color-${COLOR_NAMES[c].toLowerCase()}`).click();
    for (let i = 0; i < 96; i++) if (target[i] === c) await sticker(page, i).click();
  }
  await expect(page.getByTestId("painted-count")).toHaveText("96/96 painted");
  expect((await netColors(page)).join(",")).toBe(Array.from(target, (c) => COLOR_NAMES[c]).join(","));

  await page.getByTestId("solve").click();
  await expect(page.getByTestId("verified-badge")).toBeVisible();
  const count = Number((await page.getByTestId("move-count").textContent())!.split(" ")[0]);
  expect(count).toBeGreaterThan(20);
  await expect(page.getByTestId("progress-text")).toHaveText(`Move 1 of ${count}`);

  // Step forward/back
  await page.getByTestId("next").click();
  await expect(page.getByTestId("progress-text")).toHaveText(`Move 2 of ${count}`);
  await page.getByTestId("prev").click();
  await expect(page.getByTestId("progress-text")).toHaveText(`Move 1 of ${count}`);

  // The 3D/net display at any step must equal the start state with the first k moves applied.
  const moves = await page.locator("[data-testid=solution-list] button[aria-label^='Move ']").evaluateAll((els) =>
    els.map((e) => (e.getAttribute("aria-label") ?? "").replace(/^Move \d+: /, "").replace(/ \(next\)$/, "")),
  );
  expect(moves).toHaveLength(count);
  for (let k = 0; k < 8; k++) await page.getByTestId("next").click();
  for (const k of [8, Math.floor(count / 3), Math.floor((2 * count) / 3)]) {
    if (k !== 8) await page.locator(`[data-testid=solution-list] button[aria-label^='Move ${k + 1}:']`).click();
    const expected = applyMoves(target, parseMoves(moves.slice(0, k).join(" ")));
    expect((await netColors(page)).join(",")).toBe(Array.from(expected, (c) => COLOR_NAMES[c]).join(","));
  }
  await page.getByTestId("end").click();
  await expect(page.getByTestId("current-move")).toHaveText("✓");
  expectSolved(await netColors(page));

  await page.getByTestId("restart").click();
  await expect(page.getByTestId("progress-text")).toHaveText(`Move 1 of ${count}`);
  expect((await netColors(page)).join(",")).toBe(Array.from(target, (c) => COLOR_NAMES[c]).join(","));
});

test("scramble via notation, play animation, and jump to end", async ({ page }) => {
  await open(page);
  await page.getByTestId("reset-solved").click();
  await page.getByText("Apply a scramble / import state").click();
  await page.getByTestId("moves-input").fill("Rw U2 2L' F Bw2 D' Lw 2U R2 Fw'");
  await page.getByTestId("apply-moves").click();
  await page.getByTestId("solve").click();
  await expect(page.getByTestId("solve-controls")).toBeVisible();
  await expect(page.getByTestId("verified-badge")).toBeVisible();
  await page.getByTestId("play").click();
  await expect(page.getByTestId("progress-text")).not.toHaveText(/Move 1 of/, { timeout: 10_000 });
  await page.getByTestId("play").click(); // pause
  await page.getByTestId("end").click();
  await expect(page.getByTestId("current-move")).toHaveText("✓");
  expectSolved(await netColors(page));
  await page.getByTestId("back-to-edit").click();
  await expect(page.getByTestId("solve")).toBeVisible();
});

test("theme switch and 3D sticker painting", async ({ page }) => {
  await open(page);
  await page.getByRole("radio", { name: "Dark theme" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByRole("radio", { name: "Light theme" }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  // Tap the middle of the canvas: that hits a sticker on the front-right-top corner region.
  await page.getByTestId("color-green").click();
  const box = (await page.locator("canvas").boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByTestId("painted-count")).toHaveText("1/96 painted");
});
