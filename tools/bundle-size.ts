/**
 * Size budget of the interface bundle (from Planecircle): builds the client (`vite build`) and checks the size of each
 * chunk. The game worker must not embed the cards (it receives their definitions from the page).
 *
 * Usage: npx tsx tools/bundle-size.ts   (run by `npm run verify`)
 */
import { execSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";

const KB = 1024;
/**
 * Maximum size of each chunk (name prefix → bytes). Sizes at A8 (2026-10-18), with the 42 starter cards: worker 79 KB,
 * index 106 KB, cards 36 KB, locales 18 KB, vendor 343 KB, synth 7 KB. The card chunks grow with L3 (PLAN-B).
 */
const BUDGET: Record<string, number> = {
  "game.worker": 250 * KB,
  // Engine, AI-free interface and card scripts.
  index: 600 * KB,
  // Card data (official texts, both languages).
  cards: 1500 * KB,
  // French catalogs, loaded at start-up (French is the default language).
  locales: 400 * KB,
  vendor: 420 * KB,
  // Synthesized sound cues (audio/synth.ts), loaded on demand.
  synth: 12 * KB,
};

const CSS_BUDGET: Record<string, number> = {
  index: 40 * KB,
};

execSync("npm run build -w @finalcircle/client", { stdio: "pipe" });
const dir = new URL("../packages/client/dist/assets/", import.meta.url);
const all = readdirSync(dir);
const errors: string[] = [];
const sizes: string[] = [];
for (const [ext, budget] of [
  [".js", BUDGET],
  [".css", CSS_BUDGET],
] as const) {
  const files = all.filter((f) => f.endsWith(ext));
  for (const [prefix, max] of Object.entries(budget)) {
    const file = files.find((f) => f.startsWith(`${prefix}-`));
    const name = ext === ".js" ? prefix : `${prefix}${ext}`;
    if (!file) {
      errors.push(`chunk ${name} not found`);
      continue;
    }
    const size = statSync(new URL(file, dir)).size;
    sizes.push(`${name} ${Math.round(size / KB)} KB`);
    if (size > max) errors.push(`${name}: ${Math.round(size / KB)} KB, budget ${Math.round(max / KB)} KB`);
  }
}
// A card script label in the worker means that it imports @finalcircle/cards (the definitions come from the page).
const worker = all.find((f) => f.startsWith("game.worker-"));
if (worker && readFileSync(new URL(worker, dir), "utf8").includes("Search for an Earth Forward of cost 1"))
  errors.push("the worker embeds the cards (@finalcircle/cards imported)");
console.log(`bundle: ${sizes.join(", ")}`);
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
