/** Self-play with the invariants at every decision, strict offers and chaos decisions (from Planecircle). */
import { buildDeck, DECKS } from "@finalcircle/cards";
import { describe, expect, it } from "vitest";
import { aiAgent, type Deck, playGame, randomAgent } from "../src/index";

const decks = (): [Deck, Deck] => {
  const [a, b] = DECKS;
  if (!a || !b) throw new Error("prebuilt decks missing");
  return [
    { main: buildDeck(a.main), lb: buildDeck(a.lb) },
    { main: buildDeck(b.main), lb: buildDeck(b.lb) },
  ];
};

describe("self-play", () => {
  it("random games: invariants, every offered option accepted, the game ends", () => {
    for (const seed of [1, 2, 3, 4]) {
      const r = playGame({ seed, decks: decks(), agents: [randomAgent(seed), randomAgent(seed + 100)], check: true, offers: 5 });
      expect(r.state.over, `seed ${seed}`).toBe(true);
      expect(r.illegal).toBe(0);
    }
  });

  it("chaos: corrupted decisions are refused without changing the state", () => {
    for (const seed of [5, 6]) {
      const r = playGame({
        seed,
        decks: decks(),
        agents: [randomAgent(seed), randomAgent(seed + 100)],
        check: true,
        chaos: true,
      });
      expect(r.state.over).toBe(true);
    }
  });

  it("the AI levels play legal decisions to the end of the game", () => {
    for (const [seed, a, b] of [
      [7, "beginner", "medium"],
      [8, "medium", "expert"],
    ] as const) {
      const r = playGame({
        seed,
        decks: decks(),
        agents: [aiAgent(a, { seed, budget: { iterations: 10 } }), aiAgent(b, { seed: seed + 1, budget: { iterations: 10 } })],
        check: true,
      });
      expect(r.state.over).toBe(true);
      expect(r.illegal).toBe(0);
    }
  });

  it("the medium AI beats the random AI", () => {
    let wins = 0;
    for (let seed = 20; seed < 30; seed++) {
      const r = playGame({ seed, decks: decks(), agents: [aiAgent("medium", { seed }), randomAgent(seed)] });
      if (r.state.winner === "p1") wins++;
    }
    expect(wins).toBeGreaterThanOrEqual(9);
  });
});
