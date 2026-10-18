/**
 * AI tournament (from Planecircle's ai-arena): two levels play `games` games, seats and decks alternated; the win rate
 * of A with a 95 % interval, and the decision times.
 *
 * Usage: npm run arena -- --a expert --b medium [--games 600] [--jobs N] [--pool decks|<group>|all] [--budget 100]
 *   --budget: ISMCTS iterations of the expert (reproducible); each game depends only on its seed, whatever --jobs.
 */
import { fork } from "node:child_process";
import { availableParallelism } from "node:os";
import { type AiLevel, aiAgent, type Deck, playGame } from "@finalcircle/ai";
import { buildDeck, DECKS } from "@finalcircle/cards";
import { randomDeck } from "./random-deck";

const argv = process.argv.slice(2);
const opt = (n: string, d: string) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? (argv[i + 1] ?? d) : d;
};
const a = opt("a", "expert") as AiLevel;
const b = opt("b", "medium") as AiLevel;
const games = Number(opt("games", "200"));
const jobs = Math.max(1, Number(opt("jobs", String(Math.max(1, availableParallelism() - 2)))));
const pool = opt("pool", "decks");
const budget = Number(opt("budget", "60"));

const deckFor = (g: number, i: number): Deck => {
  if (pool === "decks") {
    const d = DECKS[(g + i) % DECKS.length];
    if (!d) throw new Error("no prebuilt deck");
    return { main: buildDeck(d.main), lb: buildDeck(d.lb) };
  }
  return randomDeck(g * 31 + i, pool === "all" ? undefined : pool);
};

interface Result {
  aWins: number;
  draws: number;
  games: number;
  ms: Record<string, number[]>;
}

function play(first: number, count: number): Result {
  const out: Result = { aWins: 0, draws: 0, games: 0, ms: { [a]: [], [b]: [] } };
  for (let g = first; g < first + count; g++) {
    // Seat of A alternated with the game number; decks alternated by `deckFor`.
    const aFirst = g % 2 === 0;
    const levels: [AiLevel, AiLevel] = aFirst ? [a, b] : [b, a];
    const timed = levels.map((level, i) => {
      const agent = aiAgent(level, { seed: g * 7 + i, budget: { iterations: budget } });
      return (s: Parameters<typeof agent>[0], p: string) => {
        const t0 = performance.now();
        const d = agent(s, p);
        out.ms[level]?.push(performance.now() - t0);
        return d;
      };
    }) as [ReturnType<typeof aiAgent>, ReturnType<typeof aiAgent>];
    const r = playGame({ seed: g + 1, decks: [deckFor(g, 0), deckFor(g, 1)], agents: timed, maxDecisions: 6000 });
    out.games++;
    const aSeat = aFirst ? "p1" : "p2";
    if (r.state.winner === aSeat) out.aWins++;
    else if (r.state.winner === "draw" || !r.state.over) out.draws++;
  }
  return out;
}

if (argv.includes("--worker")) {
  process.on("message", (m: { first: number; count: number }) => {
    // Disconnect once the result is sent (a large message would otherwise be lost).
    process.send?.(play(m.first, m.count), () => process.disconnect?.());
  });
} else {
  const t0 = performance.now();
  const size = Math.ceil(games / jobs);
  const parts = await Promise.all(
    Array.from(
      { length: Math.min(jobs, games) },
      (_, k) =>
        new Promise<Result>((resolve, reject) => {
          const child = fork(process.argv[1] as string, [...argv, "--worker"], { execArgv: process.execArgv });
          child.on("message", (r: Result) => resolve(r));
          child.on("exit", (code) => reject(new Error(`worker stopped (${code}) before its result`)));
          child.send({ first: k * size, count: Math.max(0, Math.min(size, games - k * size)) });
        }),
    ),
  );
  const total = parts.reduce<Result>(
    (t, r) => ({
      aWins: t.aWins + r.aWins,
      draws: t.draws + r.draws,
      games: t.games + r.games,
      ms: { [a]: [...(t.ms[a] ?? []), ...(r.ms[a] ?? [])], [b]: [...(t.ms[b] ?? []), ...(r.ms[b] ?? [])] },
    }),
    { aWins: 0, draws: 0, games: 0, ms: { [a]: [], [b]: [] } },
  );
  const n = total.games - total.draws;
  const p = n ? total.aWins / n : 0;
  const half = n ? 1.96 * Math.sqrt((p * (1 - p)) / n) : 0;
  const stat = (xs: number[]) => {
    const sorted = [...xs].sort((x, y) => x - y);
    return `mean ${(xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length)).toFixed(1)} ms, p95 ${(sorted[Math.floor(sorted.length * 0.95)] ?? 0).toFixed(1)} ms`;
  };
  console.log(
    `${a} vs ${b}: ${total.games} games (pool ${pool}, budget ${budget}) in ${((performance.now() - t0) / 1000).toFixed(0)} s`,
  );
  console.log(
    `${a} wins ${(100 * p).toFixed(1)} % ± ${(100 * half).toFixed(1)} (${total.aWins} of ${n}, ${total.draws} draws or unfinished)`,
  );
  console.log(`decision time: ${a} ${stat(total.ms[a] ?? [])}; ${b} ${stat(total.ms[b] ?? [])}`);
}
