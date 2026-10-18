/** The core rules of the Comprehensive Rules v3.3, by section (docs/rules.md). */
import { describe, expect, it } from "vitest";
import { cpSources, suggestPayment } from "../src/cp";
import { RulesError } from "../src/errors";
import { createGame, submit } from "../src/game";
import { legalActions } from "../src/legal";
import type { GameState } from "../src/types";
import { filterEvents, HIDDEN_CARD_ID, projectView } from "../src/view";
import { act, advanceUntil, backup, filler, forward, idOf, idsOf, passPhase, scenario, settle, summon } from "./helpers";

const fire3 = forward("t-fire3", "fire", 3, 7000);
const fire2 = forward("t-fire2", "fire", 2, 5000);
const water4 = forward("t-water4", "water", 4, 8000);
const fireWater = forward("t-fw", ["fire", "water"], 2, 6000);
const fireBackup = backup("t-fire-b", "fire", 2);
const waterBackup = backup("t-water-b", "water", 2);
const genericBackup = backup("t-gen-b", "fire", 1, { generic: true });
const light = forward("t-light", "light", 3, 7000);
const dark = forward("t-dark", "dark", 3, 7000);
const hasted = forward("t-haste", "fire", 2, 5000, { keywords: ["haste"] });
const brave = forward("t-brave", "fire", 2, 5000, { keywords: ["brave"] });
const striker = forward("t-first", "fire", 2, 6000, { keywords: ["firstStrike"] });
const ifritLike = summon("t-summon", "fire", 2);

/** p1 casts `card` paying with `payment`. */
const cast = (s: GameState, card: string, payment: object) => act(s, "p1", { type: "cast", card, payment } as never);

describe("CR 8: setting up the game", () => {
  const decks = { deck: filler(50), lb: [] };
  const game = () =>
    createGame({
      seed: 7,
      players: [
        { id: "p1", name: "A", ...decks },
        { id: "p2", name: "B", ...decks },
      ],
    }).state;

  it("a random player chooses who plays first (8.2.1.2); 5 cards each; mulligans in order (8.2.1.4)", () => {
    let s = game();
    const p = s.pending;
    expect(p?.kind === "choice" && p.purpose.kind).toBe("firstPlayer");
    const chooser = p?.player as string;
    s = act(s, chooser, { type: "choose", values: [0] });
    const first = chooser === "p1" ? "p2" : "p1";
    expect(s.turn.startingPlayer).toBe(first);
    expect(s.players.p1?.hand).toHaveLength(5);
    expect(s.players.p2?.hand).toHaveLength(5);
    expect(s.pending).toEqual({ kind: "mulligan", player: first });
    const before = [...(s.players[first]?.hand ?? [])];
    const uids = before.map((id) => s.objects[id]?.uid);
    s = act(s, first, { type: "mulligan" });
    // The 5 cards on the bottom in the order chosen, then 5 new ones.
    expect(s.pending?.kind === "choice" && s.pending.purpose.kind).toBe("mulliganOrder");
    s = act(s, first, { type: "choose", values: before });
    const pl = s.players[first];
    expect(pl?.hand).toHaveLength(5);
    expect(pl?.deck.slice(-5).map((id) => s.objects[id]?.uid)).toEqual(uids);
    expect(pl?.mulliganed).toBe(true);
    expect(s.pending?.player).not.toBe(first);
  });

  it("the first player draws one card on their first turn (8.2.1.5, 9.2.1.3)", () => {
    let s = game();
    const who = s.pending?.player as string;
    s = act(s, who, { type: "choose", values: [1] });
    s = act(s, who, { type: "keep" });
    s = act(s, who === "p1" ? "p2" : "p1", { type: "keep" });
    expect(s.turn.startingPlayer).toBe(who);
    expect(s.turn.number).toBe(1);
    expect(s.turn.phase).toBe("main1");
    expect(s.players[who]?.hand).toHaveLength(6);
    s = advanceUntil(s, (x) => x.turn.number === 2);
    expect(s.players[s.turn.active]?.hand).toHaveLength(7);
  });
});

describe("CR 9: phases", () => {
  it("Active Phase: the turn player's dull cards are activated, a frozen one is not (9.1.1.1, 15.2.4.2)", () => {
    let s = scenario({
      p1: {
        field: [
          { def: fire3, dull: true },
          { def: fire2, dull: true, frozen: true },
        ],
      },
      p2: { field: [{ def: water4, dull: true }] },
      active: "p2",
      phase: "main2",
    });
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.phase === "main1");
    expect(s.objects[idOf(s, "p1", "field", "t-fire3")]?.dull).toBe(false);
    const frozen = s.objects[idOf(s, "p1", "field", "t-fire2")];
    expect(frozen?.dull).toBe(true);
    expect(frozen?.frozen).toBeUndefined();
    expect(s.objects[idOf(s, "p2", "field", "t-water4")]?.dull).toBe(true);
  });

  it("End Phase: discard down to 5 (9.5.1.2), damage removed (9.5.1.3.1)", () => {
    let s = scenario({ p1: { hand: filler(7), field: [{ def: fire3, damage: 3000 }] }, phase: "main2" });
    s = passPhase(s);
    expect(s.pending).toEqual({ kind: "discard", player: "p1", count: 2 });
    expect(() => submit(s, "p1", { type: "discard", cards: s.players.p1?.hand.slice(0, 1) ?? [] })).toThrow(RulesError);
    s = act(s, "p1", { type: "discard", cards: s.players.p1?.hand.slice(0, 2) ?? [] });
    expect(s.players.p1?.hand).toHaveLength(5);
    expect(s.players.p1?.breakZone).toHaveLength(2);
    expect(s.turn.active).toBe("p2");
    expect(s.objects[idOf(s, "p1", "field", "t-fire3")]?.damage).toBe(0);
  });
});

describe("CR 11.2: paying CP", () => {
  it("discard a card for 2 CP of its element, dull a Backup for 1 (11.2.2.2)", () => {
    let s = scenario({ p1: { hand: [fire3, fire2], field: [fireBackup] } });
    const card = idOf(s, "p1", "hand", "t-fire3");
    s = cast(s, card, {
      discard: [{ card: idOf(s, "p1", "hand", "t-fire2") }],
      dull: [{ backup: idOf(s, "p1", "field", "t-fire-b") }],
    });
    expect(idsOf(s, "p1", "field", "t-fire3")).toHaveLength(1);
    expect(idsOf(s, "p1", "break", "t-fire2")).toHaveLength(1);
    expect(s.objects[idOf(s, "p1", "field", "t-fire-b")]?.dull).toBe(true);
  });

  it("at least one CP of the card's element (11.2.2)", () => {
    const s = scenario({ p1: { hand: [fire3, water4, water4] } });
    const card = idOf(s, "p1", "hand", "t-fire3");
    const [w1, w2] = idsOf(s, "p1", "hand", "t-water4");
    expect(() => cast(s, card, { discard: [{ card: w1 }, { card: w2 }] })).toThrow(RulesError);
    expect(legalActions(s, "p1").some((o) => o.type === "cast" && o.card === card)).toBe(false);
  });

  it("generated CP beyond the cost is lost (11.2.2.3, I1); not enough CP is refused", () => {
    let s = scenario({ p1: { hand: [fire3, fire2, fire2] } });
    const card = idOf(s, "p1", "hand", "t-fire3");
    const [a, b] = idsOf(s, "p1", "hand", "t-fire2");
    expect(() => cast(s, card, { discard: [{ card: a }] })).toThrow(RulesError);
    s = cast(s, card, { discard: [{ card: a }, { card: b }] });
    expect(idsOf(s, "p1", "field", "t-fire3")).toHaveLength(1);
  });

  it("a Multi-Element card needs one CP of each of its elements (11.2.2.1)", () => {
    const s = scenario({ p1: { hand: [fireWater, fire2, water4], field: [fireBackup, waterBackup] } });
    const card = idOf(s, "p1", "hand", "t-fw");
    const fireB = idOf(s, "p1", "field", "t-fire-b");
    const waterB = idOf(s, "p1", "field", "t-water-b");
    expect(() => cast(s, card, { discard: [{ card: idOf(s, "p1", "hand", "t-fire2") }] })).toThrow(RulesError);
    const ok = cast(s, card, { dull: [{ backup: fireB }, { backup: waterB }] });
    expect(idsOf(ok, "p1", "field", "t-fw")).toHaveLength(1);
  });

  it("Light and Dark cards are not discarded for CP, and are cast with CP of any element (5.2.1.3, 11.2.2)", () => {
    const s = scenario({ p1: { hand: [fire3, light, fire2], field: [waterBackup] } });
    expect(cpSources(s, "p1").map((x) => s.objects[x.id]?.defId)).not.toContain("t-light");
    const card = idOf(s, "p1", "hand", "t-light");
    const ok = cast(s, card, {
      discard: [{ card: idOf(s, "p1", "hand", "t-fire2") }],
      dull: [{ backup: idOf(s, "p1", "field", "t-water-b") }],
    });
    expect(idsOf(ok, "p1", "field", "t-light")).toHaveLength(1);
  });

  it("the suggested payment is minimal, Backups first", () => {
    const s = scenario({ p1: { hand: [fire3, fire2], field: [fireBackup, backup("t-fire-b2", "fire", 2), waterBackup] } });
    const pay = suggestPayment({ elements: { fire: 1 }, generic: 2 }, cpSources(s, "p1", [idOf(s, "p1", "hand", "t-fire3")]));
    expect(pay?.discard).toBeUndefined();
    expect(pay?.dull).toHaveLength(3);
  });
});

describe("CR 7.7, 11.4: casting Characters", () => {
  it("Backups enter dull (5.2.3.1.1.3); at most 5 Backups (7.7.4)", () => {
    let s = scenario({
      p1: { hand: [genericBackup, fire2, fire2], field: [genericBackup, genericBackup, genericBackup, genericBackup] },
    });
    s = cast(s, idOf(s, "p1", "hand", "t-gen-b"), { discard: [{ card: idsOf(s, "p1", "hand", "t-fire2")[0] }] });
    const placed = idsOf(s, "p1", "field", "t-gen-b");
    expect(placed).toHaveLength(5);
    expect(s.objects[placed[4] as string]?.dull).toBe(true);
    const more = scenario({ p1: { hand: [genericBackup, fire2], field: Array.from({ length: 5 }, () => genericBackup) } });
    expect(() =>
      cast(more, idOf(more, "p1", "hand", "t-gen-b"), { discard: [{ card: idOf(more, "p1", "hand", "t-fire2") }] }),
    ).toThrow(RulesError);
  });

  it("one Character of a name without the generic icon (7.7.3); one Light or Dark Character (7.7.5)", () => {
    const s = scenario({ p1: { hand: [fire3, fire2, fire2], field: [fire3] } });
    expect(() =>
      cast(s, idOf(s, "p1", "hand", "t-fire3"), { discard: idsOf(s, "p1", "hand", "t-fire2").map((card) => ({ card })) }),
    ).toThrow(RulesError);
    const ld = scenario({ p1: { hand: [dark, fire2, fire2], field: [light] } });
    expect(() =>
      cast(ld, idOf(ld, "p1", "hand", "t-dark"), { discard: idsOf(ld, "p1", "hand", "t-fire2").map((card) => ({ card })) }),
    ).toThrow(RulesError);
  });

  it("only the turn player, in a Main Phase, with an empty stack (9.3.1.5); not in the Attack Phase", () => {
    const s = scenario({ p1: { hand: [fire2] }, p2: { hand: [fire2, fire2] } });
    expect(legalActions(s, "p2")).toEqual([]);
    const p2Prio = act(s, "p1", { type: "pass" });
    expect(p2Prio.pending).toEqual({ kind: "priority", player: "p2" });
    expect(legalActions(p2Prio, "p2").filter((o) => o.type === "cast")).toEqual([]);
    const attack = scenario({ p1: { hand: [fire2, fire2] }, phase: "attack" });
    expect(legalActions(attack, "p1").filter((o) => o.type === "cast")).toEqual([]);
  });

  it("casting a Character gives priority to the turn player (11.4.7); a Summon can be cast by either player (9.3.1.6)", () => {
    let s = scenario({ p1: { hand: [fire2, fire2] }, p2: { hand: [ifritLike, fire2] } });
    const [a, b] = idsOf(s, "p1", "hand", "t-fire2");
    s = cast(s, a as string, { discard: [{ card: b }] });
    expect(s.pending).toEqual({ kind: "priority", player: "p1" });
    s = act(s, "p1", { type: "pass" });
    const opt = legalActions(s, "p2").find((o) => o.type === "cast");
    expect(opt?.type === "cast" && s.objects[opt.card]?.defId).toBe("t-summon");
    s = act(s, "p2", {
      type: "cast",
      card: idOf(s, "p2", "hand", "t-summon"),
      payment: { discard: [{ card: idOf(s, "p2", "hand", "t-fire2") }] },
    });
    expect(s.stack).toHaveLength(1);
    expect(s.pending).toEqual({ kind: "priority", player: "p2" });
    s = settle(s);
    expect(s.stack).toHaveLength(0);
    expect(idsOf(s, "p2", "break", "t-summon")).toHaveLength(1);
  });
});

/** p1's attack: Main Phase 1 passes, then the declaration. */
function toDeclaration(s: GameState): GameState {
  s = passPhase(s);
  return passPhase(s);
}

describe("CR 10: the Attack Phase", () => {
  it("only Forwards controlled since the start of the turn, or with Haste (10.1.2.1.1); attacking dulls (10.1.2.2)", () => {
    let s = scenario({ p1: { field: [fire3, { def: fire2, sick: true }, { def: hasted, sick: true }] } });
    s = toDeclaration(s);
    expect(s.pending).toEqual({ kind: "declareAttack", player: "p1" });
    const opt = legalActions(s, "p1").find((o) => o.type === "attack");
    const names = opt?.type === "attack" ? opt.single.map((id) => s.objects[id]?.defId).sort() : [];
    expect(names).toEqual(["t-fire3", "t-haste"]);
    s = act(s, "p1", { type: "attack", forwards: [idOf(s, "p1", "field", "t-fire3")] });
    expect(s.objects[idOf(s, "p1", "field", "t-fire3")]?.dull).toBe(true);
  });

  it("unblocked: 1 point of damage, the top card of the deck to the Damage Zone (10.1.4.1, 6.5.2)", () => {
    let s = scenario({ p1: { field: [fire3] } });
    s = toDeclaration(s);
    const top = s.players.p2?.deck[0];
    s = act(s, "p1", { type: "attack", forwards: [idOf(s, "p1", "field", "t-fire3")] });
    s = passPhase(s);
    expect(s.pending).toEqual({ kind: "priority", player: "p1" });
    s = passPhase(s);
    expect(s.players.p2?.damage).toHaveLength(1);
    expect(s.objects[s.players.p2?.damage[0] as string]?.uid).toBe(s.objects[top as string]?.uid ?? `c${top}`);
    expect(s.pending).toEqual({ kind: "priority", player: "p1" });
    s = passPhase(s);
    // Back to the declaration (10.1.4.6): no more Forward can attack, Main Phase 2.
    expect(s.turn.phase).toBe("main2");
  });

  it("blocked: each deals its power to the other, a Forward with damage ≥ power is broken (10.1.4.2, 12.4.5)", () => {
    let s = scenario({ p1: { field: [fire3] }, p2: { field: [fire2] } });
    s = toDeclaration(s);
    s = act(s, "p1", { type: "attack", forwards: [idOf(s, "p1", "field", "t-fire3")] });
    s = passPhase(s);
    expect(s.pending).toEqual({ kind: "declareBlock", player: "p2" });
    s = act(s, "p2", { type: "block", blocker: idOf(s, "p2", "field", "t-fire2") });
    s = passPhase(s);
    s = passPhase(s);
    expect(idsOf(s, "p2", "break", "t-fire2")).toHaveLength(1);
    expect(s.objects[idOf(s, "p1", "field", "t-fire3")]?.damage).toBe(5000);
    expect(s.players.p2?.damage).toHaveLength(0);
  });

  it("Brave: attacking does not dull (15.2.1.2); blocking does not dull (I12)", () => {
    let s = scenario({ p1: { field: [brave] }, p2: { field: [water4] } });
    s = toDeclaration(s);
    s = act(s, "p1", { type: "attack", forwards: [idOf(s, "p1", "field", "t-brave")] });
    expect(s.objects[idOf(s, "p1", "field", "t-brave")]?.dull).toBe(false);
    s = passPhase(s);
    s = act(s, "p2", { type: "block", blocker: idOf(s, "p2", "field", "t-water4") });
    expect(s.objects[idOf(s, "p2", "field", "t-water4")]?.dull).toBe(false);
  });

  it("a party of the same element; unblocked it deals 1 point in total (15.1.1.9, I4)", () => {
    let s = scenario({ p1: { field: [fire3, fire2, water4] } });
    s = toDeclaration(s);
    const opt = legalActions(s, "p1").find((o) => o.type === "attack");
    expect(opt?.type === "attack" && opt.parties.map((p) => p.element)).toEqual(["fire"]);
    const water = idOf(s, "p1", "field", "t-water4");
    expect(() => act(s, "p1", { type: "attack", forwards: [idOf(s, "p1", "field", "t-fire3"), water] })).toThrow(RulesError);
    s = act(s, "p1", { type: "attack", forwards: [idOf(s, "p1", "field", "t-fire3"), idOf(s, "p1", "field", "t-fire2")] });
    s = passPhase(s);
    s = passPhase(s);
    expect(s.players.p2?.damage).toHaveLength(1);
  });

  it("a blocked party: its total power on the blocker, the blocker's damage split by 1000 (10.1.4.2.1)", () => {
    let s = scenario({ p1: { field: [fire3, fire2] }, p2: { field: [forward("t-big", "water", 6, 14000)] } });
    s = toDeclaration(s);
    const f3 = idOf(s, "p1", "field", "t-fire3");
    const f2 = idOf(s, "p1", "field", "t-fire2");
    s = act(s, "p1", { type: "attack", forwards: [f3, f2] });
    s = passPhase(s);
    s = act(s, "p2", { type: "block", blocker: idOf(s, "p2", "field", "t-big") });
    s = passPhase(s);
    const p = s.pending;
    expect(p?.kind === "choice" && p.purpose.kind).toBe("partyDamage");
    expect(() => act(s, "p2", { type: "choose", values: [7500, 6500] })).toThrow(RulesError);
    s = act(s, "p2", { type: "choose", values: [7000, 7000] });
    // 7000 + 5000 = 12000 < 14000: the blocker survives; 7000 on each attacker breaks both.
    expect(idsOf(s, "p2", "field", "t-big")).toHaveLength(1);
    expect(s.objects[idOf(s, "p2", "field", "t-big")]?.damage).toBe(12000);
    expect(idsOf(s, "p1", "break", "t-fire3")).toHaveLength(1);
    expect(idsOf(s, "p1", "break", "t-fire2")).toHaveLength(1);
  });

  it("First Strike: dealt first, a broken Forward deals no damage (15.2.3.2)", () => {
    let s = scenario({ p1: { field: [striker] }, p2: { field: [fire2] } });
    s = toDeclaration(s);
    s = act(s, "p1", { type: "attack", forwards: [idOf(s, "p1", "field", "t-first")] });
    s = passPhase(s);
    s = act(s, "p2", { type: "block", blocker: idOf(s, "p2", "field", "t-fire2") });
    s = passPhase(s);
    expect(idsOf(s, "p2", "break", "t-fire2")).toHaveLength(1);
    expect(s.objects[idOf(s, "p1", "field", "t-first")]?.damage).toBe(0);
  });
});

describe("CR 12.4: rule processes and the end of the game", () => {
  it("7 cards in the Damage Zone: the player loses (12.4.1, 3.1.1)", () => {
    let s = scenario({ p1: { field: [fire3] }, p2: { damage: filler(6, "dmg") } });
    s = toDeclaration(s);
    s = act(s, "p1", { type: "attack", forwards: [idOf(s, "p1", "field", "t-fire3")] });
    s = passPhase(s);
    s = passPhase(s);
    expect(s.over).toBe(true);
    expect(s.winner).toBe("p1");
  });

  it("drawing from an empty main deck loses (12.4.2)", () => {
    let s = scenario({ p1: { field: [fire3] }, p2: { deck: [] }, phase: "main2" });
    s = advanceUntil(s, (x) => x.over);
    expect(s.winner).toBe("p1");
  });

  it("damage with an empty main deck loses (3.1.3, 12.4.3)", () => {
    let s = scenario({ p1: { field: [fire3] }, p2: { deck: [] } });
    s = toDeclaration(s);
    s = act(s, "p1", { type: "attack", forwards: [idOf(s, "p1", "field", "t-fire3")] });
    s = passPhase(s);
    s = passPhase(s);
    expect(s.winner).toBe("p1");
  });

  it("conceding ends the game at any time (2.1)", () => {
    const s = act(scenario({}), "p2", { type: "concede" });
    expect(s.over).toBe(true);
    expect(s.winner).toBe("p1");
  });
});

describe("hidden information (CR 7.6, 7.14.2)", () => {
  it("the opponent's hand and face-down LB cards are hidden, their draws are counted only", () => {
    const lbCard = forward("t-lb", "fire", 3, 7000, { lb: 1 });
    let s = scenario({ p1: { hand: [fire3] }, p2: { hand: [water4], lb: [lbCard] }, phase: "main2" });
    const view = projectView(s, "p1");
    expect(view.players.p2?.handCount).toBe(1);
    expect(JSON.stringify(view)).not.toContain("t-water4");
    expect(view.players.p2?.lb[0]?.defId).toBe(HIDDEN_CARD_ID);
    expect(projectView(s, "p2").players.p2?.lb[0]?.defId).toBe("t-lb");
    const r = submit(s, "p1", { type: "pass" });
    s = r.state;
    const all = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.phase === "main1");
    expect(all.players.p2?.hand.length).toBeGreaterThan(1);
    const step = submit(passPhase(scenario({ active: "p2", phase: "end" })), "p1", { type: "pass" });
    for (const e of filterEvents(step.events, "p1")) if (e.type === "draw" && e.player === "p2") expect(e.cards).toBeUndefined();
  });
});
