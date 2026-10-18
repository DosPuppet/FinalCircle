/**
 * Card smoke test (Planecircle's model): every implemented card of a group is played at least once — cast, its
 * ability used, its EX Burst applied — in games between medium AIs on the prebuilt decks and random decks of the group.
 */
import { buildDeck, DECKS } from "@finalcircle/cards";
import { createGame, fallbackDecision, type GameEvent, RulesError, submit } from "@finalcircle/engine";
import { expect, it } from "vitest";
import { poolOf, randomDeck } from "../../../../tools/random-deck";
import { aiAgent, randomAgent } from "../../src/index";

export function smokeTest(group: string, games = 60): void {
  it(`every card of ${group} is played`, () => {
    const pool = poolOf(group).map((c) => c.id);
    const played = new Set<string>();
    const note = (events: GameEvent[]) => {
      for (const e of events) {
        if (e.type === "cast" || e.type === "activate") played.add(e.defId);
        if (e.type === "exBurst" && e.used) played.add(e.defId);
      }
    };
    for (let g = 0; g < games && played.size < pool.length; g++) {
      const prebuilt = g % 3 === 0;
      const decks = prebuilt
        ? DECKS.slice(0, 2).map((d) => ({ main: buildDeck(d.main), lb: buildDeck(d.lb) }))
        : [randomDeck(g * 31, group), randomDeck(g * 31 + 1, group)];
      let { state: s } = createGame({
        seed: g + 1,
        players: decks.map((d, i) => ({ id: `p${i + 1}`, name: `AI ${i + 1}`, deck: d.main, lb: d.lb })),
      });
      // Alternately medium and random AIs: the random AI plays cards the medium one would not.
      const agents = [g % 2 ? randomAgent(g, 0.2) : aiAgent("medium", { seed: g }), randomAgent(g + 7, 0.2)];
      for (let n = 0; n < 4000 && s.pending && !s.over; n++) {
        const p = s.pending;
        const agent = agents[p.player === "p1" ? 0 : 1];
        let d = agent?.(s, p.player) ?? fallbackDecision(s, p);
        let r: ReturnType<typeof submit>;
        try {
          r = submit(s, p.player, d);
        } catch (e) {
          if (!(e instanceof RulesError)) throw e;
          d = fallbackDecision(s, p);
          r = submit(s, p.player, d);
        }
        note(r.events);
        s = r.state;
      }
    }
    expect(pool.filter((id) => !played.has(id)).sort(), "cards never played").toEqual([]);
  }, 120_000);
}
