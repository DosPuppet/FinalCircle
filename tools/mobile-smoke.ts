/**
 * Phones (from Planecircle): plays a game with touch in portrait (390×844) and in landscape (844×390), and checks that
 * the page never scrolls sideways or past the screen, that the hand and the main button stay on screen, and that a
 * long press shows a card large (then a tap closes it).
 *
 * Requires: `npm run dev` running. Usage: npx tsx tools/mobile-smoke.ts [maxActions] [screenshot-dir]
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { openHome, playGame } from "./ui-play";

const MAX = Number(process.argv[2] ?? 200);
const OUT = process.argv[3] ?? "test-results/mobile";
mkdirSync(OUT, { recursive: true });

const errors: string[] = [];

/** The page fits the screen, and the given elements are inside it. */
async function fits(page: Page, where: string, selectors: string[]): Promise<void> {
  const r = await page.evaluate((sels) => {
    const d = document.documentElement;
    const out: string[] = [];
    if (d.scrollWidth > innerWidth + 1) out.push(`page ${d.scrollWidth}px wide for ${innerWidth}px`);
    if (d.scrollHeight > innerHeight + 1) out.push(`page ${d.scrollHeight}px high for ${innerHeight}px`);
    for (const sel of sels) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const b = el.getBoundingClientRect();
      if (b.left < -1 || b.top < -1 || b.right > innerWidth + 1 || b.bottom > innerHeight + 1)
        out.push(
          `${sel} outside the screen (${Math.round(b.left)},${Math.round(b.top)} – ${Math.round(b.right)},${Math.round(b.bottom)})`,
        );
    }
    return out;
  }, selectors);
  for (const e of r) errors.push(`${where}: ${e}`);
}

const browser = await chromium.launch();
for (const [name, width, height] of [
  ["portrait", 390, 844],
  ["landscape", 844, 390],
] as const) {
  const page = await browser.newPage({ viewport: { width, height }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  page.on("pageerror", (e) => errors.push(`${name} pageerror: ${e.message}`));
  await openHome(page, "fr");
  await page.screenshot({ path: join(OUT, `${name}-home.png`) });
  await page.locator("[data-testid=play]").click();
  await page.locator(".game").waitFor({ timeout: 15_000 });

  let peeked = false;
  const end = await playGame(page, MAX, {
    moment: async (moment) => {
      await page.screenshot({ path: join(OUT, `${name}-${moment}.png`) });
      await fits(page, `${name} ${moment}`, [".hand", ".main-button", ".payment-tray", ".choice-panel", ".modal"]);
    },
    step: async (i, s) => {
      // Once, on the player's main phase: a long press on a card of the hand shows it large, a tap closes it.
      if (peeked || i < 10 || !s.mine || s.kind !== "priority" || s.stage) return;
      const card = page.locator(".hand .card").first();
      if (!(await card.count())) return;
      const box = await card.boundingBox({ timeout: 2000 }).catch(() => null);
      if (!box) return;
      peeked = true;
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2).catch(() => {});
      await card.dispatchEvent("pointerdown", { pointerType: "touch", clientX: box.x + 5, clientY: box.y + 5 });
      await page.waitForTimeout(600);
      await card.dispatchEvent("pointerup", { pointerType: "touch" });
      if (!(await page.locator(".touch-preview .preview").count())) errors.push(`${name}: no preview after a long press`);
      else {
        await page.screenshot({ path: join(OUT, `${name}-peek.png`) });
        // A later tap (the one ending the long press is swallowed), beside the card.
        await page.waitForTimeout(800);
        await page.locator(".touch-preview").click({ position: { x: 8, y: 8 } });
        if (await page.locator(".touch-preview").count()) errors.push(`${name}: the preview does not close`);
      }
      // The tap above may have opened a casting: cancelled.
      await page.keyboard.press("Escape");
    },
  });
  await page.screenshot({ path: join(OUT, `${name}-end.png`) });
  await fits(page, `${name} end`, [".hand", ".main-button"]);
  if (!peeked) errors.push(`${name}: long press never tried`);
  if (!end.over && end.turn < 3) errors.push(`${name}: the game did not get past turn ${end.turn}`);
  await page.close();
}
await browser.close();

for (const e of errors) console.log(e);
console.log(errors.length ? `FAILED: ${errors.length} problem(s)` : "ok: no page error");
if (errors.length) process.exit(1);
