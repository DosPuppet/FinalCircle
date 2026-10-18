/**
 * Display in both languages (from Planecircle): opens the home screen, the tutorial menu and the deck builder, then
 * plays a game against the AI, in French and in English, and checks every text shown (text, `title`, `aria-label`):
 * - no raw marker of an engine text (`⟨…⟩`, `⟦…⟧`): a text not rendered through the decoder;
 * - in English, no French line (detector of `cards/test/frenchSource.ts`);
 * - in French, no line that is an English message id with another French translation: a text not translated.
 *
 * Requires: `npm run dev` running. Usage: npx tsx tools/lang-smoke.ts [maxActions] [screenshot-dir]
 */
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { isFrenchLine } from "../packages/cards/test/frenchSource";
import { openHome, playGame } from "./ui-play";

const MAX = Number(process.argv[2] ?? 250);
const OUT = process.argv[3] ?? "test-results/lang";
mkdirSync(OUT, { recursive: true });

/** English ids whose French differs (context prefix removed), to spot untranslated texts in the French interface. */
const UNTRANSLATED = new Set<string>();
const catalogs = [
  "packages/engine/locales/fr.json",
  "packages/client/locales/fr.json",
  "packages/server/locales/fr.json",
  ...readdirSync("packages/cards/locales/fr").map((f) => `packages/cards/locales/fr/${f}`),
];
for (const f of catalogs)
  for (const [id, fr] of Object.entries(JSON.parse(readFileSync(f, "utf8")) as Record<string, string>)) {
    const en = id.replace(/^ctx:[^|]*\|/, "");
    if (!en.includes("{") && en !== fr && /[a-z]{3}/.test(en)) UNTRANSLATED.add(en);
  }
// French texts spelled like an English id (another meaning) are not errors, nor official French card names
// ("Lightning" is a card as well as an element).
for (const f of catalogs)
  for (const fr of Object.values(JSON.parse(readFileSync(f, "utf8")) as Record<string, string>)) UNTRANSLATED.delete(fr);
for (const f of readdirSync("packages/cards/data").filter((x) => x.endsWith(".json")))
  for (const c of Object.values(JSON.parse(readFileSync(`packages/cards/data/${f}`, "utf8")) as { fr?: { name?: string } }[]))
    if (c?.fr?.name) UNTRANSLATED.delete(c.fr.name);

type Lang = "fr" | "en";
const problems = new Map<string, string>();

/** Every visible text of the page, line by line, with the `title` and `aria-label` attributes. */
async function texts(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out = document.body.innerText.split("\n");
    for (const el of document.querySelectorAll("[title], [aria-label]")) {
      const t = el.getAttribute("title");
      const a = el.getAttribute("aria-label");
      if (t) out.push(t);
      if (a) out.push(a);
    }
    return out.map((l) => l.trim()).filter(Boolean);
  });
}

async function check(page: Page, lang: Lang, where: string): Promise<void> {
  for (const line of await texts(page)) {
    let why: string | null = null;
    if (/[⟨⟩⟦⟧]/.test(line)) why = "raw marker";
    else if (lang === "en" && isFrenchLine(line)) why = "French in English";
    else if (lang === "fr" && UNTRANSLATED.has(line)) why = "untranslated";
    if (why && !problems.has(`${lang}|${line}`)) problems.set(`${lang}|${line}`, `${lang} ${where}: ${why}: ${line}`);
  }
}

const browser = await chromium.launch();
const errors: string[] = [];
for (const lang of ["fr", "en"] as const) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on("pageerror", (e) => errors.push(`${lang} pageerror: ${e.message}`));
  await openHome(page, lang);
  await check(page, lang, "home");
  await page.screenshot({ path: join(OUT, `${lang}-home.png`) });
  // The tutorial menu and the deck builder, then back home.
  await page.locator("[data-testid=open-tutorial]").click();
  await page.locator("[data-testid^=lesson-]").first().waitFor({ timeout: 5000 });
  await check(page, lang, "tutorial menu");
  await page.screenshot({ path: join(OUT, `${lang}-tutorial.png`) });
  await openHome(page, lang);
  await page.locator("[data-testid=open-decks]").click();
  await page.locator(".deck-item").first().click();
  await check(page, lang, "deck builder");
  await openHome(page, lang);
  await page.locator("[data-testid=play]").click();
  await page.locator(".game").waitFor({ timeout: 15_000 });
  const end = await playGame(page, MAX, {
    step: async (i) => {
      if (i % 6 === 0) await check(page, lang, `game, action ${i}`);
    },
    moment: async (name) => check(page, lang, name),
  });
  // The end-of-game window (after a concession from the settings panel if the game is not over), then the panel.
  if (!end.over) {
    await page.locator("[data-tuto=settings]").click();
    await page.locator(".settings-panel .btn.danger").click();
  }
  await page.locator("[data-testid=game-over]").waitFor({ timeout: 10_000 });
  await check(page, lang, "game over");
  await page
    .locator("[data-testid=see-board]")
    .click({ timeout: 5000 })
    .catch(async (e: Error) => {
      await page.screenshot({ path: join(OUT, `${lang}-stuck.png`) });
      throw e;
    });
  if (!(await page.locator(".settings-panel").count())) await page.locator("[data-tuto=settings]").click();
  await page.waitForTimeout(200);
  await check(page, lang, "settings");
  await page.screenshot({ path: join(OUT, `${lang}-game.png`) });
  await page.close();
}
await browser.close();

for (const p of problems.values()) console.log(p);
for (const e of errors) console.log(e);
const failed = problems.size + errors.length;
console.log(failed ? `FAILED: ${problems.size} text(s), ${errors.length} page error(s)` : "ok: both languages, no page error");
if (failed) process.exit(1);
