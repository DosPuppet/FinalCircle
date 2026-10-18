import type { GameView, PendingView } from "@finalcircle/engine";
import { describe, expect, it } from "vitest";
import { attackGroupOk, mainAction } from "../src/store";

const attack: Extract<PendingView, { kind: "declareAttack" }> = {
  kind: "declareAttack",
  player: "p1",
  single: ["fire1", "fire2", "water1"],
  parties: [{ element: "fire", members: ["fire1", "fire2"] }],
};

function viewWith(pending: PendingView, extra: Partial<GameView> = {}): GameView {
  return {
    viewer: "p1",
    opponent: "p2",
    turn: { number: 3, active: "p1", phase: "main1", step: null, startingPlayer: "p1" },
    players: {},
    hand: [],
    field: [],
    stack: [],
    attack: null,
    pending,
    potentialAttackers: 0,
    over: false,
    winner: null,
    ...extra,
  } as GameView;
}

describe("attackers (CR 10.1.2.1)", () => {
  it("a Forward that can attack alone, or a party of a shared element", () => {
    expect(attackGroupOk(attack, ["water1"])).toBe(true);
    expect(attackGroupOk(attack, ["fire1", "fire2"])).toBe(true);
    expect(attackGroupOk(attack, ["fire1", "water1"])).toBe(false);
    expect(attackGroupOk(attack, ["other"])).toBe(false);
    expect(attackGroupOk(attack, [])).toBe(false);
  });

  it("the main button attacks with the selection, or ends the attacks", () => {
    const view = viewWith(attack);
    expect(mainAction(view, [], null)?.decision).toEqual({ type: "endAttacks" });
    expect(mainAction(view, ["fire1", "fire2"], null)?.decision).toEqual({ type: "attack", forwards: ["fire1", "fire2"] });
  });
});

describe("main button", () => {
  it("blocks with the selected Forward, or not at all", () => {
    const view = viewWith({ kind: "declareBlock", player: "p1", blockers: ["b"] });
    expect(mainAction(view, [], "b")?.decision).toEqual({ type: "block", blocker: "b" });
    expect(mainAction(view, [], null)?.decision).toEqual({ type: "block", blocker: null });
  });

  it("resolves the stack, goes to the attacks, ends the turn", () => {
    const priority: PendingView = { kind: "priority", player: "p1", actions: [] };
    expect(mainAction(viewWith(priority), [], null)?.decision).toEqual({ type: "pass" });
    const main2 = viewWith(priority, { turn: { number: 3, active: "p1", phase: "main2", step: null, startingPlayer: "p1" } });
    expect(mainAction(main2, [], null)?.decision).toBe("endTurn");
    const stack = viewWith(priority, {
      stack: [{ id: "s1", kind: "summon", controller: "p2", sourceId: "x", defId: "d", targets: [] }],
    });
    expect(mainAction(stack, [], null)?.decision).toEqual({ type: "pass" });
  });

  it("nothing when the decision is the opponent's", () => {
    expect(mainAction(viewWith({ kind: "priority", player: "p2" }), [], null)).toBeNull();
  });
});
