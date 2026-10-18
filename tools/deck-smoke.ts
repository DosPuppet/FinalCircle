/**
 * Deck builder (from Planecircle): copies a prebuilt deck, takes a card out (the deck is no longer legal) and puts it
 * back, renames the deck, shares it by link, imports the link in another tab, and starts a game with the new deck.
 *
 * Requires: `npm run dev` running. Usage: npx tsx tools/deck-smoke.ts [screenshot-dir]
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { BASE_URL, openHome, probe } from "./ui-play";

const OUT = process.argv[2] ?? "test-results/deck";
mkdirSync(OUT, { recursive: true });
const errors: string[] = [];
const fail = (why: string) => {
  errors.push(why);
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
await openHome(page, "en");
await page.locator("[data-testid=open-decks]").click();
await page.locator(".deck-item").first().click();
await page.locator("[data-testid=copy-deck]").click();
await page.locator("[data-testid=deck-name]").waitFor();
const check = page.locator("[data-testid=deck-check]");
if (!(await check.innerText()).includes("The deck is legal.")) fail("the copy of a prebuilt deck is not legal");

// One copy out: 49 cards.
const first = page.locator(".deck-row").first();
const name = (await first.locator(".deck-name").innerText()).trim();
await first.locator("button").first().click();
if (!/exactly 50 cards \(it has 49\)/.test(await check.innerText())) fail("49 cards are not refused");
await page.screenshot({ path: join(OUT, "49-cards.png") });
// Back in from the catalog, found by its name.
await page.locator("[data-testid=deck-search]").fill(name);
await page.locator(".catalog-card .card").first().click();
if (!(await check.innerText()).includes("The deck is legal.")) fail(`${name} could not be put back`);
await page.locator("[data-testid=deck-name]").fill("Smoke deck");
await page.screenshot({ path: join(OUT, "deck.png") });

// Shared by link, imported in another tab.
await page.locator("[data-testid=share-deck]").click();
const link = page.locator("[data-testid=deck-link]");
await link.waitFor({ timeout: 5000 });
const url = await link.inputValue();
if (!url.startsWith(`${BASE_URL}/#deck=1.`)) fail(`unexpected link: ${url}`);
await page.keyboard.press("Escape");
const other = await context.newPage();
other.on("pageerror", (e) => errors.push(`pageerror (link): ${e.message}`));
await other.goto(url.replace(BASE_URL, `${BASE_URL}/?fast`).replace("/?fast/#", "/?fast#"));
await other.locator("[data-testid=import-deck]").click({ timeout: 10_000 });
await other.locator("[data-testid=deck-name]").waitFor();
if ((await other.locator("[data-testid=deck-name]").inputValue()) !== "Smoke deck") fail("the imported deck lost its name");
if (!(await other.locator("[data-testid=deck-check]").innerText()).includes("The deck is legal."))
  fail("the imported deck is not legal");
await other.screenshot({ path: join(OUT, "imported.png") });
await other.close();

// A game with the new deck.
await page.reload();
await page.locator("[data-testid=play]").waitFor({ timeout: 10_000 });
const option = page.locator(".deck-choice").first().locator(".deck-option", { hasText: "Smoke deck" }).first();
if (!(await option.count())) fail("the new deck is not offered on the home screen");
else await option.click();
await page.locator("[data-testid=play]").click();
await page.locator(".game").waitFor({ timeout: 15_000 });
let started = false;
for (let i = 0; i < 100 && !started; i++) {
  await page.waitForTimeout(100);
  started = (await probe(page)).kind !== null;
}
if (!started) fail("the game did not start");
await page.screenshot({ path: join(OUT, "game.png") });
await browser.close();

for (const e of errors) console.log(e);
console.log(errors.length ? `FAILED: ${errors.length} problem(s)` : "ok: game started with a deck built, shared and imported");
if (errors.length) process.exit(1);
