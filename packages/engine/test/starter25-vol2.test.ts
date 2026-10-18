/** Starter Set 2025 Vol. 2 and the known cards of its LB deck: each card does what its text says. */
import { card } from "@finalcircle/cards";
import { describe, expect, it } from "vitest";
import { chars } from "../src/chars";
import { legalActions } from "../src/legal";
import type { Decision, GameState } from "../src/types";
import { act, backup, filler, forward, idOf, idsOf, passPhase, scenario, settle, summon, untilChoice } from "./helpers";

const c = card;
const fodderEarth = forward("t-fodder-earth", "earth", 9, 1000, { generic: true });
const fodderLightning = forward("t-fodder-lightning", "lightning", 9, 1000, { generic: true });
const opp5000 = forward("t-opp5", "wind", 3, 5000);
const opp9000 = forward("t-opp9", "wind", 5, 9000);

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
const activate = (
  s: GameState,
  source: string,
  ability: number,
  extra: Partial<Extract<Decision, { type: "activate" }>> = {},
) => {
  const o = legalActions(s, "p1").find((x) => x.type === "activate" && x.source === source && x.ability === ability);
  if (o?.type !== "activate") throw new Error(`ability ${ability} of ${source} cannot be used`);
  return act(s, "p1", { type: "activate", source, ability, payment: o.suggested, ...extra });
};

/** p1 attacks with one Forward, unblocked, up to the end of the damage (answering as suggested). */
function attackUnblocked(s: GameState, defId: string): GameState {
  s = toDeclaration(s);
  s = act(s, "p1", { type: "attack", forwards: [idOf(s, "p1", "field", defId)] });
  s = passPhase(s);
  return passPhase(s);
}

describe("Starter Set 2025 Vol. 2", () => {
  it("19-052C Undead Princess: put it into the Break Zone for +4000; from the Break Zone, remove it for +2000 to an Earth Forward", () => {
    let s = scenario({ p1: { field: [c("19-052C"), forward("t-earth", "earth", 3, 5000)] } });
    const earth = idOf(s, "p1", "field", "t-earth");
    s = settle(activate(s, idOf(s, "p1", "field", "19-052C"), 0, { targets: { t: [earth] } }));
    expect(chars(s, earth).power).toBe(9000);
    const princess = idOf(s, "p1", "break", "19-052C");
    s = settle(activate(s, princess, 1, { targets: { t: [earth] } }));
    expect(chars(s, earth).power).toBe(11000);
    expect(idsOf(s, "p1", "removed", "19-052C")).toHaveLength(1);
    const attack = passPhase(scenario({ p1: { breakZone: [c("19-052C")], field: [forward("t-earth", "earth", 3, 5000)] } }));
    expect(legalActions(attack, "p1").some((o) => o.type === "activate")).toBe(false);
  });

  it("22-068R Prishe: +2000 when chosen; a Character back from the Break Zone when she deals damage to your opponent", () => {
    let s = scenario({ p1: { field: [c("22-068R")], hand: [c("1-121C")], breakZone: [c("16-092C")] } });
    const prishe = idOf(s, "p1", "field", "22-068R");
    s = settle(act(s, "p1", { type: "pass" }));
    let t = scenario({ p1: { field: [c("22-068R"), c("1-121C")], hand: [fodderLightning], breakZone: [c("16-092C")] } });
    const redMage = idOf(t, "p1", "field", "1-121C");
    t = settle(activate(t, redMage, 0, { targets: { t: [idOf(t, "p1", "field", "22-068R")] } }));
    expect(chars(t, idOf(t, "p1", "field", "22-068R")).power).toBe(7000);
    void s;
    void prishe;
    let u = scenario({ p1: { field: [c("22-068R")], breakZone: [c("16-092C")] } });
    u = attackUnblocked(u, "22-068R");
    u = settle(u);
    expect(idsOf(u, "p1", "hand", "16-092C")).toHaveLength(1);
  });

  it("24-063H Hugh Yurg: search for an Earth Forward of cost 1 and play it; +2000 and Brave when a cost-1 Forward enters", () => {
    let s = scenario({
      p1: { hand: [c("24-063H"), fodderEarth, fodderEarth], deck: [...filler(3), c("19-052C"), ...filler(3)] },
    });
    s = untilChoice(cast(s, "p1", "24-063H"));
    s = untilChoice(choose(s, [idOf(s, "p1", "deck", "19-052C")]));
    expect(idsOf(s, "p1", "field", "19-052C")).toHaveLength(1);
    // The Princess's arrival (a cost-1 Forward) triggers Hugh Yurg.
    s = untilChoice(s);
    const p = s.pending;
    expect(p?.kind === "choice" && p.request.intent).toBe("target");
    const hugh = idOf(s, "p1", "field", "24-063H");
    s = settle(choose(s, [hugh]));
    expect(chars(s, hugh).power).toBe(10000);
    expect(chars(s, hugh).keywords).toEqual(["brave"]);
  });

  it("16-092C Noel: dull up to 2 opposing Forwards; 《ダル》, put him into the Break Zone: dull all of them", () => {
    let s = scenario({
      p1: { hand: [c("16-092C"), fodderLightning, fodderLightning, fodderLightning] },
      p2: { field: [opp5000, opp9000, forward("t-opp3", "wind", 1, 1000)] },
    });
    s = untilChoice(cast(s, "p1", "16-092C"));
    s = settle(choose(s, [idOf(s, "p2", "field", "t-opp5"), idOf(s, "p2", "field", "t-opp9")]));
    expect(s.objects[idOf(s, "p2", "field", "t-opp5")]?.dull).toBe(true);
    expect(s.objects[idOf(s, "p2", "field", "t-opp3")]?.dull).toBe(false);
    let t = scenario({ p1: { field: [c("16-092C")] }, p2: { field: [opp5000, opp9000] } });
    t = settle(activate(t, idOf(t, "p1", "field", "16-092C"), 1));
    expect(t.field.every((id) => t.objects[id]?.dull)).toBe(true);
    expect(idsOf(t, "p1", "break", "16-092C")).toHaveLength(1);
  });

  it("12-120C Shantotto: Haste to another Forward, or 'cannot be broken' to one of yours", () => {
    let s = scenario({
      p1: {
        hand: [c("12-120C")],
        field: [
          { def: forward("t-mine", "earth", 2, 5000), sick: true },
          backup("t-eb", "earth", 1),
          backup("t-lb", "lightning", 1),
        ],
      },
    });
    s = untilChoice(cast(s, "p1", "12-120C"));
    const p = s.pending;
    expect(p?.kind === "choice" && p.request.intent).toBe("mode");
    s = untilChoice(choose(s, ["0"]));
    s = settle(choose(s, [idOf(s, "p1", "field", "t-mine")]));
    expect(chars(s, idOf(s, "p1", "field", "t-mine")).keywords).toEqual(["haste"]);
  });

  it("18-124C Billy Bob: a Forward other than Billy Bob back from your Break Zone", () => {
    let s = scenario({ p1: { hand: [c("18-124C"), fodderEarth, fodderLightning], breakZone: [c("18-124C"), c("19-052C")] } });
    s = untilChoice(cast(s, "p1", "18-124C"));
    const p = s.pending;
    const options = p?.kind === "choice" && p.request.type === "pick" ? p.request.options.map((id) => s.objects[id]?.defId) : [];
    expect(options).toContain("19-052C");
    expect(options).not.toContain("18-124C");
    s = settle(choose(s, [idOf(s, "p1", "break", "19-052C")]));
    expect(idsOf(s, "p1", "hand", "19-052C")).toHaveLength(1);
  });

  it("9-074C Class Tenth Moogle: produces Lightning CP", () => {
    let s = scenario({ p1: { hand: [forward("t-l1", "lightning", 1, 3000)], field: [c("9-074C")] } });
    s = cast(s, "p1", "t-l1");
    expect(idsOf(s, "p1", "field", "t-l1")).toHaveLength(1);
  });

  it("18-064C Geomancer and 18-069C Red Mage: from the hand, discard them to draw 1 card", () => {
    for (const [code, fodder] of [
      ["18-064C", fodderEarth],
      ["18-069C", fodderLightning],
    ] as const) {
      let s = scenario({ p1: { hand: [c(code), fodder] } });
      s = settle(activate(s, idOf(s, "p1", "hand", code), 0));
      expect(idsOf(s, "p1", "break", code)).toHaveLength(1);
      expect(s.players.p1?.hand).toHaveLength(1);
    }
  });

  it("20-074C Miner: reveal the top 5 cards, take a Backup; 《2》《ダル》, put it into the Break Zone: draw 1 card", () => {
    let s = scenario({ p1: { hand: [c("20-074C"), fodderEarth, fodderEarth], deck: [...filler(2), c("9-074C"), ...filler(5)] } });
    s = untilChoice(cast(s, "p1", "20-074C"));
    s = untilChoice(choose(s, [idOf(s, "p1", "deck", "9-074C")]));
    s = settle(s);
    expect(idsOf(s, "p1", "hand", "9-074C")).toHaveLength(1);
    let t = scenario({ p1: { field: [c("20-074C")], hand: [fodderEarth] } });
    t = settle(activate(t, idOf(t, "p1", "field", "20-074C"), 1));
    expect(idsOf(t, "p1", "break", "20-074C")).toHaveLength(1);
    expect(t.players.p1?.hand).toHaveLength(1);
  });

  it("1-121C Red Mage: 《雷》《ダル》: a Forward gains Haste", () => {
    let s = scenario({
      p1: { field: [c("1-121C"), { def: forward("t-new", "earth", 2, 5000), sick: true }], hand: [fodderLightning] },
    });
    const f = idOf(s, "p1", "field", "t-new");
    s = settle(activate(s, idOf(s, "p1", "field", "1-121C"), 0, { targets: { t: [f] } }));
    expect(chars(s, f).keywords).toEqual(["haste"]);
  });

  it("20-105C Reeve: look at the top 3 cards and take 1 (EX BURST)", () => {
    let s = scenario({ p1: { hand: [c("20-105C"), fodderLightning, fodderLightning], deck: [c("13-072R"), ...filler(5)] } });
    s = untilChoice(cast(s, "p1", "20-105C"));
    s = untilChoice(choose(s, [idOf(s, "p1", "deck", "13-072R")]));
    s = settle(s);
    expect(idsOf(s, "p1", "hand", "13-072R")).toHaveLength(1);
  });

  it("13-072R Odin: break a Forward of cost 5 or less; cost reduced by 3 with 5 damage", () => {
    let s = scenario({
      p1: { hand: [c("13-072R"), fodderLightning, fodderLightning, fodderEarth] },
      p2: { field: [opp9000, forward("t-opp6", "wind", 6, 9000)] },
    });
    const o = legalActions(s, "p1").find((x) => x.type === "cast" && s.objects[x.card]?.defId === "13-072R");
    expect(o?.type === "cast" && o.choose[0]?.options).toEqual([idOf(s, "p2", "field", "t-opp9")]);
    s = settle(cast(s, "p1", "13-072R", { targets: { t: [idOf(s, "p2", "field", "t-opp9")] } }));
    expect(idsOf(s, "p2", "break", "t-opp9")).toHaveLength(1);
    const hurt = scenario({ p1: { hand: [c("13-072R"), fodderLightning], damage: filler(5, "d") }, p2: { field: [opp9000] } });
    const cheap = legalActions(hurt, "p1").find((x) => x.type === "cast" && hurt.objects[x.card]?.defId === "13-072R");
    expect(cheap?.type === "cast" && cheap.cost).toEqual({ elements: { lightning: 1 }, generic: 1 });
  });

  it("20-103H Ramuh: up to 2 of 3", () => {
    let s = scenario({
      p1: { hand: [c("20-103H"), fodderLightning], field: [{ def: forward("t-new", "earth", 2, 5000), sick: true }] },
      p2: { field: [opp5000] },
    });
    const opp = idOf(s, "p2", "field", "t-opp5");
    const mine = idOf(s, "p1", "field", "t-new");
    s = settle(cast(s, "p1", "20-103H", { modes: [1, 2], targets: { b: [opp], c: [mine] } }));
    expect(idsOf(s, "p2", "break", "t-opp5")).toHaveLength(1);
    expect(chars(s, mine).keywords).toEqual(["haste"]);
  });

  it("23-125R Noctis (LB 2): a Forward back from your Break Zone", () => {
    let s = scenario({
      p1: {
        hand: [fodderEarth, fodderEarth, fodderEarth],
        lb: [c("23-125R"), c("22-119R"), c("22-119R")],
        breakZone: [c("27-124S")],
      },
    });
    s = untilChoice(cast(s, "p1", "23-125R"));
    s = settle(choose(s, [idOf(s, "p1", "break", "27-124S")]));
    expect(idsOf(s, "p1", "hand", "27-124S")).toHaveLength(1);
  });

  it("22-119R Maat (LB 1): Brave; your Forwards gain +1000 power and Brave", () => {
    let s = scenario({
      p1: { hand: [fodderEarth, fodderEarth], lb: [c("22-119R"), c("23-125R")], field: [forward("t-mine", "earth", 2, 5000)] },
    });
    s = settle(cast(s, "p1", "22-119R"));
    const maat = idOf(s, "p1", "field", "22-119R");
    expect(chars(s, maat).keywords).toEqual(["brave"]);
    expect(chars(s, maat).power).toBe(9000);
    const mine = idOf(s, "p1", "field", "t-mine");
    expect(chars(s, mine).power).toBe(6000);
    expect(chars(s, mine).keywords).toEqual(["brave"]);
  });

  it("27-124S Cloud: +1000 and Brave to your Forwards; at the beginning of your Attack Phase, a Forward of yours is protected", () => {
    let s = scenario({ p1: { hand: [c("27-124S"), fodderEarth, fodderEarth], field: [forward("t-mine", "earth", 2, 5000)] } });
    s = settle(cast(s, "p1", "27-124S"));
    const mine = idOf(s, "p1", "field", "t-mine");
    expect(chars(s, mine).power).toBe(6000);
    s = passPhase(s);
    s = settle(choose(untilChoice(s), [mine]));
    expect(chars(s, mine).flags.sort()).toEqual(["cantBeBroken", "cantBeReturnedByOpponent"]);
  });

  it("27-125S Luso: breaks the Forwards he damages; when he damages your opponent, 3000 damage and/or a Character back", () => {
    let s = scenario({ p1: { field: [c("27-125S")], breakZone: [c("27-124S")] }, p2: { field: [{ def: opp9000, dull: true }] } });
    s = attackUnblocked(s, "27-125S");
    const p = s.pending;
    expect(p?.kind === "choice" && p.request.intent).toBe("mode");
    s = untilChoice(choose(s, ["0", "1"]));
    s = untilChoice(choose(s, [idOf(s, "p2", "field", "t-opp9")]));
    s = settle(choose(s, [idOf(s, "p1", "break", "27-124S")]));
    // The 3000 damage of his ability are dealt by Luso (CR 11.11.8): his first ability breaks that Forward.
    expect(idsOf(s, "p2", "break", "t-opp9")).toHaveLength(1);
    expect(idsOf(s, "p1", "hand", "27-124S")).toHaveLength(1);
  });

  it("27-126S Sphene: your Break Zone is safe from your opponent's removal; 《0》: a Forward put there this turn back to your hand", () => {
    const remover = summon("t-remover", "wind", 1, {
      summon: {
        choose: [{ key: "t", filter: {}, zone: "break", count: 1 }],
        effects: [{ op: "removeFromGame", what: { kind: "chosen", key: "t" } }],
      },
    });
    let s = scenario({
      p1: { hand: [remover, forward("t-wind-fodder", "wind", 9, 1000, { generic: true })] },
      p2: { field: [c("27-126S")], breakZone: [opp5000] },
    });
    s = settle(cast(s, "p1", "t-remover", { targets: { t: [idOf(s, "p2", "break", "t-opp5")] } }));
    expect(idsOf(s, "p2", "break", "t-opp5")).toHaveLength(1);
    let t = scenario({
      p1: { field: [c("27-126S"), forward("t-mine", "lightning", 2, 5000)], hand: [fodderLightning] },
      p2: { field: [opp9000] },
    });
    t = toDeclaration(t);
    t = act(t, "p1", { type: "attack", forwards: [idOf(t, "p1", "field", "t-mine")] });
    t = passPhase(t);
    t = act(t, "p2", { type: "block", blocker: idOf(t, "p2", "field", "t-opp9") });
    t = passPhase(passPhase(t));
    t = act(t, "p1", { type: "endAttacks" });
    expect(t.turn.phase).toBe("main2");
    t = settle(activate(t, idOf(t, "p1", "field", "27-126S"), 1, { targets: { t: [idOf(t, "p1", "break", "t-mine")] } }));
    expect(idsOf(t, "p1", "hand", "t-mine")).toHaveLength(1);
  });

  it("27-127S Lightning: break an opposing Forward of cost 4 or less (EX BURST); Haste to a Forward of yours when an opposing Forward goes", () => {
    let s = scenario({
      p1: {
        hand: [c("27-127S"), fodderLightning, fodderLightning, fodderLightning, fodderLightning],
        field: [{ def: forward("t-mine", "earth", 2, 5000), sick: true }],
      },
      p2: { field: [opp5000, opp9000] },
    });
    const o = legalActions(s, "p1").find((x) => x.type === "cast" && s.objects[x.card]?.defId === "27-127S");
    expect(o?.type === "cast").toBe(true);
    s = untilChoice(cast(s, "p1", "27-127S"));
    s = untilChoice(choose(s, [idOf(s, "p2", "field", "t-opp5")]));
    expect(idsOf(s, "p2", "break", "t-opp5")).toHaveLength(1);
    const mine = idOf(s, "p1", "field", "t-mine");
    s = settle(choose(s, [mine]));
    expect(chars(s, mine).keywords).toEqual(["haste"]);
  });
});
