/**
 * Saved game and replays (from Planecircle's replay smoke): plays part of a game against the AI, reloads the page, and
 * checks that the game is replayed from its record to exactly the same position (the same cards in the same places,
 * the same decision pending); plays on, concedes, downloads the game, watches its replay (steps, end, point of view),
 * and opens the downloaded file from the home screen.
 *
 * Requires: `npm run dev` running. Usage: npx tsx tools/replay-smoke.ts [actionsBefore] [screenshot-dir]
 */
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { openHome, playGame } from "./ui-play";

const BEFORE = Number(process.argv[2] ?? 30);
const OUT = process.argv[3] ?? "test-results/replay";
mkdirSync(OUT, { recursive: true });

/** The position as the player sees it: turn, phase, pending decision, cards of each zone. */
const position = (page: Page) =>
  page.evaluate(() => {
    type V = {
      turn: { number: number; phase: string; step: string | null };
      pending: { kind: string; player: string } | null;
      hand: { defId: string }[];
      field: { defId: string; controller: string; dull: boolean; damage: number }[];
      players: Record<
        string,
        { deckCount: number; handCount: number; damage: { defId: string }[]; breakZone: { defId: string }[] }
      >;
    };
    const v = (window as unknown as { __fc: { getState(): { view: V | null } } }).__fc.getState().view;
    if (!v) return null;
    return JSON.stringify({
      turn: v.turn,
      pending: v.pending && { kind: v.pending.kind, player: v.pending.player },
      hand: v.hand.map((o) => o.defId),
      field: v.field.map((o) => [o.defId, o.controller, o.dull, o.damage]),
      players: Object.entries(v.players).map(([id, p]) => [
        id,
        p.deckCount,
        p.handCount,
        p.damage.map((o) => o.defId),
        p.breakZone.map((o) => o.defId),
      ]),
    });
  });

const errors: string[] = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
await openHome(page, "fr");
await page.locator("[data-testid=play]").click();
await page.locator(".game").waitFor({ timeout: 15_000 });
const mid = await playGame(page, BEFORE);
if (mid.over) errors.push(`the game ended before the reload (turn ${mid.turn}): fewer actions needed`);
// Waits for the human's decision (the AI has finished), then for the save (written at most every 400 ms).
for (let i = 0; i < 50; i++) {
  const s = await page.evaluate(() => {
    const v = (
      window as unknown as {
        __fc: { getState(): { view: { pending: { player: string } | null; viewer: string } | null; busy: boolean } };
      }
    ).__fc.getState();
    return !!v.view && v.view.pending?.player === v.view.viewer && !v.busy;
  });
  if (s) break;
  await page.waitForTimeout(100);
}
await page.waitForTimeout(700);
const before = await position(page);
await page.screenshot({ path: join(OUT, "before.png") });
const decisions = await page.evaluate(
  () =>
    (JSON.parse(localStorage.getItem("finalcircle.localGame") ?? "null") as { record?: { decisions: unknown[] } } | null)?.record
      ?.decisions.length ?? 0,
);

await page.reload();
await page.locator(".game").waitFor({ timeout: 15_000 });
let after: string | null = null;
for (let i = 0; i < 100 && after !== before; i++) {
  await page.waitForTimeout(100);
  after = await position(page);
}
await page.screenshot({ path: join(OUT, "after.png") });
if (!decisions) errors.push("no saved game in the storage");
if (after !== before) errors.push(`position differs after the reload:\nbefore ${before}\nafter  ${after}`);
// The game goes on after the replay.
const end = await playGame(page, 40);
if (!end.turn) errors.push("the game does not go on after the replay");

// The end of the game: the record downloaded, then watched.
if (!end.over) {
  await page.locator("[data-tuto=settings]").click();
  await page.locator(".settings-panel .btn.danger").click();
}
await page.locator("[data-testid=game-over]").waitFor({ timeout: 10_000 });
const [download] = await Promise.all([page.waitForEvent("download"), page.locator("[data-testid=download-game]").click()]);
const file = join(OUT, "game.json");
await download.saveAs(file);
const saved = JSON.parse(readFileSync(file, "utf8")) as { format?: string; decisions?: unknown[] };
if (!saved.decisions?.length) errors.push("the downloaded game has no decisions");
await page.locator("[data-testid=watch-replay]").click();
await page.locator("[data-testid=replay-bar]").waitFor({ timeout: 10_000 });
const pos = () => page.locator("[data-testid=replay-pos]").innerText();
const start = await pos();
for (let i = 0; i < 8; i++) await page.locator("[data-testid=replay-next]").click();
if ((await pos()) === start) errors.push("the replay does not move forward");
await page.screenshot({ path: join(OUT, "replay-step.png") });
await page.locator("[data-testid=replay-end]").click();
const [at, total] = (await pos()).split("/").map((x) => Number(x.trim()));
if (at !== total) errors.push(`the replay did not reach its end (${at} / ${total})`);
const over = await page.evaluate(
  () => (window as unknown as { __fc: { getState(): { view: { over: boolean } | null } } }).__fc.getState().view?.over,
);
if (!over) errors.push("the end of the replay is not the end of the game");
await page.locator(".replay-viewer select").selectOption({ index: 1 });
await page.screenshot({ path: join(OUT, "replay-end.png") });
await page.locator(".replay-bar .btn.ghost").click();

// The downloaded file, opened from the home screen.
await page.locator("[data-testid=replay-file]").setInputFiles(file);
await page.locator("[data-testid=replay-bar]").waitFor({ timeout: 10_000 });
await browser.close();

for (const e of errors) console.log(e);
console.log(
  errors.length
    ? `FAILED: ${errors.length} problem(s)`
    : `ok: replay of the saved game after a reload (${decisions} decisions), of a finished game and of its file`,
);
if (errors.length) process.exit(1);
