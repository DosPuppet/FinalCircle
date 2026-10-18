/**
 * The AI never reads the opponent's hidden cards (from Planecircle's hidden-info test): with `fair`, two states that
 * differ only by the opponent's hand and deck give the same decision; the determinization keeps what is public.
 */
import { buildDeck, card, DECKS } from "@finalcircle/cards";
import { cloneState, createGame, type GameState, submit } from "@finalcircle/engine";
import { describe, expect, it } from "vitest";
import { aiAgent, determinize, mulberry32, randomAgent } from "../src/index";

function midGame(seed: number): GameState {
  const [a, b] = DECKS;
  if (!a || !b) throw new Error("prebuilt decks missing");
  let s = createGame({
    seed,
    players: [
      { id: "p1", name: "A", deck: buildDeck(a.main), lb: buildDeck(a.lb) },
      { id: "p2", name: "B", deck: buildDeck(b.main), lb: buildDeck(b.lb) },
    ],
  }).state;
  const agents = { p1: randomAgent(seed), p2: randomAgent(seed + 1) };
  // Until p1 has priority in its Main Phase 1 of turn 3 or later.
  for (let i = 0; i < 2000 && s.pending && !s.over; i++) {
    const p = s.pending;
    if (s.turn.number >= 3 && s.turn.active === "p1" && s.turn.phase === "main1" && p.kind === "priority" && p.player === "p1")
      break;
    s = submit(s, p.player, agents[p.player as "p1" | "p2"](s, p.player)).state;
  }
  return s;
}

/** The same state, with other cards in p2's hand and deck (what p1 cannot see). */
function otherHidden(s: GameState): GameState {
  const c = cloneState(s);
  const swap = card("12-005C").id;
  c.defs[swap] = card("12-005C");
  for (const id of [...(c.players.p2?.hand ?? []), ...(c.players.p2?.deck ?? [])]) {
    const o = c.objects[id];
    if (o) o.defId = swap;
  }
  c.version += 1;
  return c;
}

describe("hidden information", () => {
  it("the fair AI's decision does not depend on the opponent's hidden cards", () => {
    for (const seed of [1, 2, 3]) {
      const s = midGame(seed);
      for (const level of ["medium", "expert"] as const) {
        const a = aiAgent(level, { seed: 9, fair: true, budget: { iterations: 8 } })(s, "p1");
        const b = aiAgent(level, { seed: 9, fair: true, budget: { iterations: 8 } })(otherHidden(s), "p1");
        expect(b, `seed ${seed}, ${level}`).toEqual(a);
      }
    }
  });

  it("a determinization keeps the public zones and the AI's own hand", () => {
    const s = midGame(4);
    const d = determinize(s, "p1", mulberry32(1));
    expect(d.field).toEqual(s.field);
    for (const id of [
      ...s.field,
      ...(s.players.p1?.hand ?? []),
      ...(s.players.p2?.breakZone ?? []),
      ...(s.players.p2?.damage ?? []),
    ])
      expect(d.objects[id]?.defId).toBe(s.objects[id]?.defId);
    expect(d.players.p2?.hand.length).toBe(s.players.p2?.hand.length);
    expect(d.players.p2?.deck.length).toBe(s.players.p2?.deck.length);
  });
});
