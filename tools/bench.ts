/**
 * Bench (from Planecircle): engine decisions per second (random games) and AI decision times. Compare before and
 * after a change on the same machine (on mains power), never against an old figure.
 */
import { aiAgent, type Deck, playGame, randomAgent } from "@finalcircle/ai";
import { buildDeck, DECKS } from "@finalcircle/cards";

const decks = (): [Deck, Deck] => {
  const [x, y] = DECKS;
  if (!x || !y) throw new Error("prebuilt decks missing");
  return [
    { main: buildDeck(x.main), lb: buildDeck(x.lb) },
    { main: buildDeck(y.main), lb: buildDeck(y.lb) },
  ];
};

let t0 = performance.now();
let decisions = 0;
for (let seed = 1; seed <= 100; seed++)
  decisions += playGame({ seed, decks: decks(), agents: [randomAgent(seed), randomAgent(seed + 1)] }).decisions.length;
const perSecond = decisions / ((performance.now() - t0) / 1000);
const times: Record<string, number[]> = { medium: [], expert: [] };
for (const level of ["medium", "expert"] as const) {
  for (let seed = 1; seed <= 6; seed++) {
    const agent = aiAgent(level, { seed, budget: { ms: 150 } });
    const timed = (s: Parameters<typeof agent>[0], p: string) => {
      t0 = performance.now();
      const d = agent(s, p);
      times[level]?.push(performance.now() - t0);
      return d;
    };
    playGame({ seed, decks: decks(), agents: [timed, randomAgent(seed)] });
  }
}
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);
console.log(`engine: ${Math.round(perSecond)} decisions/s (${decisions} decisions)`);
console.log(
  `AI: medium ${mean(times.medium ?? []).toFixed(1)} ms, expert ${mean(times.expert ?? []).toFixed(1)} ms per decision`,
);
console.log(
  `Targets: engine ≥ 5000 dec/s ${perSecond >= 5000 ? "✓" : "✗"}, medium < 50 ms ${mean(times.medium ?? []) < 50 ? "✓" : "✗"}, expert < 200 ms ${mean(times.expert ?? []) < 200 ? "✓" : "✗"}`,
);
