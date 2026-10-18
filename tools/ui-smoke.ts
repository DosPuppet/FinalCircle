/**
 * End-to-end test of the interface (from Planecircle): plays a whole game against the AI by clicking like a player
 * (playable cards, payment tray, targets, attackers, blockers, the main button, the questions), and takes screenshots.
 * What is pending is read from the store (`window.__fc`, dev mode); clicks go through the interface only.
 *
 * Requires: `npm run dev` running. Usage: npx tsx tools/ui-smoke.ts [screenshot-dir] [maxActions] [level] [lang]
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright";

const OUT = process.argv[2] ?? "test-results/ui";
const MAX = Number(process.argv[3] ?? 600);
const LEVEL = process.argv[4] ?? "beginner";
const LANG = process.argv[5] ?? "fr";
const URL = process.env.FC_URL ?? "http://localhost:5174";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  // Images refused by the relay (no network, CDN breaker) fall back to the text frame: not an error of the page.
  if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`);
});

interface Probe {
  screen: string;
  kind: string | null;
  mine: boolean;
  over: boolean;
  stage: string | null;
  turn: number;
  phase: string;
  toast: string | null;
}

/** What the probe reads of the store (`packages/client/src/store.ts`). */
interface StoreShape {
  screen: string;
  toast: string | null;
  casting: { stage: string } | null;
  view: {
    viewer: string;
    over: boolean;
    pending: { kind: string; player: string } | null;
    turn: { number: number; phase: string };
  } | null;
}

const probe = (p: Page): Promise<Probe> =>
  p.evaluate(() => {
    const s = (window as unknown as { __fc: { getState(): StoreShape } }).__fc.getState();
    const v = s.view;
    return {
      screen: s.screen,
      kind: v?.pending?.kind ?? null,
      mine: !!v && v.pending?.player === v.viewer,
      over: !!v?.over,
      stage: s.casting?.stage ?? null,
      turn: v?.turn.number ?? 0,
      phase: v?.turn.phase ?? "",
      toast: s.toast,
    };
  });

let shots = 1;
const shot = async (name: string) => page.screenshot({ path: join(OUT, `${String(shots++).padStart(2, "0")}-${name}.png`) });
const click = (sel: string) =>
  page
    .locator(sel)
    .first()
    .click({ force: true, timeout: 2000 })
    .then(() => true)
    .catch(() => false);

await page.goto(`${URL}/?fast`);
await page.evaluate((lang) => {
  localStorage.clear();
  localStorage.setItem("finalcircle.lang", lang);
}, LANG);
await page.reload();
await page.locator("[data-testid=play]").waitFor({ timeout: 10_000 });
await page.locator(".level-choice .seg button").nth(["beginner", "medium", "expert"].indexOf(LEVEL)).click();
await shot("lobby");
await page.locator("[data-testid=play]").click();
await page.locator(".game").waitFor({ timeout: 15_000 });

const seen = new Set<string>();
const once = async (key: string) => {
  if (seen.has(key)) return;
  seen.add(key);
  await page.waitForTimeout(150);
  await shot(key);
};
// Casts tried in this turn (a card refused twice is left alone).
let castTurn = -1;
let casts = 0;
let lastToast: string | null = null;
let over = false;
for (let i = 0; i < MAX; i++) {
  await page.waitForTimeout(60);
  const s = await probe(page);
  if (s.toast && s.toast !== lastToast) console.log(`toast: ${s.toast}`);
  lastToast = s.toast;
  if (s.over) {
    over = true;
    await page
      .locator("[data-testid=game-over]")
      .waitFor({ timeout: 5000 })
      .catch(() => {});
    await shot("end");
    console.log(
      `Game over at turn ${s.turn}: ${await page
        .locator("[data-testid=game-over] h2")
        .innerText()
        .catch(() => "?")}`,
    );
    break;
  }
  if (s.turn !== castTurn) {
    castTurn = s.turn;
    casts = 0;
    if (s.turn === 4 || s.turn === 8) await once(`turn-${s.turn}`);
  }
  if (s.stage === "modes") {
    await click(".modal .btn.mode:not([disabled])");
    await click(".modal .btn.primary:not([disabled])");
    continue;
  }
  if (s.stage === "targets") {
    await once("targets");
    if (!(await click(".glow-target")))
      if (!(await click("[data-testid=targets] .btn.primary:not([disabled])"))) await click("[data-testid=targets] .btn.ghost");
    continue;
  }
  if (s.stage === "pay") {
    await once("payment");
    if (!(await click("[data-testid=pay-confirm]:not([disabled])"))) {
      await page
        .locator(".pay-actions .btn.ghost")
        .nth(1)
        .click({ timeout: 2000 })
        .catch(() => {});
      if (!(await click("[data-testid=pay-confirm]:not([disabled])"))) await click(".pay-actions .btn.ghost");
    }
    continue;
  }
  if (!s.mine || !s.kind) continue;
  switch (s.kind) {
    case "mulligan":
      await once("mulligan");
      await click("[data-testid=keep-btn]");
      break;
    case "choice": {
      if (await page.locator("[data-testid=choice]").count()) {
        await click("[data-testid=choice] .prompt-actions .btn.ghost");
        await click("[data-testid=choice-confirm]:not([disabled])");
      } else if (await page.locator("[data-testid=choice-yes]").count()) {
        if (await page.locator(".ex-reveal").count()) await once("ex-burst");
        await click("[data-testid=choice-yes]");
      } else await click(".modal .btn.primary:not([disabled])");
      break;
    }
    case "discard": {
      const n = await page.locator(".hand .glow-target").count();
      for (let k = 0; k < n; k++) {
        await click(".hand .glow-target");
        if (await page.locator("[data-testid=discard] .btn.primary:not([disabled])").count()) break;
      }
      await click("[data-testid=discard] .btn.primary:not([disabled])");
      break;
    }
    case "declareAttack":
      if (await page.locator(".field.me .glow-playable").count()) {
        await click(".field.me .glow-playable");
        await once("attack");
      }
      await click(".main-button");
      break;
    case "declareBlock":
      if (i % 2 && (await page.locator(".field.me .glow-playable").count())) {
        await click(".field.me .glow-playable");
        await once("block");
      }
      await click(".main-button");
      break;
    case "priority":
      if (casts < 4 && (await page.locator(".hand .glow-playable").count())) {
        casts++;
        await page
          .locator(".hand .glow-playable")
          .first()
          .hover({ force: true })
          .catch(() => {});
        await click(".hand .glow-playable");
        await page.waitForTimeout(100);
        if (await page.locator(".modal .btn.mode").count()) await click(".modal .btn.mode");
        break;
      }
      await click(".main-button");
      break;
    default:
      await click(".main-button");
  }
}

if (!over) {
  await shot("stop");
  const s = await probe(page);
  errors.push(`stopped without game over: ${JSON.stringify(s)}`);
}
console.log(errors.length ? `Errors:\n${errors.join("\n")}` : "No page error.");
await browser.close();
if (errors.length) process.exit(1);
