/**
 * Engine fuzzing (from Planecircle): AI-versus-AI games with an invariant check at every decision.
 *
 * Usage: npm run fuzz -- [--games 200] [--seed 1] [--ai random|heuristic|mixed|beginner|medium|expert|levels|chaos]
 *                        [--offers 4] [--pool decks|all|<group>] [--jobs N]
 *        npx tsx tools/fuzz.ts --batch <file.json> --jobs N    (several series, used by verify)
 *
 * --pool decks: the prebuilt decks against each other; all: random legal decks drawn from every implemented card;
 * <group> (starter25…): random decks drawn from that card group.
 * --jobs N: the games are spread over N processes, in small batches of contiguous seeds; each game depends only on its
 * seed, so the results are identical whatever N is.
 * --ai: heuristic = medium; mixed: a medium AI against a random one; levels: the three levels mixed (the ISMCTS of the
 * expert with a small iteration budget); chaos: random AIs and, before some decisions, corrupted variants that must be
 * refused by a RulesError without changing the state.
 * --offers N: every N decisions, each option of `legalActions` must be accepted with its default choices.
 * --batch: a JSON array of series `{ name, args }`; one JSON line per finished series: `{ name, ok, seconds, out }`.
 */
import { type ChildProcess, fork } from "node:child_process";
import { readFileSync } from "node:fs";
import { inspect } from "node:util";
import { type AiLevel, aiAgent, type Deck, playGame, randomAgent } from "@finalcircle/ai";
import { buildDeck, DECKS } from "@finalcircle/cards";
import type { Agent } from "@finalcircle/engine";
import { randomDeck } from "./random-deck";

/** A series of games. */
interface Spec {
  games: number;
  seed0: number;
  mode: string;
  pool: string;
  /** Every N decisions, each offered option must be accepted with its default choices (0: never). */
  offers: number;
}

const argOf = (argv: string[], name: string, def: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? (argv[i + 1] ?? def) : def;
};
const specOf = (argv: string[]): Spec => ({
  games: Number(argOf(argv, "games", "200")),
  seed0: Number(argOf(argv, "seed", "1")),
  mode: argOf(argv, "ai", "random"),
  pool: argOf(argv, "pool", "decks"),
  offers: Number(argOf(argv, "offers", "0")),
});

const LEVELS: AiLevel[] = ["beginner", "medium", "expert"];

const agentFor = (spec: Spec, seed: number, which: number): Agent => {
  const { mode } = spec;
  if (mode === "heuristic") return aiAgent("medium", { seed: seed * 7 + which });
  if (mode === "levels" || (LEVELS as string[]).includes(mode)) {
    const level = mode === "levels" ? (LEVELS[(seed + which) % 3] as AiLevel) : (mode as AiLevel);
    return aiAgent(level, { seed: seed * 7 + which, budget: { iterations: 12 } });
  }
  if (mode === "mixed") return which === 0 ? aiAgent("medium", { seed }) : randomAgent(seed * 7 + which);
  return randomAgent(seed * 7 + which);
};

const deckFor = (spec: Spec, seed: number, g: number, i: number): Deck => {
  if (spec.pool === "decks") {
    const d = DECKS[(g + i) % DECKS.length];
    if (!d) throw new Error("no prebuilt deck");
    return { main: buildDeck(d.main), lb: buildDeck(d.lb) };
  }
  return randomDeck(seed * 31 + i, spec.pool === "all" ? undefined : spec.pool);
};

interface Tally {
  wins: Record<string, number>;
  turns: number;
  illegal: number;
  decisions: number;
  caps: number;
  /**
   * Fingerprint of the games (sum modulo 2³² of one fingerprint per game: decisions, winner, damage): independent of
   * `--jobs`; equal before and after a refactoring that must not change the game.
   */
  print: number;
}

const emptyTally = (): Tally => ({ wins: { draw: 0, unfinished: 0 }, turns: 0, illegal: 0, decisions: 0, caps: 0, print: 0 });

/** FNV-1a 32 bits. */
function fnv(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

function addTally(total: Tally, r: Tally): void {
  for (const [k, n] of Object.entries(r.wins)) total.wins[k] = (total.wins[k] ?? 0) + n;
  total.turns += r.turns;
  total.illegal += r.illegal;
  total.decisions += r.decisions;
  total.caps += r.caps;
  total.print = (total.print + r.print) >>> 0;
}

/** Plays `count` games of the series from seed `first` (in this process). */
function run(spec: Spec, first: number, count: number): Tally {
  const tally = emptyTally();
  for (let g = first - spec.seed0; g < first - spec.seed0 + count; g++) {
    const seed = spec.seed0 + g;
    const r = playGame({
      seed,
      decks: [deckFor(spec, seed, g, 0), deckFor(spec, seed, g, 1)],
      agents: [agentFor(spec, seed, 0), agentFor(spec, seed, 1)],
      maxDecisions: 6000,
      check: true,
      chaos: spec.mode === "chaos",
      ...(spec.offers ? { offers: spec.offers } : {}),
    });
    const key = !r.state.over ? "unfinished" : (r.state.winner ?? "draw");
    tally.wins[key] = (tally.wins[key] ?? 0) + 1;
    tally.turns += r.turns;
    tally.illegal += r.illegal;
    tally.decisions += r.decisions.length;
    tally.caps += r.caps;
    const damage = Object.values(r.state.players).map((p) => p.damage.length);
    tally.print = (tally.print + fnv(JSON.stringify([seed, key, r.turns, damage, r.decisions]))) >>> 0;
  }
  return tally;
}

/** Summary of a series, in the format verify expects (`results: …`). */
function summary(spec: Spec, total: Tally, ms: number): string {
  const { wins, turns, illegal, decisions, caps, print } = total;
  return [
    `${spec.games} games (${spec.mode}, pool ${spec.pool}) in ${(ms / 1000).toFixed(1)} s — ${(ms / Math.max(1, decisions)).toFixed(2)} ms/decision`,
    `results: ${inspect(wins)}`,
    `average turns: ${(turns / spec.games).toFixed(1)}, illegal AI decisions: ${illegal}, caps reached: ${caps}`,
    `fingerprint: ${print.toString(16).padStart(8, "0")} (${decisions} decisions)`,
  ].join("\n");
}

interface Task {
  spec: number;
  first: number;
  count: number;
}
type FromWorker = { ok: true; tally: Tally } | { ok: false; error: string };

/**
 * Plays all the series on `jobs` persistent processes that take the batches in order. `done` is called when all the
 * batches of a series are finished.
 */
async function runPool(
  specs: Spec[],
  jobs: number,
  done: (i: number, total: Tally, error: string | null, ms: number) => void,
): Promise<void> {
  const tasks: Task[] = [];
  const remaining = specs.map(() => 0);
  for (const [i, spec] of specs.entries()) {
    // Batches small enough that the end of a series leaves no core idle.
    const size = Math.max(1, Math.ceil(spec.games / (jobs * 4)));
    for (let k = 0; k < spec.games; k += size) {
      tasks.push({ spec: i, first: spec.seed0 + k, count: Math.min(size, spec.games - k) });
      remaining[i]! += 1;
    }
  }
  const totals = specs.map(emptyTally);
  const errors: (string | null)[] = specs.map(() => null);
  const started: (number | null)[] = specs.map(() => null);
  let next = 0;
  const worker = () =>
    new Promise<void>((resolve, reject) => {
      const child: ChildProcess = fork(process.argv[1] as string, ["--worker"], { execArgv: process.execArgv });
      let current: Task | null = null;
      const feed = () => {
        current = tasks[next++] ?? null;
        if (!current) {
          child.send({ quit: true });
          return;
        }
        started[current.spec] ??= performance.now();
        child.send({ spec: specs[current.spec], first: current.first, count: current.count });
      };
      child.on("message", (m: FromWorker) => {
        const t = current as Task;
        if (m.ok) addTally(totals[t.spec]!, m.tally);
        else errors[t.spec] ??= m.error;
        remaining[t.spec]! -= 1;
        if (remaining[t.spec] === 0) done(t.spec, totals[t.spec]!, errors[t.spec] ?? null, performance.now() - started[t.spec]!);
        feed();
      });
      child.on("exit", (code) =>
        current === null ? resolve() : reject(new Error(`fuzz process stopped (code ${code}) during ${JSON.stringify(current)}`)),
      );
      feed();
    });
  await Promise.all(Array.from({ length: Math.max(1, Math.min(jobs, tasks.length)) }, worker));
}

const argv = process.argv.slice(2);
const jobs = Math.max(1, Number(argOf(argv, "jobs", "1")));

if (argv.includes("--worker")) {
  // Child process: plays the batches it receives, sends back a tally (or the error) for each.
  process.on("message", (m: { quit?: boolean; spec: Spec; first: number; count: number }) => {
    if (m.quit) {
      process.disconnect?.();
      return;
    }
    let reply: FromWorker;
    try {
      reply = { ok: true, tally: run(m.spec, m.first, m.count) };
    } catch (e) {
      reply = { ok: false, error: e instanceof Error ? (e.stack ?? e.message) : String(e) };
    }
    process.send?.(reply);
  });
} else if (argv.includes("--batch")) {
  // Several series (verify): one JSON line per finished series.
  const batch = JSON.parse(readFileSync(argOf(argv, "batch", ""), "utf8")) as { name: string; args: string }[];
  const specs = batch.map((b) => specOf(b.args.split(/\s+/).filter(Boolean)));
  let failed = false;
  await runPool(specs, jobs, (i, total, error, ms) => {
    const spec = specs[i] as Spec;
    const ok = !error && !total.wins.unfinished;
    failed ||= !ok;
    const out = error ? `Error:\n${error}` : summary(spec, total, ms);
    console.log(JSON.stringify({ name: batch[i]?.name, ok, seconds: ms / 1000, out }));
  });
  if (failed) process.exitCode = 1;
} else {
  const spec = specOf(argv);
  const t0 = performance.now();
  let total = emptyTally();
  let error: string | null = null;
  if (jobs > 1)
    await runPool([spec], jobs, (_, t, e) => {
      total = t;
      error = e;
    });
  else total = run(spec, spec.seed0, spec.games);
  if (error) throw new Error(error);
  console.log(summary(spec, total, performance.now() - t0));
  if (total.wins.unfinished) process.exitCode = 1;
}
