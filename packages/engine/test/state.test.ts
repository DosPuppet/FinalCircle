import { describe, expect, it } from "vitest";
import { outcomeHash } from "../src/fingerprint";
import { cloneState, newId, onClone, random, shuffle } from "../src/state";
import type { GameState } from "../src/types";

function emptyState(seed: number): GameState {
  const player = (id: string) => ({
    id,
    name: id,
    deck: [],
    hand: [],
    breakZone: [],
    damage: [],
    removed: [],
    lb: [],
    crystals: 0,
    mulliganed: false,
    lost: false,
    drewFromEmpty: false,
    damagedFromEmpty: false,
  });
  return {
    version: 0,
    rng: seed,
    idCounters: {},
    timestamp: 0,
    defs: {},
    objects: {},
    players: { p1: player("p1"), p2: player("p2") },
    playerOrder: ["p1", "p2"],
    field: [],
    stack: [],
    turn: { number: 1, active: "p1", phase: "main1", step: null, startingPlayer: "p1", endLoop: 0 },
    flow: "priority",
    priority: { holder: "p1", passes: 0 },
    attack: null,
    effects: [],
    triggers: [],
    exBursts: null,
    pending: null,
    resolving: null,
    setup: { chooser: "p1", mulliganQueue: [] },
    lki: {},
    turnLog: [],
    winner: null,
    over: false,
  };
}

describe("state primitives", () => {
  it("randomness depends on the seed only", () => {
    const a = emptyState(42);
    const b = emptyState(42);
    const xs = [random(a), random(a), random(a)];
    expect([random(b), random(b), random(b)]).toEqual(xs);
    for (const x of xs) expect(x >= 0 && x < 1).toBe(true);
    const c = emptyState(43);
    expect(random(c)).not.toBe(xs[0]);
  });

  it("a shuffle is a permutation, reproducible with the seed", () => {
    const items = Array.from({ length: 50 }, (_, i) => i);
    const a = [...items];
    const b = [...items];
    shuffle(emptyState(7), a);
    shuffle(emptyState(7), b);
    expect(a).toEqual(b);
    expect([...a].sort((x, y) => x - y)).toEqual(items);
    expect(a).not.toEqual(items);
  });

  it("one id counter per prefix", () => {
    const s = emptyState(1);
    expect([newId(s), newId(s), newId(s, "t"), newId(s)]).toEqual(["o1", "o2", "t1", "o3"]);
  });

  it("a copy is independent, shares the definitions and runs the clone hooks", () => {
    const s = emptyState(1);
    s.players.p1?.hand.push("o1");
    let carried = 0;
    const remove = onClone(() => {
      carried++;
    });
    const c = cloneState(s);
    remove();
    c.players.p1?.hand.push("o2");
    expect(s.players.p1?.hand).toEqual(["o1"]);
    expect(c.defs).not.toBe(s.defs);
    expect(carried).toBe(1);
    cloneState(s);
    expect(carried).toBe(1);
    expect(outcomeHash(c)).not.toBe(outcomeHash(s));
    c.players.p1?.hand.pop();
    expect(outcomeHash(c)).toBe(outcomeHash(s));
  });
});
