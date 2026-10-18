/**
 * Strict play (Planecircle's `checkOffers`): in random games between the starter decks, every option of
 * `legalActions`, with its suggested payment and first targets, is accepted by the engine; an illegal decision is a
 * RulesError, never another error; every card stays in exactly one zone; a recorded game replays identically.
 */
import { buildDeck, card, DECKS } from "@finalcircle/cards";
import { describe, expect, it } from "vitest";
import { RulesError } from "../src/errors";
import { submit } from "../src/game";
import { legalActions } from "../src/legal";
import { createRecordedGame, outcomeHash, recordDecision, replayChecked } from "../src/record";
import type { GameState } from "../src/types";
import { decisionOf, randomDecision, rng } from "./helpers";

const [vol1, vol2] = DECKS;

function newGame(seed: number) {
  if (!vol1 || !vol2) throw new Error("starter decks missing");
  return createRecordedGame({
    seed,
    players: [
      { id: "p1", name: "A", deck: buildDeck(vol1.main), lb: buildDeck(vol1.lb) },
      { id: "p2", name: "B", deck: buildDeck(vol2.main), lb: buildDeck(vol2.lb) },
    ],
  });
}

/** Every object is in exactly one zone, and each player keeps all their cards. */
function checkZones(s: GameState): void {
  const seen = new Map<string, string>();
  const note = (id: string, where: string) => {
    expect(seen.has(id), `${id} in ${seen.get(id)} and ${where}`).toBe(false);
    seen.set(id, where);
  };
  for (const id of s.field) note(id, "field");
  for (const item of s.stack) if (item.kind === "summon") note(item.sourceId, "stack");
  for (const p of s.playerOrder) {
    const pl = s.players[p];
    if (!pl) continue;
    for (const [zone, ids] of Object.entries({
      deck: pl.deck,
      hand: pl.hand,
      break: pl.breakZone,
      damage: pl.damage,
      removed: pl.removed,
      lb: pl.lb,
    }))
      for (const id of ids) note(id, `${p}.${zone}`);
  }
  expect([...seen.keys()].sort()).toEqual(Object.keys(s.objects).sort());
  for (const p of s.playerOrder) expect(Object.values(s.objects).filter((o) => o.owner === p)).toHaveLength(p === "p1" ? 58 : 54);
}

describe("strict random play", () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    it(`seed ${seed}: every offered option is accepted, the game ends, the record replays`, () => {
      const random = rng(seed);
      let { state: s, record } = newGame(seed);
      for (let n = 0; n < 4000 && !s.over && s.pending; n++) {
        const p = s.pending;
        const options = legalActions(s, p.player);
        if (n % 3 === 0)
          for (const o of options) {
            try {
              submit(s, p.player, decisionOf(o));
            } catch (e) {
              if (e instanceof RulesError) throw new Error(`option refused: ${JSON.stringify(o)}: ${e.message}`);
              throw e;
            }
          }
        const d = randomDecision(s, options, random);
        const next = submit(s, p.player, d).state;
        recordDecision(record, p.player, d, next, 1);
        s = next;
        if (n % 25 === 0) checkZones(s);
      }
      checkZones(s);
      expect(s.over, `turn ${s.turn.number}`).toBe(true);
      const replay = replayChecked(record, card);
      expect(replay.divergence).toBeNull();
      expect(outcomeHash(replay.state)).toBe(outcomeHash(s));
    });
  }
});
