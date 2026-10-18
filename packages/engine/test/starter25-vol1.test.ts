/** Starter Set 2025 Vol. 1 and its LB deck: each card does what its text says (Planecircle's per-set rules tests). */
import { card } from "@finalcircle/cards";
import { describe, expect, it } from "vitest";
import { chars } from "../src/chars";
import { RulesError } from "../src/errors";
import { submit } from "../src/game";
import { legalActions } from "../src/legal";
import type { Decision, GameState } from "../src/types";
import { act, backup, filler, forward, idOf, idsOf, passPhase, scenario, settle, summon, untilChoice } from "./helpers";

const c = card;
const fodderFire = forward("t-fodder-fire", "fire", 9, 1000, { generic: true });
const fodderWater = forward("t-fodder-water", "water", 9, 1000, { generic: true });
const opp5000 = forward("t-opp5", "wind", 3, 5000);
const opp9000 = forward("t-opp9", "wind", 5, 9000);

/** Casts a card with its suggested payment (`extra`: targets, modes, LB flips). */
function cast(
  s: GameState,
  player: "p1" | "p2",
  defId: string,
  extra: Partial<Extract<Decision, { type: "cast" }>> = {},
): GameState {
  const zoneIds = [...(s.players[player]?.hand ?? []), ...(s.players[player]?.lb ?? [])];
  const id = zoneIds.find((x) => s.objects[x]?.defId === defId);
  const o = legalActions(s, player).find((x) => x.type === "cast" && x.card === id);
  if (o?.type !== "cast") throw new Error(`${defId} cannot be cast`);
  return act(s, player, {
    type: "cast",
    card: o.card,
    payment: o.suggested,
    ...(o.lb ? { lbFlip: o.lb.options.slice(0, o.lb.count) } : {}),
    ...extra,
  });
}

const choose = (s: GameState, values: (string | number)[]) => act(s, s.pending?.player ?? "p1", { type: "choose", values });
const toDeclaration = (s: GameState) => passPhase(passPhase(s));

describe("Starter Set 2025 Vol. 1", () => {
  it("1-170C Fairy: activate a Forward, draw 1 card", () => {
    let s = scenario({ p1: { hand: [c("1-170C"), fodderWater], field: [{ def: opp5000, dull: true }] } });
    const f = idOf(s, "p1", "field", "t-opp5");
    const hand = s.players.p1?.hand.length ?? 0;
    s = settle(cast(s, "p1", "1-170C", { targets: { t: [f] } }));
    expect(s.objects[f]?.dull).toBe(false);
    expect(s.players.p1?.hand.length).toBe(hand - 2 + 1);
  });

  it("3-143C Leonora: search for Palom or Porom", () => {
    let s = scenario({ p1: { hand: [c("3-143C"), fodderWater, fodderWater], deck: [...filler(4), c("13-013C"), ...filler(4)] } });
    s = untilChoice(cast(s, "p1", "3-143C"));
    s = settle(choose(s, [idOf(s, "p1", "deck", "13-013C")]));
    expect(idsOf(s, "p1", "hand", "13-013C")).toHaveLength(1);
    expect(idsOf(s, "p1", "field", "3-143C")).toHaveLength(1);
    expect(s.objects[idOf(s, "p1", "field", "3-143C")]?.dull).toBe(true);
  });

  it("11-010C Warrior: +1000 power, or 5000 damage for 《火》《1》 (it goes to the Break Zone)", () => {
    let s = scenario({ p1: { field: [c("11-010C"), c("11-010C")], hand: [fodderFire] }, p2: { field: [opp5000] } });
    const [w1, w2] = idsOf(s, "p1", "field", "11-010C");
    const opp = idOf(s, "p2", "field", "t-opp5");
    s = settle(act(s, "p1", { type: "activate", source: w1 as string, ability: 0, targets: { t: [opp] } }));
    expect(chars(s, opp).power).toBe(6000);
    s = act(s, "p1", {
      type: "activate",
      source: w2 as string,
      ability: 1,
      payment: { discard: [{ card: idOf(s, "p1", "hand", "t-fodder-fire") }] },
      targets: { t: [opp] },
    });
    s = settle(s);
    expect(s.objects[opp]?.damage).toBe(5000);
    expect(idsOf(s, "p1", "break", "11-010C")).toHaveLength(2);
  });

  it("11-121C Porom: discard, then draw by the category; a shield of 2000", () => {
    let s = scenario({ p1: { hand: [c("11-121C"), fodderWater, c("3-143C"), fodderFire] } });
    s = untilChoice(cast(s, "p1", "11-121C"));
    // Leonora is a Category IV card: draw 2, then discard 1.
    s = untilChoice(choose(s, [idOf(s, "p1", "hand", "3-143C")]));
    const p = s.pending;
    expect(p?.kind === "choice" && p.request.intent).toBe("discard");
    s = settle(choose(s, [idOf(s, "p1", "hand", "t-fodder-fire")]));
    expect(s.players.p1?.hand).toHaveLength(2);
    // The last card of the hand is discarded without a question (not Category IV: draw 1).
    let t = scenario({ p1: { hand: [c("11-121C"), fodderWater, fodderFire] } });
    t = settle(cast(t, "p1", "11-121C"));
    expect(idsOf(t, "p1", "break", "t-fodder-fire")).toHaveLength(1);
    expect(t.players.p1?.hand).toHaveLength(1);
    let u = scenario({
      p1: {
        field: [c("11-121C"), forward("t-mine", "water", 2, 9000)],
        hand: [c("12-005C"), fodderFire, fodderFire, fodderFire],
      },
    });
    const mine = idOf(u, "p1", "field", "t-mine");
    u = settle(act(u, "p1", { type: "activate", source: idOf(u, "p1", "field", "11-121C"), ability: 1, targets: { t: [mine] } }));
    u = settle(cast(u, "p1", "12-005C", { targets: { t: [mine] } }));
    expect(u.objects[mine]?.damage).toBe(7000);
  });

  it("12-005C Ifrit: 9000 damage", () => {
    let s = scenario({ p1: { hand: [c("12-005C"), fodderFire, fodderFire, fodderFire] }, p2: { field: [opp9000] } });
    s = settle(cast(s, "p1", "12-005C", { targets: { t: [idOf(s, "p2", "field", "t-opp9")] } }));
    expect(idsOf(s, "p2", "break", "t-opp9")).toHaveLength(1);
  });

  it("13-013C Palom: 4000 damage, 8000 with a Card Name Porom Forward", () => {
    let s = scenario({ p1: { hand: [c("13-013C"), fodderFire] }, p2: { field: [opp9000] } });
    s = settle(choose(cast(s, "p1", "13-013C"), [idOf(s, "p2", "field", "t-opp9")]));
    expect(s.objects[idOf(s, "p2", "field", "t-opp9")]?.damage).toBe(4000);
    const poromForward = forward("t-porom-forward", "water", 2, 5000, { name: "Porom" });
    let t = scenario({ p1: { hand: [c("13-013C"), fodderFire], field: [poromForward] }, p2: { field: [opp9000] } });
    t = settle(choose(cast(t, "p1", "13-013C"), [idOf(t, "p2", "field", "t-opp9")]));
    expect(t.objects[idOf(t, "p2", "field", "t-opp9")]?.damage).toBe(8000);
  });

  it("13-125R Yuzuki: no damage to your Fire Forwards from your opponent's abilities; 2000 less to your Water Forwards", () => {
    const fireF = forward("t-fire-f", "fire", 2, 5000);
    const waterF = forward("t-water-f", "water", 2, 5000);
    const bolt = forward("t-pinger", "wind", 1, 1000, {
      abilities: [
        {
          kind: "auto",
          on: [{ on: "enters", self: true }],
          choose: [{ key: "t", filter: { types: ["Forward"] }, count: 1 }],
          effects: [{ op: "damage", to: { kind: "chosen", key: "t" }, amount: 3000 }],
          label: "Draw 1 card",
        },
      ],
    });
    let s = scenario({
      p1: { hand: [bolt, forward("t-wind-fodder", "wind", 9, 1000, { generic: true })] },
      p2: { field: [c("13-125R"), fireF, waterF] },
    });
    s = settle(choose(cast(s, "p1", "t-pinger"), [idOf(s, "p2", "field", "t-fire-f")]));
    expect(s.objects[idOf(s, "p2", "field", "t-fire-f")]?.damage).toBe(0);
    let t = scenario({
      p1: { hand: [bolt, forward("t-wind-fodder", "wind", 9, 1000, { generic: true })] },
      p2: { field: [c("13-125R"), waterF] },
    });
    t = settle(choose(cast(t, "p1", "t-pinger"), [idOf(t, "p2", "field", "t-water-f")]));
    expect(t.objects[idOf(t, "p2", "field", "t-water-f")]?.damage).toBe(1000);
  });

  it("18-003C Machinist and 18-094C Geomancer: from the hand, discard them to draw 1 card", () => {
    for (const [code, fodder] of [
      ["18-003C", fodderFire],
      ["18-094C", fodderWater],
    ] as const) {
      let s = scenario({ p1: { hand: [c(code), fodder] } });
      const src = idOf(s, "p1", "hand", code);
      const o = legalActions(s, "p1").find((x) => x.type === "activate" && x.source === src);
      expect(o?.type === "activate" && o.zone).toBe("hand");
      s = settle(act(s, "p1", { type: "activate", source: src, ability: 0, payment: o?.type === "activate" ? o.suggested : {} }));
      expect(idsOf(s, "p1", "break", code)).toHaveLength(1);
      expect(s.players.p1?.hand).toHaveLength(1);
    }
  });

  it("18-129C Jecht: Haste, First Strike and Brave during your turn; Jecht Beam discards a Jecht", () => {
    let s = scenario({ p1: { field: [c("18-129C")], hand: [c("18-129C"), fodderFire, fodderWater] }, p2: { field: [opp9000] } });
    const jecht = idOf(s, "p1", "field", "18-129C");
    s = settle(
      act(s, "p1", {
        type: "activate",
        source: jecht,
        ability: 0,
        payment: {
          discard: [{ card: idOf(s, "p1", "hand", "t-fodder-fire") }, { card: idOf(s, "p1", "hand", "t-fodder-water") }],
        },
      }),
    );
    expect(chars(s, jecht).keywords.sort()).toEqual(["brave", "firstStrike", "haste"]);
    s = settle(
      act(s, "p1", {
        type: "activate",
        source: jecht,
        ability: 1,
        special: idOf(s, "p1", "hand", "18-129C"),
        targets: { t: [idOf(s, "p2", "field", "t-opp9")] },
      }),
    );
    expect(s.objects[idOf(s, "p2", "field", "t-opp9")]?.damage).toBe(8000);
    const opp = scenario({ p1: { field: [c("18-129C")], hand: [fodderFire, fodderWater] }, active: "p2" });
    expect(legalActions(act(opp, "p2", { type: "pass" }), "p1").some((o) => o.type === "activate" && o.ability === 0)).toBe(
      false,
    );
  });

  it("20-106R Alphinaud: your opponent puts one of their dull Forwards into the Break Zone; Damage 3: +2000 power", () => {
    let s = scenario({
      p1: { hand: [c("20-106R"), fodderWater, fodderWater] },
      p2: { field: [{ def: opp9000, dull: true }, opp5000] },
    });
    s = settle(cast(s, "p1", "20-106R"));
    expect(idsOf(s, "p2", "break", "t-opp9")).toHaveLength(1);
    expect(idsOf(s, "p2", "field", "t-opp5")).toHaveLength(1);
    const d = scenario({ p1: { field: [c("20-106R")], damage: filler(3, "d") } });
    expect(chars(d, idOf(d, "p1", "field", "20-106R")).power).toBe(8000);
  });

  it("21-001R Ward: paid with Fire CP only; 7000 damage when it enters (EX BURST)", () => {
    const s = scenario({ p1: { hand: [c("21-001R"), fodderWater, fodderFire], field: [backup("t-wb", "water", 1)] } });
    const ward = idOf(s, "p1", "hand", "21-001R");
    expect(() =>
      submit(s, "p1", {
        type: "cast",
        card: ward,
        payment: {
          discard: [{ card: idOf(s, "p1", "hand", "t-fodder-fire") }],
          dull: [{ backup: idOf(s, "p1", "field", "t-wb") }],
        },
      }),
    ).toThrow(RulesError);
    let t = scenario({
      p1: { field: [forward("t-attacker", "fire", 2, 5000)] },
      p2: { deck: [c("21-001R"), ...filler(5)], field: [] },
    });
    t = toDeclaration(t);
    t = act(t, "p1", { type: "attack", forwards: [idOf(t, "p1", "field", "t-attacker")] });
    t = passPhase(passPhase(t));
    expect(t.pending?.kind === "choice" && t.pending.purpose.kind).toBe("exBurst");
    t = choose(t, [1]);
    t = settle(choose(t, [idOf(t, "p1", "field", "t-attacker")]));
    expect(idsOf(t, "p1", "break", "t-attacker")).toHaveLength(1);
  });

  it("21-010H Taivas: search for a Warrior; 《0》: play a Warrior of cost 3 or less, once per turn", () => {
    let s = scenario({
      p1: { hand: [c("21-010H"), fodderFire, fodderFire, fodderFire], deck: [...filler(3), c("11-010C"), ...filler(3)] },
    });
    s = untilChoice(cast(s, "p1", "21-010H"));
    s = settle(choose(s, [idOf(s, "p1", "deck", "11-010C")]));
    expect(idsOf(s, "p1", "hand", "11-010C")).toHaveLength(1);
    let t = scenario({ p1: { field: [c("21-010H")], hand: [c("13-125R"), c("21-001R")] } });
    const taivas = idOf(t, "p1", "field", "21-010H");
    t = untilChoice(act(t, "p1", { type: "activate", source: taivas, ability: 1 }));
    t = settle(choose(t, [idOf(t, "p1", "hand", "13-125R")]));
    expect(idsOf(t, "p1", "field", "13-125R")).toHaveLength(1);
    expect(legalActions(t, "p1").some((o) => o.type === "activate" && o.source === taivas)).toBe(false);
  });

  it("22-112R Zack (LB 1): cast from the LB deck, 3000 damage", () => {
    let s = scenario({ p1: { hand: [fodderFire, fodderFire], lb: [c("22-112R"), c("22-123R")] }, p2: { field: [opp5000] } });
    s = cast(s, "p1", "22-112R");
    s = settle(choose(s, [idOf(s, "p2", "field", "t-opp5")]));
    expect(s.objects[idOf(s, "p2", "field", "t-opp5")]?.damage).toBe(3000);
    expect(s.objects[idOf(s, "p1", "lb", "22-123R")]?.faceDown).toBeFalsy();
  });

  it("22-123R Leo (LB 1): draw 1 card", () => {
    let s = scenario({ p1: { hand: [fodderWater, fodderWater], lb: [c("22-123R"), c("22-112R")] } });
    s = settle(cast(s, "p1", "22-123R"));
    expect(s.players.p1?.hand).toHaveLength(1);
  });

  it("23-119R Vincent (LB 2): First Strike; a Fire Backup into the Break Zone, then 9000 damage", () => {
    let s = scenario({
      p1: { hand: [fodderFire, fodderFire], lb: [c("23-119R"), c("22-112R"), c("22-123R")], field: [backup("t-fb", "fire", 1)] },
      p2: { field: [opp9000] },
    });
    s = untilChoice(cast(s, "p1", "23-119R"));
    expect(chars(s, idOf(s, "p1", "field", "23-119R")).keywords).toEqual(["firstStrike"]);
    s = untilChoice(choose(s, [idOf(s, "p1", "field", "t-fb")]));
    s = settle(s);
    expect(idsOf(s, "p1", "break", "t-fb")).toHaveLength(1);
    expect(idsOf(s, "p2", "break", "t-opp9")).toHaveLength(1);
  });

  it("23-130H Luso (LB 1): a Standard Unit of the chosen Character's element; +4000 when a Standard Unit enters", () => {
    let s = scenario({
      p1: {
        hand: [fodderFire, fodderWater, c("18-003C")],
        lb: [c("23-130H"), c("22-112R")],
        field: [backup("t-fire-backup", "fire", 2)],
        deck: [...filler(2), c("11-010C"), c("18-094C"), ...filler(2)],
      },
    });
    s = untilChoice(cast(s, "p1", "23-130H"));
    s = untilChoice(choose(s, [idOf(s, "p1", "field", "t-fire-backup")]));
    const p = s.pending;
    // Only the Fire Standard Units: Warrior, not Geomancer (Water).
    expect(p?.kind === "choice" && p.request.type === "pick" && p.request.options.map((id) => s.objects[id]?.defId)).toEqual([
      "11-010C",
    ]);
    s = settle(choose(s, [idOf(s, "p1", "deck", "11-010C")]));
    const luso = idOf(s, "p1", "field", "23-130H");
    s = settle(cast(s, "p1", "11-010C"));
    expect(chars(s, luso).power).toBe(9000);
  });

  it("24-126H Ultima Weapon (LB 2): 9000 damage with 4 Fire Characters; with 4 Water Characters, an opposing Forward goes", () => {
    const lb = [c("24-126H"), c("22-112R"), c("22-123R")];
    const hand = [fodderFire, fodderWater, fodderFire];
    // Ultima Weapon is Fire and Water: with it, 4 Fire Characters (and only 1 Water).
    const fire = [backup("t-f1", "fire", 1), backup("t-f2", "fire", 1), forward("t-f3", "fire", 1, 1000)];
    let s = scenario({ p1: { hand, lb, field: fire }, p2: { field: [opp9000, opp5000] } });
    s = untilChoice(cast(s, "p1", "24-126H"));
    s = settle(choose(s, [idOf(s, "p2", "field", "t-opp9")]));
    expect(idsOf(s, "p2", "break", "t-opp9")).toHaveLength(1);
    expect(idsOf(s, "p2", "field", "t-opp5")).toHaveLength(1);
    // 4 Water Characters (and only 1 Fire): the opponent puts one of their Forwards into the Break Zone, no damage.
    const water = [backup("t-w1", "water", 1), backup("t-w2", "water", 1), forward("t-w3", "water", 1, 1000)];
    let t = scenario({ p1: { hand: [fodderWater, fodderWater, fodderFire], lb, field: water }, p2: { field: [opp9000] } });
    t = untilChoice(cast(t, "p1", "24-126H"));
    t = settle(t);
    expect(idsOf(t, "p2", "break", "t-opp9")).toHaveLength(1);
    expect(t.objects[idOf(t, "p2", "break", "t-opp9")]?.damage).toBe(0);
  });

  it("27-122S Wuk Lamat: 7000 damage with 5 Characters; with 7, your Forwards deal 2000 more damage to Forwards", () => {
    const backups = Array.from({ length: 4 }, (_, i) => backup(`t-b${i}`, "fire", 1));
    let s = scenario({ p1: { hand: [c("27-122S"), fodderFire], field: backups }, p2: { field: [opp9000] } });
    s = settle(choose(cast(s, "p1", "27-122S"), [idOf(s, "p2", "field", "t-opp9")]));
    expect(s.objects[idOf(s, "p2", "field", "t-opp9")]?.damage).toBe(7000);
    const seven = [...Array.from({ length: 5 }, (_, i) => backup(`t-b${i}`, "fire", 1)), forward("t-x", "fire", 1, 3000)];
    let t = scenario({ p1: { field: [c("27-122S"), ...seven] }, p2: { field: [opp9000] } });
    t = toDeclaration(t);
    t = act(t, "p1", { type: "attack", forwards: [idOf(t, "p1", "field", "t-x")] });
    t = passPhase(t);
    t = act(t, "p2", { type: "block", blocker: idOf(t, "p2", "field", "t-opp9") });
    t = passPhase(t);
    // 3000 battle damage + 2000.
    expect(t.objects[idOf(t, "p2", "field", "t-opp9")]?.damage).toBe(5000);
  });

  it("27-123S Zack: Haste against 3 Forwards; 1000 damage for each Backup to every opposing Forward", () => {
    let s = scenario({
      p1: {
        hand: [c("27-123S"), fodderFire, fodderFire],
        field: [backup("t-b1", "fire", 1), backup("t-b2", "water", 1), backup("t-b3", "fire", 1)],
      },
      p2: { field: [forward("t-o3", "wind", 1, 3000), opp5000, opp9000] },
    });
    s = settle(cast(s, "p1", "27-123S"));
    expect(idsOf(s, "p2", "break", "t-o3")).toHaveLength(1);
    expect(s.objects[idOf(s, "p2", "field", "t-opp5")]?.damage).toBe(3000);
    const zack = idOf(s, "p1", "field", "27-123S");
    // Two opposing Forwards left: no Haste any more.
    expect(chars(s, zack).keywords).toEqual([]);
    const three = scenario({
      p1: { field: [c("27-123S")] },
      p2: { field: [forward("t-o1", "wind", 1, 1000), forward("t-o2", "ice", 1, 1000), opp9000] },
    });
    expect(chars(three, idOf(three, "p1", "field", "27-123S")).keywords).toEqual(["haste"]);
  });

  it("27-128S Charlotte: 1000 less damage; your Forwards safe from cost-1 Summons; the opposing Forwards cannot use action abilities", () => {
    const bolt = summon("t-bolt", "wind", 1, {
      summon: {
        choose: [{ key: "t", filter: { types: ["Forward"] }, count: 1 }],
        effects: [{ op: "damage", to: { kind: "chosen", key: "t" }, amount: 3000 }],
      },
    });
    const s = scenario({
      p1: { hand: [bolt, forward("t-wf", "wind", 9, 1000, { generic: true })], field: [c("18-129C")] },
      p2: { field: [c("27-128S")] },
    });
    const o = legalActions(s, "p1").find((x) => x.type === "cast" && s.objects[x.card]?.defId === "t-bolt");
    // Only p1's own Forward can be chosen by the cost-1 Summon.
    expect(o?.type === "cast" && o.choose[0]?.options).toEqual([idOf(s, "p1", "field", "18-129C")]);
    expect(legalActions(s, "p1").some((o) => o.type === "activate" && o.ability === 0)).toBe(false);
    let t = scenario({ p1: { field: [forward("t-hit", "fire", 3, 5000)] }, p2: { field: [c("27-128S")] } });
    t = toDeclaration(t);
    t = act(t, "p1", { type: "attack", forwards: [idOf(t, "p1", "field", "t-hit")] });
    t = passPhase(t);
    t = act(t, "p2", { type: "block", blocker: idOf(t, "p2", "field", "27-128S") });
    t = passPhase(t);
    expect(t.objects[idOf(t, "p2", "field", "27-128S")]?.damage).toBe(4000);
  });

  it("27-129S Yuna: play a Forward of cost 3 from your hand; when she attacks, look at the top 3 cards and take 1", () => {
    let s = scenario({
      p1: { hand: [c("27-129S"), c("13-125R")], field: Array.from({ length: 4 }, (_, i) => backup(`t-wb${i}`, "water", 1)) },
    });
    s = untilChoice(cast(s, "p1", "27-129S"));
    s = settle(choose(s, [idOf(s, "p1", "hand", "13-125R")]));
    expect(idsOf(s, "p1", "field", "13-125R")).toHaveLength(1);
    let t = scenario({ p1: { field: [c("27-129S")], deck: [c("12-005C"), c("1-170C"), c("21-001R"), ...filler(3)] } });
    t = toDeclaration(t);
    t = untilChoice(act(t, "p1", { type: "attack", forwards: [idOf(t, "p1", "field", "27-129S")] }));
    t = untilChoice(choose(t, [idOf(t, "p1", "deck", "12-005C")]));
    t = settle(t);
    expect(idsOf(t, "p1", "hand", "12-005C")).toHaveLength(1);
  });
});
