/**
 * End-to-end test of the interface (from Planecircle): plays a whole game against the AI by clicking like a player
 * (`ui-play.ts`), takes screenshots of its moments, and checks the sounds played.
 *
 * Requires: `npm run dev` running. Usage: npx tsx tools/ui-smoke.ts [screenshot-dir] [maxActions] [level] [lang]
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { openHome, playGame } from "./ui-play";

const OUT = process.argv[2] ?? "test-results/ui";
const MAX = Number(process.argv[3] ?? 600);
const LEVEL = process.argv[4] ?? "beginner";
const LANG = process.argv[5] === "en" ? "en" : "fr";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  // Images refused by the relay (no network, CDN breaker) fall back to the text frame: not an error of the page.
  if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`);
});

let shots = 1;
const shot = async (name: string) => page.screenshot({ path: join(OUT, `${String(shots++).padStart(2, "0")}-${name}.png`) });

await openHome(page, LANG, LEVEL);
await shot("lobby");
await page.locator("[data-testid=play]").click();
await page.locator(".game").waitFor({ timeout: 15_000 });

const end = await playGame(page, MAX, {
  moment: shot,
  // A refused decision is a mismatch between the interface and the engine.
  toast: (text) => errors.push(`toast: ${text}`),
});
if (end.over) {
  await page
    .locator("[data-testid=game-over]")
    .waitFor({ timeout: 5000 })
    .catch(() => {});
  await shot("end");
  const title = await page
    .locator("[data-testid=game-over] h2")
    .innerText()
    .catch(() => "?");
  console.log(`Game over at turn ${end.turn}: ${title}`);
} else {
  await shot("stop");
  errors.push(`stopped without game over: ${JSON.stringify(end)}`);
}

// Sound effects played during the game (dev-mode log, audio/sfx.ts).
const played = new Set(await page.evaluate(() => (window as unknown as { __sfxLog?: string[] }).__sfxLog ?? []));
const expected = ["shuffle", "draw", "place", "attack", "hitHeavy", "click", "turn"];
const silent = expected.filter((k) => !played.has(k));
console.log(`Sounds played: ${[...played].sort().join(", ")}`);
if (silent.length) errors.push(`sounds never played: ${silent.join(", ")}`);
console.log(errors.length ? `Errors:\n${errors.join("\n")}` : "No page error.");
await browser.close();
if (errors.length) process.exit(1);
