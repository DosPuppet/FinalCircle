/**
 * Tutorial followed through the interface (from Planecircle): every lesson is opened from the tutorial menu and its
 * steps are followed like a player — "Next", hovering a card, casting from the hand or the LB deck, paying, choosing
 * targets, abilities, attacks, blocks, answers. The step expected is read from the page (`window.__tutoStep`, dev
 * mode); clicks go through the interface only. The last lesson (a whole game) is played to its end.
 *
 * Requires: `npm run dev` running. Usage: npx tsx tools/tutorial-smoke.ts [lang] [screenshot-dir] [lessonId…]
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { openHome, playGame, probe } from "./ui-play";

const LANG = process.argv[2] === "en" ? "en" : "fr";
const OUT = process.argv[3] ?? "test-results/tutorial";
const ONLY = process.argv.slice(4);
mkdirSync(OUT, { recursive: true });

type Allow =
  | { cast: string; target?: string }
  | { activate: string; ability?: number; target?: string }
  | { attack: string[] }
  | { block: string | null }
  | { choose: "yes" | "no" | string[] }
  | string;

interface StepInfo {
  lesson: string | null;
  index?: number;
  finished: boolean;
  next?: boolean;
  free?: boolean;
  allow?: Allow[];
  target?: { card: string; zone?: string } | string | null;
}

const errors: string[] = [];
const stepOf = (page: Page) => page.evaluate(() => (window as unknown as { __tutoStep: () => StepInfo }).__tutoStep());
const click = (page: Page, sel: string) =>
  page
    .locator(sel)
    .first()
    .click({ force: true, timeout: 2000 })
    .then(() => true)
    .catch(() => false);

/** The cards a step wants picked in a question. */
const wantedCodes = (allow: Allow[]): string[] =>
  allow.flatMap((a) =>
    typeof a === "object" && "choose" in a && Array.isArray(a.choose)
      ? a.choose
      : typeof a === "object" && "target" in a && a.target
        ? [a.target]
        : [],
  );

/** One action towards the step; false when nothing applied. */
async function act(page: Page, st: StepInfo): Promise<boolean> {
  const s = await probe(page);
  const allow = st.allow ?? [];
  const wanted = wantedCodes(allow);
  if (s.stage === "modes") {
    await click(page, ".modal .btn.mode:not([disabled])");
    return click(page, ".modal .btn.primary:not([disabled])");
  }
  if (s.stage === "targets") {
    for (const code of wanted) if (await click(page, `[data-def="${code}"] .card.glow-target`)) return true;
    if (await click(page, ".card.glow-target")) return true;
    return click(page, "[data-testid=targets] .btn.primary:not([disabled])");
  }
  if (s.stage === "pay") {
    if (await click(page, "[data-testid=pay-confirm]:not([disabled])")) return true;
    await click(page, "[data-testid=pay-auto]");
    return click(page, "[data-testid=pay-confirm]:not([disabled])");
  }
  if (!s.mine) return false;
  if (s.kind === "choice") {
    if (await page.locator("[data-testid=choice-yes]").count()) return click(page, "[data-testid=choice-yes]");
    if (await page.locator("[data-testid=choice]").count()) {
      let picked = false;
      for (const code of wanted) picked = (await click(page, `[data-def="${code}"] .card.glow-target`)) || picked;
      if (!picked) await click(page, "[data-testid=choice-suggest]");
      return click(page, "[data-testid=choice-confirm]:not([disabled])");
    }
    return click(page, ".modal .btn.primary:not([disabled])");
  }
  if (s.kind === "discard") {
    await click(page, ".hand .glow-target");
    return click(page, "[data-testid=discard] .btn.primary:not([disabled])");
  }
  for (const a of allow) {
    if (typeof a === "string") {
      if (a === "endTurn" && (s.kind === "priority" || s.kind === "declareAttack"))
        return (await click(page, "[data-tuto=endTurn]")) || click(page, ".main-button");
      if ((a === "pass" && s.kind === "priority") || (a === "endAttacks" && s.kind === "declareAttack"))
        return click(page, ".main-button");
      continue;
    }
    if ("cast" in a && s.kind === "priority") {
      if (await click(page, `.hand [data-def="${a.cast}"] .card`)) {
        // A card that can also be used from the hand: "Cast" in its menu.
        await page.waitForTimeout(100);
        if (await page.locator("[data-testid=ability-cast]").count()) await click(page, "[data-testid=ability-cast]");
        return true;
      }
      // A Limit Break card: from the LB deck.
      await click(page, "[data-tuto=my-lb]");
      if (await click(page, `[data-testid=zone-dialog] [data-def="${a.cast}"] .card.clickable`)) return true;
      await page.keyboard.press("Escape");
      continue;
    }
    if ("activate" in a && s.kind === "priority") {
      if (!(await click(page, `.field.me [data-def="${a.activate}"] .card`))) continue;
      await page.waitForTimeout(100);
      if (await page.locator("[data-testid^=ability-]").count())
        await click(page, a.ability === undefined ? "[data-testid^=ability-]" : `[data-testid=ability-${a.ability}]`);
      return true;
    }
    if ("attack" in a && s.kind === "declareAttack") {
      for (const code of a.attack) await click(page, `.field.me [data-def="${code}"] .card:not(.glow-selected)`);
      return click(page, ".main-button");
    }
    if ("block" in a && s.kind === "declareBlock") {
      if (a.block) await click(page, `.field.me [data-def="${a.block}"] .card`);
      return click(page, ".main-button");
    }
  }
  return false;
}

async function follow(page: Page, lessonId: string): Promise<void> {
  let lastKey = "";
  let stuck = 0;
  for (let i = 0; i < 400; i++) {
    await page.waitForTimeout(120);
    const st = await stepOf(page);
    if (st.lesson !== lessonId) {
      errors.push(`${lessonId}: the lesson stopped (${JSON.stringify(st)})`);
      return;
    }
    if (st.finished) return;
    const key = `${st.index}`;
    if (key === lastKey) stuck++;
    else {
      stuck = 0;
      lastKey = key;
      await page.screenshot({ path: join(OUT, `${LANG}-${lessonId}-${String(st.index).padStart(2, "0")}.png`) });
    }
    if (stuck > 60) {
      errors.push(`${lessonId}: stuck at step ${(st.index ?? 0) + 1} (${JSON.stringify(await probe(page))})`);
      return;
    }
    if (st.next) {
      await click(page, "[data-testid=coach-next]");
      continue;
    }
    if (st.free) {
      await playGame(page, 1500);
      continue;
    }
    const target = st.target;
    if (typeof target === "object" && target && !st.allow?.length) {
      await page
        .locator(`[data-def="${target.card}"]`)
        .first()
        .hover({ force: true, timeout: 2000 })
        .catch(() => {});
      continue;
    }
    await act(page, st);
  }
  errors.push(`${lessonId}: not finished after 400 rounds`);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
await openHome(page, LANG);
await page.locator("[data-testid=open-tutorial]").click();
const ids = await page
  .locator("[data-testid^=lesson-]")
  .evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")?.slice(7) ?? ""));
let followed = 0;
for (const id of ids.filter((x) => !ONLY.length || ONLY.includes(x))) {
  if (!(await page.locator(`[data-testid=lesson-${id}]`).count())) {
    await openHome(page, LANG);
    await page.locator("[data-testid=open-tutorial]").click();
  }
  await page.locator(`[data-testid=lesson-${id}]`).click();
  await page.locator(".game").waitFor({ timeout: 15_000 });
  await follow(page, id);
  const done = await page.locator("[data-testid=coach-done]").count();
  if (!done) errors.push(`${id}: no "lesson complete" message`);
  else followed++;
  await page.screenshot({ path: join(OUT, `${LANG}-${id}-done.png`) });
  // Back to the tutorial menu.
  await page
    .locator(".coach .btn", { hasText: /Menu|menu/ })
    .first()
    .click({ timeout: 3000 })
    .catch(() => {});
  await page
    .locator("[data-testid^=lesson-]")
    .first()
    .waitFor({ timeout: 5000 })
    .catch(() => {});
}
await browser.close();

for (const e of errors) console.log(e);
console.log(
  errors.length ? `FAILED: ${errors.length} problem(s)` : `ok: tutorial followed end to end (${followed} lessons, ${LANG})`,
);
if (errors.length) process.exit(1);
