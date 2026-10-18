/**
 * Golden games (from Planecircle): a few fixed-seed games, recorded with their checkpoints
 * (`packages/ai/test/golden/*.json`). The test `ai/test/golden.test.ts` replays them all:
 * - a game that replays identically passes, whatever the rules version that recorded it;
 * - a divergence at the same version is an error: the engine's behavior changed without bumping `RULES_VERSION`;
 * - a divergence after a change of `RULES_VERSION` requires regenerating **that** game (`--update`).
 *
 * Usage: npm run golden              checks (like the test)
 *        npm run golden -- --update   regenerates only the games that diverge (and the missing games)
 *        npm run golden -- --all      regenerates all the games
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { aiAgent, randomAgent } from "@finalcircle/ai";
import { buildDeck, card, deckById } from "@finalcircle/cards";
import {
  type CardDef,
  createRecordedGame,
  fallbackDecision,
  type GameRecord,
  outcomeHash,
  RULES_VERSION,
  RulesError,
  recordDecision,
  replayChecked,
  submit,
} from "@finalcircle/engine";
import { randomDeck } from "./random-deck";

interface GoldenSpec {
  name: string;
  seed: number;
  /** Prebuilt decks (`deckById`), one per player; or `pools`: a random deck drawn from a card group ("all": every group). */
  decks?: string[];
  pools?: string[];
  /** Random AI (varied games, cut at `maxDecisions`) or medium AI (games that go to the end). */
  agent: "random" | "medium";
  maxDecisions: number;
}

const GOLDEN_GAMES: GoldenSpec[] = [
  {
    name: "vol1-vs-vol2-random",
    seed: 11,
    decks: ["starter-2025-vol1", "starter-2025-vol2"],
    agent: "random",
    maxDecisions: 1500,
  },
  {
    name: "vol2-vs-vol1-random",
    seed: 12,
    decks: ["starter-2025-vol2", "starter-2025-vol1"],
    agent: "random",
    maxDecisions: 1500,
  },
  {
    name: "vol1-mirror-random",
    seed: 13,
    decks: ["starter-2025-vol1", "starter-2025-vol1"],
    agent: "random",
    maxDecisions: 1500,
  },
  {
    name: "vol2-mirror-random",
    seed: 14,
    decks: ["starter-2025-vol2", "starter-2025-vol2"],
    agent: "random",
    maxDecisions: 1500,
  },
  {
    name: "vol1-vs-vol2-medium",
    seed: 21,
    decks: ["starter-2025-vol1", "starter-2025-vol2"],
    agent: "medium",
    maxDecisions: 4000,
  },
  {
    name: "vol2-vs-vol1-medium",
    seed: 22,
    decks: ["starter-2025-vol2", "starter-2025-vol1"],
    agent: "medium",
    maxDecisions: 4000,
  },
  { name: "random-decks-a", seed: 31, pools: ["starter25", "starter25"], agent: "random", maxDecisions: 1500 },
  { name: "random-decks-b", seed: 32, pools: ["starter25", "starter25"], agent: "medium", maxDecisions: 4000 },
];

function decksOf(spec: GoldenSpec): { main: CardDef[]; lb: CardDef[] }[] {
  if (spec.decks)
    return spec.decks.map((id) => {
      const d = deckById(id);
      if (!d) throw new Error(`unknown deck ${id}`);
      return { main: buildDeck(d.main), lb: buildDeck(d.lb) };
    });
  return (spec.pools ?? []).map((group, i) => randomDeck(spec.seed * 100 + i, group === "all" ? undefined : group));
}

/** Plays a golden game and returns its record. */
function playGolden(spec: GoldenSpec): GameRecord {
  const decks = decksOf(spec);
  let { state, record } = createRecordedGame({
    seed: spec.seed,
    players: decks.map((d, i) => ({ id: `p${i + 1}`, name: `AI ${i + 1}`, deck: d.main, lb: d.lb })),
  });
  const agents = Object.fromEntries(
    decks.map((_, i) => [
      `p${i + 1}`,
      spec.agent === "medium" ? aiAgent("medium", { seed: spec.seed * 10 + i }) : randomAgent(spec.seed * 10 + i),
    ]),
  );
  for (let i = 0; i < spec.maxDecisions && state.pending && !state.over; i++) {
    const p = state.pending;
    let d = agents[p.player]?.(state, p.player) ?? fallbackDecision(state, p);
    try {
      state = submit(state, p.player, d).state;
    } catch (e) {
      if (!(e instanceof RulesError)) throw e;
      d = fallbackDecision(state, p);
      state = submit(state, p.player, d).state;
    }
    recordDecision(record, p.player, d, state);
  }
  // Always a checkpoint on the last state, even if the game is not over.
  const n = record.decisions.length;
  if (record.checkpoints?.at(-1)?.[0] !== n) record.checkpoints = [...(record.checkpoints ?? []), [n, outcomeHash(state)]];
  delete record.createdAt;
  return record;
}

const dir = new URL("../packages/ai/test/golden/", import.meta.url);
const update = process.argv.includes("--update");
const all = process.argv.includes("--all");
let failed = 0;
mkdirSync(dir, { recursive: true });
for (const spec of GOLDEN_GAMES) {
  const file = new URL(`${spec.name}.json`, dir);
  const old = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as GameRecord) : null;
  const divergence = old ? replayChecked(old, card).divergence : null;
  const verdict = !old ? "missing" : divergence ? `divergence (${divergence.message})` : "identical";
  if (all || (update && !old) || (update && divergence)) {
    if (old && divergence && old.rules === RULES_VERSION) {
      console.error(`${spec.name}: ${verdict} at the same version (${RULES_VERSION}): bump RULES_VERSION first`);
      failed++;
      continue;
    }
    const record = playGolden(spec);
    writeFileSync(file, `${JSON.stringify(record)}\n`);
    console.log(
      `${spec.name}: ${verdict} → regenerated (${record.decisions.length} decisions, ${record.checkpoints?.length ?? 0} checkpoints, rules ${record.rules})`,
    );
    continue;
  }
  if (!old || divergence) failed++;
  console.log(`${spec.name}: ${verdict}${old ? ` (rules ${old.rules})` : ""}`);
}
if (failed) {
  console.error(`${failed} golden game(s) to review; after a [rules] lot: npm run golden -- --update`);
  process.exit(1);
}
