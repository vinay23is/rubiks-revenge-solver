/** Captures README screenshots from a running server (default http://localhost:3125). */
import { chromium, devices } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:3125";
const STATE = "GGRGRBBYRGOGRGBBROBOYRGWOOBGYBGBGWWWRWRBYRBYYYGRBRWGWWROOYGYOOBROYBWBYGGRWOOWWROYWOWOYYWYWOGYRBB";

async function prep(page: import("@playwright/test").Page, theme: "light" | "dark") {
  await page.goto(base);
  await page.evaluate(
    ([s, t]) => localStorage.setItem("rrs-cube-v1", JSON.stringify({ state: { stickers: s, theme: t, showNet: true, speed: 1.5, past: [], future: [], selectedColor: 0 }, version: 1 })),
    [STATE, theme],
  );
  await page.reload();
  await page.getByTestId("cube-net").waitFor();
  await page.waitForTimeout(1500);
}

(async () => {
  const browser = await chromium.launch();
  const desk = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await prep(desk, "light");
  await desk.screenshot({ path: "docs/screenshots/edit-light.png" });
  await desk.getByTestId("solve").click();
  await desk.getByTestId("verified-badge").waitFor();
  for (let i = 0; i < 6; i++) await desk.getByTestId("next").click();
  await desk.evaluate(() => window.scrollTo(0, 0));
  await desk.waitForTimeout(1200);
  await desk.screenshot({ path: "docs/screenshots/solve-light.png" });

  const dark = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: "dark" });
  await prep(dark, "dark");
  await dark.getByTestId("solve").click();
  await dark.getByTestId("verified-badge").waitFor();
  for (let i = 0; i < 30; i++) await dark.getByTestId("next").click();
  await dark.evaluate(() => window.scrollTo(0, 0));
  await dark.waitForTimeout(1200);
  await dark.screenshot({ path: "docs/screenshots/solve-dark.png" });

  const mob = await browser.newPage({ ...devices["iPhone 13"] });
  await prep(mob, "light");
  await mob.screenshot({ path: "docs/screenshots/mobile-edit.png" });
  await browser.close();
  console.log("screenshots written");
})();
