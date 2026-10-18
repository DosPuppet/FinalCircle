/**
 * Starter Set 2025 Vol. 1 (Fire/Water) and its LB deck. Each script follows the English text of the card, paragraph by
 * paragraph; keywords, Limit Break and costs read from the text are not repeated here.
 */
import { action, amount, auto, cond, cost, damageN, field, fx, ref, special, target, when } from "@finalcircle/engine";
import type { CardScript } from "../script";

const forwardsOf = (controller: "you" | "opponent") => ref.all({ types: ["Forward"], controller });

export const VOL1: Record<string, CardScript> = {
  // Fairy: "EX BURST Choose 1 Forward. Activate it. Draw 1 card."
  "1-170C": { summon: { choose: [target.forward()], effects: [fx.activate(ref.chosen()), fx.draw(1)] } },
  // Leonora: "EX BURST When Leonora enters the field, you may search for 1 Card Name Palom or Card Name Porom…"
  "3-143C": {
    abilities: [
      auto(when.enters, [fx.search({ names: ["Palom", "Porom"] })], { label: "Search for Palom or Porom", exBurst: true }),
    ],
  },
  // Warrior: two action abilities that put it into the Break Zone.
  "11-010C": {
    abilities: [
      action(cost("《ダル》", { putSelf: true }), [fx.power(ref.chosen(), 1000)], {
        choose: [target.forward()],
        label: "+1000 power until the end of the turn",
      }),
      action(cost("《火》《1》《ダル》", { putSelf: true }), [fx.damage(ref.chosen(), 5000)], {
        choose: [target.forward()],
        label: "Deal 5000 damage",
      }),
    ],
  },
  // Porom: discard 1 card, then draw according to its category; a shield of 2000 for a Forward.
  "11-121C": {
    abilities: [
      auto(
        when.enters,
        [fx.discard(1, "d"), fx.if(cond.stored("d", { categories: ["IV"] }), [fx.draw(2), fx.discard(1)], [fx.draw(1)])],
        { label: "Discard 1 card, then draw" },
      ),
      action(cost("《ダル》", { putSelf: true }), [fx.shield(ref.chosen(), 2000)], {
        choose: [target.forward()],
        label: "The next damage dealt to it is reduced by 2000",
      }),
    ],
  },
  // Ifrit: "EX BURST Choose 1 Forward. Deal it 9000 damage."
  "12-005C": { summon: { choose: [target.forward()], effects: [fx.damage(ref.chosen(), 9000)] } },
  // Palom: 4000 damage, 8000 instead if you control a Card Name Porom Forward.
  "13-013C": {
    abilities: [
      auto(
        when.enters,
        [fx.damage(ref.chosen(), amount.ifElse(cond.controls({ types: ["Forward"], names: ["Porom"] }), 8000, 4000))],
        { choose: [target.forward()], label: "Deal 4000 damage (8000 with a Porom Forward)" },
      ),
    ],
  },
  // Yuzuki: two damage replacements.
  "13-125R": {
    abilities: [
      field(
        { damage: { from: { controller: "opponent", kind: ["ability"] }, set: 0 } },
        {
          affects: { types: ["Forward"], elements: ["fire"], controller: "you" },
          label: "Your Fire Forwards take no damage from your opponent's abilities",
        },
      ),
      field(
        { damage: { reduce: 2000 } },
        {
          affects: { types: ["Forward"], elements: ["water"], controller: "you" },
          label: "Damage to your Water Forwards reduced by 2000",
        },
      ),
    ],
  },
  // Machinist: "《火》, discard Machinist: Draw 1 card. You can only use this ability if Machinist is in your hand."
  "18-003C": { abilities: [action(cost("《火》", { discardSelf: true }), [fx.draw(1)], { zone: "hand", label: "Draw 1 card" })] },
  // Geomancer (Water): the same with 《水》.
  "18-094C": { abilities: [action(cost("《水》", { discardSelf: true }), [fx.draw(1)], { zone: "hand", label: "Draw 1 card" })] },
  // Jecht: Haste, First Strike and Brave during your turn; the special ability Jecht Beam.
  "18-129C": {
    abilities: [
      action(cost("《火》《水》"), [fx.gain(ref.self, ["haste", "firstStrike", "brave"])], {
        limits: { yourTurn: true },
        label: "Haste, First Strike and Brave until the end of the turn",
      }),
      special("Jecht Beam", cost("《ダル》"), [fx.damage(ref.chosen(), 8000)], {
        choose: [target.forward()],
        label: "Jecht Beam",
      }),
    ],
  },
  // Alphinaud: the opponent selects one of their dull Forwards (I15); Damage 3: +2000 power.
  "20-106R": {
    abilities: [
      auto(
        when.enters,
        [fx.select("opponent", { types: ["Forward"], dull: true, controller: "opponent" }, "f"), fx.toBreakZone(ref.stored("f"))],
        { label: "Your opponent puts one of their dull Forwards into the Break Zone" },
      ),
      damageN(3, field({ power: 2000 }, { label: "+2000 power" })),
    ],
  },
  // Ward: "You can only pay with Fire CP to cast Ward." EX BURST: 7000 damage when it enters.
  "21-001R": {
    castRules: { payOnly: ["fire"] },
    abilities: [
      auto(when.enters, [fx.damage(ref.chosen(), 7000)], {
        choose: [target.forward()],
        label: "Deal 7000 damage",
        exBurst: true,
      }),
    ],
  },
  // Taivas: search a Warrior; 《0》: play a Warrior of cost 3 or less from your hand (your turn, once per turn).
  "21-010H": {
    abilities: [
      auto(when.enters, [fx.search({ jobOrName: ["Warrior"] })], { label: "Search for a Warrior" }),
      action(cost("《0》"), [fx.playFromHand({ character: true, jobOrName: ["Warrior"], cost: { max: 3 } }, false)], {
        limits: { yourTurn: true, oncePerTurn: true },
        label: "Play a Warrior of cost 3 or less from your hand",
      }),
    ],
  },
  // Zack (LB 1): 3000 damage when it enters.
  "22-112R": {
    abilities: [auto(when.enters, [fx.damage(ref.chosen(), 3000)], { choose: [target.forward()], label: "Deal 3000 damage" })],
  },
  // Leo (LB 1): draw 1 card when it enters.
  "22-123R": { abilities: [auto(when.enters, [fx.draw(1)], { label: "Draw 1 card" })] },
  // Vincent (LB 2): you may put 1 Fire Backup you control into the Break Zone; when you do so, 9000 damage.
  "23-119R": {
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
        { label: "You may put a Fire Backup into the Break Zone" },
      ),
    ],
  },
  // Luso (LB 1, Light): search a Job Standard Unit of the element of a Character you control; +4000 when one enters.
  "23-130H": {
    abilities: [
      auto(when.enters, [fx.search({ jobs: ["Standard Unit"], elementOf: ref.chosen("c") })], {
        choose: [target.character({ controller: "you" }, "c")],
        label: "Search for a Standard Unit of the same Element",
      }),
      auto(when.entersYourField({ jobs: ["Standard Unit"] }), [fx.power(ref.self, 4000)], {
        label: "+4000 power until the end of the turn",
      }),
    ],
  },
  // Ultima Weapon (LB 2): 9000 damage with 4 Fire Characters; with 4 Water Characters, the opponent's Forward goes.
  "24-126H": {
    abilities: [
      auto(when.enters, [fx.if(cond.controls({ character: true, elements: ["fire"] }, 4), [fx.damage(ref.chosen(), 9000)])], {
        choose: [target.forward()],
        label: "Deal 9000 damage with 4 Fire Characters",
      }),
      auto(
        when.enters,
        [fx.select("opponent", { types: ["Forward"], controller: "opponent" }, "f"), fx.toBreakZone(ref.stored("f"))],
        {
          condition: cond.controls({ character: true, elements: ["water"] }, 4),
          label: "Your opponent puts one of their Forwards into the Break Zone",
        },
      ),
    ],
  },
  // Wuk Lamat: with 7 Characters, your Forwards deal 2000 more damage to Forwards; 7000 damage with 5 Characters.
  "27-122S": {
    abilities: [
      field(
        { damage: { dealtBy: true, toForward: true, add: 2000 } },
        {
          affects: { types: ["Forward"], controller: "you" },
          condition: cond.controls({ character: true }, 7),
          label: "Your Forwards deal 2000 more damage to Forwards",
        },
      ),
      auto([when.enters, when.attacks], [fx.if(cond.controls({ character: true }, 5), [fx.damage(ref.chosen(), 7000)])], {
        choose: [target.forward({ controller: "opponent" })],
        label: "Deal 7000 damage with 5 Characters",
      }),
    ],
  },
  // Zack: Haste while your opponent controls 3 Forwards or more; 1000 damage for each Backup you control.
  "27-123S": {
    abilities: [
      field({ keywords: ["haste"] }, { condition: cond.opponentControls({ types: ["Forward"] }, 3), label: "Haste" }),
      auto(
        [when.enters, when.attacks],
        [fx.damage(forwardsOf("opponent"), amount.times(1000, amount.count({ types: ["Backup"], controller: "you" })))],
        { label: "1000 damage to the opposing Forwards for each Backup you control" },
      ),
    ],
  },
  // Charlotte: damage reduced by 1000; protection from cost-1 Summons; the opposing Forwards cannot use action abilities.
  "27-128S": {
    abilities: [
      field({ damage: { reduce: 1000 } }, { label: "Damage dealt to Charlotte reduced by 1000" }),
      field(
        { cantBeChosenBy: { controller: "opponent", kind: ["summon"], cost: { eq: 1 } } },
        {
          affects: { types: ["Forward"], controller: "you" },
          label: "Your Forwards cannot be chosen by your opponent's cost-1 Summons",
        },
      ),
      field(
        { flags: ["cantUseActionAbilities"] },
        { affects: { types: ["Forward"], controller: "opponent" }, label: "The opposing Forwards cannot use action abilities" },
      ),
    ],
  },
  // Yuna: you may play a Forward of cost 3 from your hand; when she attacks, look at the top 3 cards and take 1.
  "27-129S": {
    abilities: [
      auto(when.enters, [fx.playFromHand({ types: ["Forward"], cost: { eq: 3 } })], {
        label: "You may play a Forward of cost 3",
      }),
      auto(when.attacks, [fx.lookTop(3)], { label: "Look at the top 3 cards and take 1" }),
    ],
  },
};
