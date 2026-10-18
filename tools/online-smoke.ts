/**
 * Online play in two browsers (from Planecircle): Alice creates a room, Bob joins it with its code, both play the game
 * to its end through the interface (`ui-play.ts`), then a rematch starts a new game; a third player starts a game
 * against the server's AI. The server is started here if none answers on port 8788 (games in memory only).
 *
 * Requires: `npm run dev` running. Usage: npx tsx tools/online-smoke.ts [maxActions] [screenshot-dir]
 */
import { type ChildProcess, spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { type Browser, chromium, type Page } from "playwright";
import { BASE_URL, playGame, probe } from "./ui-play";

const MAX = Number(process.argv[2] ?? 900);
const OUT = process.argv[3] ?? "test-results/online";
const SERVER = "http://127.0.0.1:8788";
mkdirSync(OUT, { recursive: true });

const errors: string[] = [];

async function serverUp(): Promise<boolean> {
  try {
    return (await fetch(`${SERVER}/healthz`, { signal: AbortSignal.timeout(1000) })).ok;
  } catch {
    return false;
  }
}

let child: ChildProcess | null = null;
if (!(await serverUp())) {
  child = spawn("npx", ["tsx", "packages/server/src/main.ts"], {
    env: { ...process.env, PORT: "8788", HOST: "127.0.0.1", FC_DATA_DIR: "off", FC_AI_WORKERS: "1" },
    stdio: "ignore",
  });
  for (let i = 0; i < 60 && !(await serverUp()); i++) await new Promise((r) => setTimeout(r, 250));
  if (!(await serverUp())) throw new Error("the server did not start");
}

/** A player in their own browser context (their own storage: nickname, token). */
async function player(browser: Browser, name: string): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1400, height: 860 } });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(`${name} pageerror: ${e.message}`));
  await page.goto(`${BASE_URL}/?fast`);
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("finalcircle.lang", "fr");
  });
  await page.reload();
  await page.locator("[data-testid=open-online]").click();
  await page.locator("[data-testid=nickname]").fill(name);
  return page;
}

const browser = await chromium.launch();
try {
  const alice = await player(browser, "Alice");
  await alice.locator("[data-testid=create-room]").click();
  const code = (await alice.locator("[data-testid=room-code]").innerText({ timeout: 10_000 })).trim();
  if (!/^[A-Z0-9]{6}$/.test(code)) errors.push(`unexpected room code: ${code}`);
  await alice.screenshot({ path: join(OUT, "waiting.png") });

  const bob = await player(browser, "Bob");
  await bob.locator("[data-testid=room-code-input]").fill(code);
  await bob.locator("[data-testid=join-room]").click();
  await Promise.all([alice.locator(".game").waitFor({ timeout: 15_000 }), bob.locator(".game").waitFor({ timeout: 15_000 })]);
  await bob.screenshot({ path: join(OUT, "bob-start.png") });

  // Both play until the end of the game.
  const [endA, endB] = await Promise.all([playGame(alice, MAX), playGame(bob, MAX)]);
  if (!endA.over || !endB.over) errors.push(`the game did not end (Alice ${JSON.stringify(endA)}, Bob ${JSON.stringify(endB)})`);
  await alice.screenshot({ path: join(OUT, "alice-end.png") });
  const names = await alice.locator(".player-name").allInnerTexts();
  if (!names.some((n) => n.includes("Bob"))) errors.push(`Alice does not see Bob's name: ${names.join(", ")}`);

  // Rematch: Alice asks, Bob accepts, a new game starts for both.
  await alice.locator("[data-testid=rematch]").click();
  await bob.locator("[data-testid=rematch]").click({ timeout: 10_000 });
  for (const [who, page] of [
    ["Alice", alice],
    ["Bob", bob],
  ] as const) {
    let fresh = false;
    for (let i = 0; i < 80 && !fresh; i++) {
      await page.waitForTimeout(100);
      const s = await probe(page);
      fresh = !s.over && s.kind !== null;
    }
    if (!fresh) errors.push(`${who}: no new game after the rematch`);
  }
  await bob.screenshot({ path: join(OUT, "rematch.png") });

  // Against the server's AI: the game starts at once, and the AI plays.
  const carol = await player(browser, "Carol");
  await carol.locator(".online-card .seg button").nth(1).click();
  await carol.locator("[data-testid=create-room]").click();
  await carol.locator(".game").waitFor({ timeout: 15_000 });
  const vsAi = await playGame(carol, 150);
  const aiName = await carol.locator(".zones.opp .player-name").innerText();
  if (!/IA/.test(aiName)) errors.push(`the AI seat's name is not translated: ${aiName}`);
  if (vsAi.turn < 2 && !vsAi.over) errors.push(`the game against the server's AI did not go on (${JSON.stringify(vsAi)})`);
  await carol.screenshot({ path: join(OUT, "carol-ai.png") });
} finally {
  await browser.close();
  child?.kill();
}

for (const e of errors) console.log(e);
console.log(errors.length ? `FAILED: ${errors.length} problem(s)` : "ok: online duel, rematch and game against the server's AI");
if (errors.length) process.exit(1);
