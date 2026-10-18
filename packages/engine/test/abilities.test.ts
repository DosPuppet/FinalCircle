/** Abilities (CR 11.5–11.12, 15.2): effects, triggers, field abilities, replacements, Limit Break, EX Burst. */
import { describe, expect, it } from "vitest";
import { chars } from "../src/chars";
import { action, amount, auto, cond, cost, damageN, field, fx, modal, mode, ref, special, target, when } from "../src/dsl";
import { RulesError } from "../src/errors";
import { submit } from "../src/game";
import { legalActions } from "../src/legal";
import type { GameState } from "../src/types";
import {
  act,
  advanceUntil,
  backup,
  filler,
  forward,
  idOf,
  idsOf,
  passPhase,
  scenario,
  settle,
  summon,
  untilChoice,
} from "./helpers";

const opp2000 = forward("t-opp2", "water", 2, 2000);
const opp5000 = forward("t-opp5", "water", 3, 5000);
const opp9000 = forward("t-opp9", "water", 5, 9000);
const fire2 = forward("t-fire2", "fire", 2, 5000);
const fodder = forward("t-fodder", "fire", 1, 1000, { generic: true });
/** A card to discard for 2 CP of an element. */
const fodderOf = (e: "water" | "lightning" | "earth") => forward(`t-fodder-${e}`, e, 9, 1000, { generic: true });

/** p1 casts a card, paying with every other card of its hand as needed (the suggested payment). */
function castCard(s: GameState, defId: string, extra: object = {}): GameState {
  const card = idOf(s, "p1", "hand", defId);
  const o = legalActions(s, "p1").find((x) => x.type === "cast" && x.card === card);
  if (o?.type !== "cast") throw new Error(`${defId} cannot be cast`);
  return act(s, "p1", { type: "cast", card, payment: o.suggested, ...extra } as never);
}

const palom = backup("t-palom", "fire", 2, {
  abilities: [
    auto(
      when.enters,
      [fx.damage(ref.chosen(), amount.ifElse(cond.controls({ types: ["Forward"], names: ["Porom"] }), 8000, 4000))],
      {
        choose: [target.forward()],
        label: "Deal 4000 damage",
      },
    ),
  ],
});
const porom = forward("t-porom", "water", 2, 3000, { name: "Porom" });

describe("auto-abilities (CR 11.8)", () => {
  it("an enter trigger chooses its target when put on the stack, then resolves (11.8.7, 11.8.9)", () => {
    let s = scenario({ p1: { hand: [palom, fodder, fodder] }, p2: { field: [opp5000] } });
    s = castCard(s, "t-palom");
    const p = s.pending;
    expect(p?.kind === "choice" && p.purpose.kind).toBe("triggerTargets");
    s = act(s, "p1", { type: "choose", values: [idOf(s, "p2", "field", "t-opp5")] });
    expect(s.stack).toHaveLength(1);
    expect(s.stack[0]?.targets.t).toEqual([idOf(s, "p2", "field", "t-opp5")]);
    s = settle(s);
    expect(s.objects[idOf(s, "p2", "field", "t-opp5")]?.damage).toBe(4000);
  });

  it("a self-replacement amount: 8000 instead with a Porom Forward (11.12.5.6)", () => {
    let s = scenario({ p1: { hand: [palom, fodder, fodder], field: [porom] }, p2: { field: [opp9000] } });
    s = castCard(s, "t-palom");
    const p = s.pending;
    if (p?.kind === "choice") s = act(s, "p1", { type: "choose", values: [idOf(s, "p2", "field", "t-opp9")] });
    s = settle(s);
    expect(s.objects[idOf(s, "p2", "field", "t-opp9")]?.damage).toBe(8000);
  });

  it("no legal target: it triggers and is removed at once (11.8.4)", () => {
    let s = scenario({ p1: { hand: [palom, fodder, fodder] } });
    s = castCard(s, "t-palom");
    expect(s.stack).toHaveLength(0);
    expect(s.pending).toEqual({ kind: "priority", player: "p1" });
  });

  it("attack triggers; damage to every opposing Forward scaled by Backups (27-123S model)", () => {
    const zack = forward("t-zack", "fire", 5, 9000, {
      abilities: [
        auto(
          [when.enters, when.attacks],
          [
            fx.damage(
              ref.all({ types: ["Forward"], controller: "opponent" }),
              amount.times(1000, amount.count({ types: ["Backup"], controller: "you" })),
            ),
          ],
          { label: "1000 damage for each Backup" },
        ),
      ],
    });
    let s = scenario({
      p1: { field: [zack, backup("t-b1", "fire", 1), backup("t-b2", "fire", 1)] },
      p2: { field: [opp2000, opp5000] },
    });
    s = passPhase(passPhase(s));
    s = act(s, "p1", { type: "attack", forwards: [idOf(s, "p1", "field", "t-zack")] });
    s = settle(s);
    expect(idsOf(s, "p2", "break", "t-opp2")).toHaveLength(1);
    expect(s.objects[idOf(s, "p2", "field", "t-opp5")]?.damage).toBe(2000);
  });

  it("a trigger on being chosen by a Summon (22-068R model)", () => {
    const prishe = forward("t-prishe", "earth", 2, 5000, {
      abilities: [auto(when.chosenBy(), [fx.power(ref.self, 2000)], { label: "+2000 power" })],
    });
    const fairy = summon("t-fairy", "water", 1, { summon: { choose: [target.forward()], effects: [fx.activate(ref.chosen())] } });
    let s = scenario({ p1: { hand: [fairy, fodderOf("water")], field: [{ def: prishe, dull: true }] } });
    s = castCard(s, "t-fairy", { targets: { t: [idOf(s, "p1", "field", "t-prishe")] } });
    s = settle(s);
    expect(s.objects[idOf(s, "p1", "field", "t-prishe")]?.dull).toBe(false);
  });

  it("a Forward put from the field into the Break Zone triggers (27-127S model); dealing damage to a Forward triggers (27-125S)", () => {
    const luso = forward("t-luso", "earth", 1, 3000, {
      abilities: [auto(when.dealsDamageToForward, [fx.break(ref.event)], { label: "Break it" })],
    });
    let s = scenario({ p1: { field: [luso] }, p2: { field: [opp9000] } });
    s = passPhase(passPhase(s));
    s = act(s, "p1", { type: "attack", forwards: [idOf(s, "p1", "field", "t-luso")] });
    s = passPhase(s);
    s = act(s, "p2", { type: "block", blocker: idOf(s, "p2", "field", "t-opp9") });
    s = passPhase(s);
    s = settle(s);
    expect(idsOf(s, "p2", "break", "t-opp9")).toHaveLength(1);
    expect(idsOf(s, "p1", "break", "t-luso")).toHaveLength(1);
  });

  it("at the beginning of your Attack Phase (27-124S model): a gained 'cannot be broken'", () => {
    const cloud = forward("t-cloud", "earth", 3, 7000, {
      abilities: [
        auto(when.phaseStart("attack"), [fx.gain(ref.chosen(), [], ["cantBeBroken"])], {
          choose: [target.forward({ controller: "you" })],
          label: "Cannot be broken",
        }),
      ],
    });
    let s = scenario({ p1: { field: [cloud] }, p2: { field: [opp9000] } });
    s = passPhase(s);
    s = settle(s);
    expect(s.effects.some((e) => e.flags?.includes("cantBeBroken"))).toBe(true);
    s = passPhase(s);
    s = act(s, "p1", { type: "attack", forwards: [idOf(s, "p1", "field", "t-cloud")] });
    s = passPhase(s);
    s = act(s, "p2", { type: "block", blocker: idOf(s, "p2", "field", "t-opp9") });
    s = passPhase(s);
    expect(idsOf(s, "p1", "field", "t-cloud")).toHaveLength(1);
    expect(s.objects[idOf(s, "p1", "field", "t-cloud")]?.damage).toBe(9000);
  });
});

describe("action and special abilities (CR 11.6, 11.7)", () => {
  const warrior = backup("t-warrior", "fire", 2, {
    generic: true,
    abilities: [
      action(cost("《ダル》", { putSelf: true }), [fx.power(ref.chosen(), 1000)], {
        choose: [target.forward()],
        label: "+1000 power",
      }),
      action(cost("《火》《1》《ダル》", { putSelf: true }), [fx.damage(ref.chosen(), 5000)], {
        choose: [target.forward()],
        label: "Deal 5000 damage",
      }),
    ],
  });

  it("《ダル》 and 'put it into the Break Zone' as costs; it resolves without its source (11.5.4)", () => {
    let s = scenario({ p1: { field: [warrior, fire2], hand: [fodder] }, p2: { field: [opp5000] } });
    const w = idOf(s, "p1", "field", "t-warrior");
    const opp = idOf(s, "p2", "field", "t-opp5");
    s = act(s, "p1", {
      type: "activate",
      source: w,
      ability: 1,
      payment: { discard: [{ card: idOf(s, "p1", "hand", "t-fodder") }] },
      targets: { t: [opp] },
    });
    expect(idsOf(s, "p1", "break", "t-warrior")).toHaveLength(1);
    s = settle(s);
    expect(idsOf(s, "p2", "break", "t-opp5")).toHaveLength(1);
  });

  it("《ダル》 needs the card controlled since the start of the turn (11.6.2.2)", () => {
    const s = scenario({ p1: { field: [{ def: warrior, sick: true }, fire2] } });
    const w = idOf(s, "p1", "field", "t-warrior");
    expect(legalActions(s, "p1").some((o) => o.type === "activate" && o.source === w)).toBe(false);
    expect(() =>
      submit(s, "p1", { type: "activate", source: w, ability: 0, targets: { t: [idOf(s, "p1", "field", "t-fire2")] } }),
    ).toThrow(RulesError);
  });

  it("an ability usable from the hand: discard it as a cost (18-003C model)", () => {
    const machinist = backup("t-mach", "fire", 1, {
      generic: true,
      abilities: [action(cost("《火》", { discardSelf: true }), [fx.draw(1)], { zone: "hand", label: "Draw 1 card" })],
    });
    let s = scenario({ p1: { hand: [machinist, fodder] } });
    const before = s.players.p1?.hand.length ?? 0;
    const m = idOf(s, "p1", "hand", "t-mach");
    s = act(s, "p1", {
      type: "activate",
      source: m,
      ability: 0,
      payment: { discard: [{ card: idOf(s, "p1", "hand", "t-fodder") }] },
    });
    s = settle(s);
    expect(s.players.p1?.hand.length).toBe(before - 2 + 1);
    expect(idsOf(s, "p1", "break", "t-mach")).toHaveLength(1);
  });

  it("a special ability discards a card with the same name (11.7.1)", () => {
    const jecht = forward("t-jecht", ["water", "fire"], 4, 9000, {
      name: "Jecht",
      abilities: [
        special("Jecht Beam", cost("《ダル》"), [fx.damage(ref.chosen(), 8000)], {
          choose: [target.forward()],
          label: "Jecht Beam",
        }),
      ],
    });
    let s = scenario({ p1: { field: [jecht], hand: [jecht] }, p2: { field: [opp9000] } });
    const src = idOf(s, "p1", "field", "t-jecht");
    const o = legalActions(s, "p1").find((x) => x.type === "activate" && x.source === src);
    expect(o?.type === "activate" && o.special?.options).toEqual([idOf(s, "p1", "hand", "t-jecht")]);
    expect(() =>
      submit(s, "p1", { type: "activate", source: src, ability: 0, targets: { t: [idOf(s, "p2", "field", "t-opp9")] } }),
    ).toThrow(RulesError);
    s = act(s, "p1", {
      type: "activate",
      source: src,
      ability: 0,
      special: idOf(s, "p1", "hand", "t-jecht"),
      targets: { t: [idOf(s, "p2", "field", "t-opp9")] },
    });
    s = settle(s);
    expect(s.objects[idOf(s, "p2", "field", "t-opp9")]?.damage).toBe(8000);
    expect(s.objects[src]?.dull).toBe(true);
  });

  it("'cannot use action abilities' does not stop special abilities (27-128S model, CR 11.5.2)", () => {
    const charlotte = forward("t-charlotte", "water", 4, 8000, {
      abilities: [
        field(
          { flags: ["cantUseActionAbilities"] },
          { affects: { types: ["Forward"], controller: "opponent" }, label: "No action abilities" },
        ),
      ],
    });
    const actor = forward("t-actor", "fire", 2, 5000, {
      abilities: [action(cost("《ダル》"), [fx.draw(1)], { label: "Draw 1 card" })],
    });
    const s = scenario({ p1: { field: [actor] }, p2: { field: [charlotte] } });
    expect(legalActions(s, "p1").some((o) => o.type === "activate")).toBe(false);
  });
});

describe("field abilities and replacements (CR 11.9, 11.12)", () => {
  it("Damage N (15.2.6): +2000 power with 3 damage or more", () => {
    const alph = forward("t-alph", "water", 3, 6000, {
      abilities: [damageN(3, field({ power: 2000 }, { label: "+2000 power" }))],
    });
    const s = scenario({ p1: { field: [alph], damage: filler(3, "d") } });
    const fewer = scenario({ p1: { field: [alph], damage: filler(2, "d") } });
    expect(chars(s, idOf(s, "p1", "field", "t-alph")).power).toBe(8000);
    expect(chars(fewer, idOf(fewer, "p1", "field", "t-alph")).power).toBe(6000);
  });

  it("a conditional keyword (27-123S model): Haste while the opponent controls 3 Forwards or more", () => {
    const zack = forward("t-zack2", "fire", 5, 9000, {
      abilities: [
        field({ keywords: ["haste"] }, { condition: cond.opponentControls({ types: ["Forward"] }, 3), label: "Haste" }),
      ],
    });
    let s = scenario({ p1: { field: [{ def: zack, sick: true }] }, p2: { field: [opp2000, opp5000, opp9000] } });
    s = passPhase(passPhase(s));
    expect(s.pending).toEqual({ kind: "declareAttack", player: "p1" });
    const few = passPhase(passPhase(scenario({ p1: { field: [{ def: zack, sick: true }] }, p2: { field: [opp2000] } })));
    expect(few.turn.phase).toBe("main2");
  });

  it("damage replacements: reduced by 1000 (27-128S), 0 from the opponent's abilities (13-125R)", () => {
    const tough = forward("t-tough", "water", 4, 8000, {
      abilities: [field({ damage: { reduce: 1000 } }, { label: "Damage reduced by 1000" })],
    });
    const yuzuki = forward("t-yuzuki", ["water", "fire"], 3, 7000, {
      abilities: [
        field(
          { damage: { from: { controller: "opponent", kind: ["summon", "ability"] }, set: 0 } },
          { affects: { types: ["Forward"], elements: ["fire"], controller: "you" }, label: "No damage from abilities" },
        ),
      ],
    });
    const bolt = summon("t-bolt", "water", 1, {
      summon: { choose: [target.forward()], effects: [fx.damage(ref.chosen(), 5000)] },
    });
    let s = scenario({ p1: { hand: [bolt, fodderOf("water")] }, p2: { field: [tough, yuzuki, fire2] } });
    s = castCard(s, "t-bolt", { targets: { t: [idOf(s, "p2", "field", "t-tough")] } });
    s = settle(s);
    expect(s.objects[idOf(s, "p2", "field", "t-tough")]?.damage).toBe(4000);
    let t = scenario({ p1: { hand: [bolt, fodderOf("water")] }, p2: { field: [yuzuki, fire2] } });
    t = castCard(t, "t-bolt", { targets: { t: [idOf(t, "p2", "field", "t-fire2")] } });
    t = settle(t);
    expect(t.objects[idOf(t, "p2", "field", "t-fire2")]?.damage).toBe(0);
  });

  it("a one-time shield: the next damage reduced by 2000 (11-121C model)", () => {
    const shield = summon("t-shield", "water", 1, {
      summon: { choose: [target.forward()], effects: [fx.shield(ref.chosen(), 2000)] },
    });
    const bolt = summon("t-bolt2", "fire", 1, {
      summon: { choose: [target.forward()], effects: [fx.damage(ref.chosen(), 3000), fx.damage(ref.chosen(), 3000)] },
    });
    let s = scenario({ p1: { hand: [shield, bolt, fodderOf("water"), fodder], field: [fire2] } });
    const f = idOf(s, "p1", "field", "t-fire2");
    s = castCard(s, "t-shield", { targets: { t: [f] } });
    s = settle(s);
    s = castCard(s, "t-bolt2", { targets: { t: [f] } });
    s = settle(s);
    expect(s.objects[f]?.damage).toBe(1000 + 3000);
  });

  it("'cannot be chosen by your opponent's Summons of cost 1' (27-128S model)", () => {
    const guard = forward("t-guard", "water", 4, 8000, {
      abilities: [
        field(
          { cantBeChosenBy: { controller: "opponent", kind: ["summon"], cost: { max: 1 } } },
          { affects: { types: ["Forward"], controller: "you" }, label: "Protection" },
        ),
      ],
    });
    const bolt = summon("t-bolt3", "fire", 1, {
      summon: { choose: [target.forward()], effects: [fx.damage(ref.chosen(), 3000)] },
    });
    const big = summon("t-bolt4", "fire", 2, {
      summon: { choose: [target.forward()], effects: [fx.damage(ref.chosen(), 3000)] },
    });
    const s = scenario({ p1: { hand: [bolt, big, fodder] }, p2: { field: [guard, opp5000] } });
    const option = (defId: string) => {
      const card = idOf(s, "p1", "hand", defId);
      return legalActions(s, "p1").find((x) => x.type === "cast" && x.card === card);
    };
    // Every Forward of its controller is protected from cost-1 Summons: no target, it cannot be cast (CR 11.3.3).
    expect(option("t-bolt3")).toBeUndefined();
    const o = option("t-bolt4");
    expect(o?.type === "cast" && o.choose[0]?.options.length).toBe(2);
  });

  it("a Backup that can produce CP of another element (9-074C model)", () => {
    const moogle = backup("t-moogle", "earth", 2, { abilities: [field({ cpAs: ["lightning"] }, { label: "Lightning CP" })] });
    let s = scenario({ p1: { hand: [forward("t-light2", "lightning", 1, 3000)], field: [moogle] } });
    s = castCard(s, "t-light2");
    expect(idsOf(s, "p1", "field", "t-light2")).toHaveLength(1);
  });

  it("cast rules: only Fire CP (21-001R), a cost reduced with 5 damage (13-072R)", () => {
    const ward = forward("t-ward", "fire", 3, 8000, { castRules: { payOnly: ["fire"] } });
    const s = scenario({ p1: { hand: [ward, fodder], field: [backup("t-wb", "water", 1)] } });
    expect(() =>
      act(s, "p1", {
        type: "cast",
        card: idOf(s, "p1", "hand", "t-ward"),
        payment: { discard: [{ card: idOf(s, "p1", "hand", "t-fodder") }], dull: [{ backup: idOf(s, "p1", "field", "t-wb") }] },
      }),
    ).toThrow(RulesError);
    const odin = summon("t-odin", "lightning", 5, {
      castRules: { reduce: { by: 3, condition: cond.damage(5) } },
      summon: { effects: [fx.draw(1)] },
    });
    const cheap = scenario({
      p1: { hand: [odin], field: [backup("t-lb1", "lightning", 1), backup("t-lb2", "lightning", 1)], damage: filler(5, "d") },
    });
    const o = legalActions(cheap, "p1").find((x) => x.type === "cast");
    expect(o?.type === "cast" && o.cost).toEqual({ elements: { lightning: 1 }, generic: 1 });
  });
});

describe("effects of resolutions", () => {
  it("a modal Summon: up to 2 of 3 (20-103H model)", () => {
    const ramuh = summon("t-ramuh", "lightning", 1, {
      summon: {
        effects: [],
        modal: modal(
          2,
          [
            mode("Dull it", [fx.dull(ref.chosen("a"))], [target.forward({}, "a")]),
            mode("Deal it 5000 damage", [fx.damage(ref.chosen("b"), 5000)], [target.forward({}, "b")]),
            mode("Haste", [fx.gain(ref.chosen("c"), ["haste"])], [target.forward({}, "c")]),
          ],
          true,
        ),
      },
    });
    let s = scenario({ p1: { hand: [ramuh, fodderOf("lightning")] }, p2: { field: [opp9000, opp5000] } });
    const a = idOf(s, "p2", "field", "t-opp9");
    const b = idOf(s, "p2", "field", "t-opp5");
    s = castCard(s, "t-ramuh", { modes: [0, 1], targets: { a: [a], b: [b] } });
    s = settle(s);
    expect(s.objects[a]?.dull).toBe(true);
    expect(idsOf(s, "p2", "break", "t-opp5")).toHaveLength(1);
  });

  it("'When you do so' (23-119R model): a reflexive ability after a selection", () => {
    const vincent = forward("t-vincent", "fire", 2, 8000, {
      abilities: [
        auto(
          when.enters,
          [
            fx.select("you", { types: ["Backup"], elements: ["fire"], controller: "you" }, "b", 1, true),
            fx.toBreakZone(ref.stored("b")),
            fx.reflexive(
              auto([], [fx.damage(ref.chosen(), 9000)], {
                choose: [target.forward({ controller: "opponent" })],
                label: "Deal 9000 damage",
              }),
              cond.did("b"),
            ),
          ],
          { label: "Put a Fire Backup into the Break Zone" },
        ),
      ],
    });
    let s = scenario({ p1: { hand: [vincent, fodder], field: [backup("t-fb", "fire", 1)] }, p2: { field: [opp9000] } });
    s = castCard(s, "t-vincent");
    s = untilChoice(s);
    const p = s.pending;
    expect(p?.kind === "choice" && p.request.intent).toBe("select");
    s = act(s, "p1", { type: "choose", values: [idOf(s, "p1", "field", "t-fb")] });
    s = settle(s);
    expect(idsOf(s, "p1", "break", "t-fb")).toHaveLength(1);
    expect(idsOf(s, "p2", "break", "t-opp9")).toHaveLength(1);
  });

  it("the opponent selects (20-106R model, I15): not choosing", () => {
    const alph = forward("t-alph2", "water", 3, 6000, {
      abilities: [
        auto(
          when.enters,
          [
            fx.select("opponent", { types: ["Forward"], dull: true, controller: "opponent" }, "f"),
            fx.toBreakZone(ref.stored("f")),
          ],
          { label: "Your opponent puts a dull Forward into the Break Zone" },
        ),
      ],
    });
    let s = scenario({
      p1: { hand: [alph, fodderOf("water"), fodderOf("water")] },
      p2: { field: [{ def: opp9000, dull: true }, { def: opp5000, dull: true }, opp2000] },
    });
    s = castCard(s, "t-alph2");
    s = untilChoice(s);
    expect(s.pending?.player).toBe("p2");
    s = act(s, "p2", { type: "choose", values: [idOf(s, "p2", "field", "t-opp5")] });
    s = settle(s);
    expect(idsOf(s, "p2", "break", "t-opp5")).toHaveLength(1);
    expect(idsOf(s, "p2", "field", "t-opp9")).toHaveLength(1);
  });

  it("search (15.1.1.8) to the hand and onto the field; look at the top 3, take 1, the rest to the bottom", () => {
    const seeker = backup("t-seeker", "water", 1, {
      abilities: [auto(when.enters, [fx.search({ names: ["Porom"] })], { label: "Search for Porom" })],
    });
    let s = scenario({ p1: { hand: [seeker, fodderOf("water")], deck: [...filler(5), porom, ...filler(5)] } });
    s = castCard(s, "t-seeker");
    s = untilChoice(s);
    s = act(s, "p1", { type: "choose", values: [idOf(s, "p1", "deck", "t-porom")] });
    s = settle(s);
    expect(idsOf(s, "p1", "hand", "t-porom")).toHaveLength(1);
    const reeve = backup("t-reeve", "lightning", 1, {
      abilities: [auto(when.enters, [fx.lookTop(3)], { label: "Look at the top 3 cards" })],
    });
    const deck = [
      forward("t-a", "fire", 1, 1000),
      forward("t-b", "fire", 1, 1000),
      forward("t-c", "fire", 1, 1000),
      ...filler(5),
    ];
    let t = scenario({ p1: { hand: [reeve, fodderOf("lightning")], deck } });
    t = castCard(t, "t-reeve");
    t = untilChoice(t);
    const take = t.pending;
    expect(take?.kind === "choice" && take.request.intent).toBe("take");
    t = act(t, "p1", { type: "choose", values: [idOf(t, "p1", "deck", "t-b")] });
    t = settle(t);
    expect(idsOf(t, "p1", "hand", "t-b")).toHaveLength(1);
    const pl = t.players.p1;
    expect(pl?.deck.slice(-2).map((id) => t.objects[id]?.defId)).toEqual(["t-a", "t-c"]);
  });

  it("play a card from the hand onto the field (27-129S model, I6); discard and read the discarded card (11-121C)", () => {
    const yuna = forward("t-yuna", "water", 1, 7000, {
      abilities: [
        auto(when.enters, [fx.playFromHand({ types: ["Forward"], cost: { eq: 3 } })], { label: "Play a Forward of cost 3" }),
      ],
    });
    let s = scenario({ p1: { hand: [yuna, forward("t-three", "water", 3, 6000)], field: [backup("t-wbk", "water", 1)] } });
    s = castCard(s, "t-yuna");
    s = untilChoice(s);
    s = act(s, "p1", { type: "choose", values: [idOf(s, "p1", "hand", "t-three")] });
    s = settle(s);
    expect(idsOf(s, "p1", "field", "t-three")).toHaveLength(1);
    const poromLike = backup("t-poromlike", "water", 1, {
      abilities: [
        auto(
          when.enters,
          [fx.discard(1, "d"), fx.if(cond.stored("d", { categories: ["IV"] }), [fx.draw(2), fx.discard(1)], [fx.draw(1)])],
          { label: "Discard 1 card, then draw" },
        ),
      ],
    });
    const iv = forward("t-iv", "fire", 9, 1000, { categories: ["IV"] });
    let t = scenario({ p1: { hand: [poromLike, fodderOf("water"), iv, fire2] } });
    t = castCard(t, "t-poromlike");
    t = untilChoice(t);
    t = act(t, "p1", { type: "choose", values: [idOf(t, "p1", "hand", "t-iv")] });
    t = untilChoice(t);
    const p = t.pending;
    expect(p?.kind === "choice" && p.request.intent).toBe("discard");
  });
});

describe("Limit Break (CR 15.2.8) and EX Burst (CR 11.10)", () => {
  const lbZack = forward("t-lbzack", "fire", 1, 7000, { lb: 1 });
  const lbOther = forward("t-lbother", "fire", 3, 3000, { lb: 1 });

  it("cast from the LB deck, turning other face-down LB cards face up; back to the LB deck face up when it leaves", () => {
    let s = scenario({
      p1: { hand: [fodder], lb: [lbZack, lbOther] },
      p2: {
        hand: [
          summon("t-kill", "water", 1, { summon: { choose: [target.forward()], effects: [fx.break(ref.chosen())] } }),
          fodderOf("water"),
        ],
      },
    });
    const o = legalActions(s, "p1").find((x) => x.type === "cast" && x.from === "lb" && s.objects[x.card]?.defId === "t-lbzack");
    expect(o?.type === "cast" && o.lb).toEqual({ count: 1, options: [idOf(s, "p1", "lb", "t-lbother")] });
    s = act(s, "p1", {
      type: "cast",
      card: idOf(s, "p1", "lb", "t-lbzack"),
      payment: { discard: [{ card: idOf(s, "p1", "hand", "t-fodder") }] },
      lbFlip: [idOf(s, "p1", "lb", "t-lbother")],
    });
    expect(idsOf(s, "p1", "field", "t-lbzack")).toHaveLength(1);
    expect(s.objects[idOf(s, "p1", "lb", "t-lbother")]?.faceDown).toBeFalsy();
    s = act(s, "p1", { type: "pass" });
    s = act(s, "p2", {
      type: "cast",
      card: idOf(s, "p2", "hand", "t-kill"),
      payment: { discard: [{ card: idOf(s, "p2", "hand", "t-fodder-water") }] },
      targets: { t: [idOf(s, "p1", "field", "t-lbzack")] },
    });
    s = settle(s);
    expect(idsOf(s, "p1", "break", "t-lbzack")).toHaveLength(0);
    const back = idOf(s, "p1", "lb", "t-lbzack");
    expect(s.objects[back]?.faceDown).toBeFalsy();
  });

  it("an EX Burst revealed by damage is offered after the damage; a Summon applies its effects (11.10.3)", () => {
    const ifrit = summon("t-ifrit", "fire", 5, {
      exBurst: true,
      summon: { choose: [target.forward()], effects: [fx.damage(ref.chosen(), 9000)] },
    });
    let s = scenario({ p1: { field: [fire2, opp9000] }, p2: { deck: [ifrit, ...filler(10)] } });
    s = passPhase(passPhase(s));
    s = act(s, "p1", { type: "attack", forwards: [idOf(s, "p1", "field", "t-fire2")] });
    s = passPhase(s);
    s = passPhase(s);
    const p = s.pending;
    expect(p?.kind === "choice" && p.purpose.kind).toBe("exBurst");
    s = act(s, "p2", { type: "choose", values: [1] });
    s = act(s, "p2", { type: "choose", values: [idOf(s, "p1", "field", "t-opp9")] });
    s = settle(s);
    expect(idsOf(s, "p1", "break", "t-opp9")).toHaveLength(1);
    expect(idsOf(s, "p2", "damage", "t-ifrit")).toHaveLength(1);
  });

  it("an EX Burst without a legal target is not offered (I23)", () => {
    const ifrit = summon("t-ifrit2", "fire", 5, {
      exBurst: true,
      summon: { choose: [target.forward({ controller: "opponent" })], effects: [fx.damage(ref.chosen(), 9000)] },
    });
    let s = scenario({ p1: { field: [fire2] }, p2: { deck: [ifrit, ...filler(10)] } });
    s = passPhase(passPhase(s));
    s = act(s, "p1", { type: "attack", forwards: [idOf(s, "p1", "field", "t-fire2")] });
    s = advanceUntil(s, (x) => x.turn.phase === "main2");
    expect(idsOf(s, "p2", "damage", "t-ifrit2")).toHaveLength(1);
  });
});
