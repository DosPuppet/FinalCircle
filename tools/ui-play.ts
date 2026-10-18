/**
 * Plays a game against the AI in a browser page by clicking like a player (playable cards, payment tray, targets,
 * attackers, blockers, the main button, the questions), for the interface smokes (`ui-smoke`, `lang-smoke`,
 * `mobile-smoke`). What is pending is read from the store (`window.__fc`, dev mode); clicks go through the interface
 * only, and work in both languages (test ids and classes, never labels).
 */
import type { Page } from "playwright";

export const BASE_URL = process.env.FC_URL ?? "http://localhost:5174";

export interface Probe {
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

export const probe = (p: Page): Promise<Probe> =>
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

/** Opens the home screen in fast mode, with a clean storage, a language and an AI level. */
export async function openHome(page: Page, lang: "fr" | "en", level = "beginner"): Promise<void> {
  await page.goto(`${BASE_URL}/?fast`);
  await page.evaluate(
    ([l, lv]) => {
      localStorage.clear();
      localStorage.setItem("finalcircle.lang", l as string);
      localStorage.setItem("finalcircle.aiLevel", lv as string);
    },
    [lang, level],
  );
  await page.reload();
  await page.locator("[data-testid=play]").waitFor({ timeout: 15_000 });
}

export interface PlayHooks {
  /** Called once per moment worth a screenshot (mulligan, payment, targets, attack, block, EX Burst, turns 4 and 8). */
  moment?: (name: string) => Promise<unknown>;
  /** Called before each action, with its index. */
  step?: (i: number, s: Probe) => Promise<void>;
  /** A message of the interface (refused decision…). */
  toast?: (text: string) => void;
}

/** Plays from the game screen until the game ends or `max` actions; returns the last probe. */
export async function playGame(page: Page, max: number, hooks: PlayHooks = {}): Promise<Probe> {
  const click = (sel: string) =>
    page
      .locator(sel)
      .first()
      .click({ force: true, timeout: 2000 })
      .then(() => true)
      .catch(() => false);
  const seen = new Set<string>();
  const once = async (key: string) => {
    if (seen.has(key) || !hooks.moment) return;
    seen.add(key);
    await page.waitForTimeout(150);
    await hooks.moment(key);
  };
  // Casts tried in this turn (a card refused twice is left alone).
  let castTurn = -1;
  let casts = 0;
  let lastToast: string | null = null;
  let s = await probe(page);
  for (let i = 0; i < max; i++) {
    await page.waitForTimeout(60);
    s = await probe(page);
    if (s.toast && s.toast !== lastToast) hooks.toast?.(s.toast);
    lastToast = s.toast;
    await hooks.step?.(i, s);
    if (s.over) return s;
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
        await click("[data-testid=pay-auto]");
        if (!(await click("[data-testid=pay-confirm]:not([disabled])"))) await click("[data-testid=pay-cancel]");
      }
      continue;
    }
    if (!s.mine || !s.kind) continue;
    switch (s.kind) {
      case "mulligan":
        await once("mulligan");
        await click("[data-testid=keep-btn]");
        break;
      case "choice":
        if (await page.locator("[data-testid=choice]").count()) {
          await click("[data-testid=choice-suggest]");
          await click("[data-testid=choice-confirm]:not([disabled])");
        } else if (await page.locator("[data-testid=choice-yes]").count()) {
          if (await page.locator(".ex-reveal").count()) await once("ex-burst");
          await click("[data-testid=choice-yes]");
        } else await click(".modal .btn.primary:not([disabled])");
        break;
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
            .hover({ force: true, timeout: 2000 })
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
  return s;
}
