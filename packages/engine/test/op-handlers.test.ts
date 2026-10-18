/** Every effect `op` has a handler (from Planecircle's op-handlers test); the record below is exhaustive by type. */
import { describe, expect, it } from "vitest";
import "../src/game";
import { registeredOps } from "../src/opRegistry";
import type { EffectOp } from "../src/types";

const ALL: Record<EffectOp, true> = {
  damage: true,
  power: true,
  gain: true,
  dull: true,
  activate: true,
  freeze: true,
  break: true,
  toBreakZone: true,
  toHand: true,
  removeFromGame: true,
  draw: true,
  discard: true,
  search: true,
  lookTop: true,
  playFromHand: true,
  shield: true,
  select: true,
  may: true,
  if: true,
  reflexive: true,
  gainCrystals: true,
};

describe("effect handlers", () => {
  it("every op of the Effect union is registered, and nothing else", () => {
    expect(registeredOps().sort()).toEqual(Object.keys(ALL).sort());
  });
});
