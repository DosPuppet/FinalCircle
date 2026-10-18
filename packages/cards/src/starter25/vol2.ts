/**
 * Starter Set 2025 Vol. 2 (Earth/Lightning) and the known cards of its LB deck. Each script follows the English text of
 * the card, paragraph by paragraph.
 */
import { action, auto, cond, cost, field, fx, modal, mode, ref, target, when } from "@finalcircle/engine";
import type { CardScript } from "../script";

const yourForwards = ref.all({ types: ["Forward"], controller: "you" });
const opposingForwards = ref.all({ types: ["Forward"], controller: "opponent" });

export const VOL2: Record<string, CardScript> = {
  // Undead Princess: put it into the Break Zone for +4000; from the Break Zone, remove it for +2000 to an Earth Forward.
  "19-052C": {
    abilities: [
      action(cost("", { putSelf: true }), [fx.power(ref.chosen(), 4000)], {
        choose: [target.forward()],
        label: "+4000 power until the end of the turn",
      }),
      action(cost("", { removeSelf: true }), [fx.power(ref.chosen(), 2000)], {
        choose: [target.forward({ elements: ["earth"] })],
        zone: "break",
        limits: { yourTurn: true, mainPhase: true },
        label: "+2000 power to an Earth Forward until the end of the turn",
      }),
    ],
  },
  // Prishe: +2000 when chosen by a Summon or an ability; a Character back from the Break Zone when she deals damage.
  "22-068R": {
    abilities: [
      auto(when.chosenBy(), [fx.power(ref.self, 2000)], { label: "+2000 power until the end of the turn" }),
      auto(when.dealsDamageToOpponent, [fx.toHand(ref.chosen())], {
        choose: [target.inBreakZone({ character: true })],
        label: "Add a Character from your Break Zone to your hand",
      }),
    ],
  },
  // Hugh Yurg: search for an Earth Forward of cost 1 and play it; +2000 and Brave when a cost-1 Forward enters.
  "24-063H": {
    abilities: [
      auto(when.enters, [fx.search({ types: ["Forward"], elements: ["earth"], cost: { eq: 1 } }, "field")], {
        label: "Search for an Earth Forward of cost 1 and play it",
      }),
      auto(
        when.entersYourField({ types: ["Forward"], cost: { eq: 1 } }),
        [fx.power(ref.chosen(), 2000), fx.gain(ref.chosen(), ["brave"])],
        {
          choose: [target.forward()],
          label: "+2000 power and Brave until the end of the turn",
        },
      ),
    ],
  },
  // Noel: EX BURST dull up to 2 opposing Forwards; 《ダル》, put him into the Break Zone: dull all the opposing Forwards.
  "16-092C": {
    abilities: [
      auto(when.enters, [fx.dull(ref.chosen())], {
        choose: [target.forward({ controller: "opponent" }, "t", 2, true)],
        label: "Dull up to 2 opposing Forwards",
        exBurst: true,
      }),
      action(cost("《ダル》", { putSelf: true }), [fx.dull(opposingForwards)], { label: "Dull all the opposing Forwards" }),
    ],
  },
  // Shantotto: select 1 of 2: Haste to another Forward, or "cannot be broken" to one of yours.
  "12-120C": {
    abilities: [
      auto(when.enters, [], {
        modal: modal(1, [
          mode("Another Forward gains Haste", [fx.gain(ref.chosen("a"), ["haste"])], [target.forward({ other: true }, "a")]),
          mode(
            "A Forward you control cannot be broken",
            [fx.gain(ref.chosen("b"), [], ["cantBeBroken"])],
            [target.forward({ controller: "you" }, "b")],
          ),
        ]),
        label: "Haste, or cannot be broken",
      }),
    ],
  },
  // Billy Bob: a Forward other than Billy Bob back from your Break Zone.
  "18-124C": {
    abilities: [
      auto(when.enters, [fx.toHand(ref.chosen())], {
        choose: [target.inBreakZone({ types: ["Forward"], notNames: ["Billy Bob"] })],
        label: "Add a Forward from your Break Zone to your hand",
      }),
    ],
  },
  // Class Tenth Moogle: "can produce Lightning CP".
  "9-074C": { abilities: [field({ cpAs: ["lightning"] }, { label: "Can produce Lightning CP" })] },
  // Geomancer (Earth): the hand draw with 《土》.
  "18-064C": { abilities: [action(cost("《土》", { discardSelf: true }), [fx.draw(1)], { zone: "hand", label: "Draw 1 card" })] },
  // Miner: reveal the top 5 cards, take a Backup; 《2》《ダル》, put it into the Break Zone: draw 1 card.
  "20-074C": {
    abilities: [
      auto(when.enters, [fx.lookTop(5, { filter: { types: ["Backup"] }, count: 1 }, true)], {
        label: "Reveal the top 5 cards and take a Backup",
      }),
      action(cost("《2》《ダル》", { putSelf: true }), [fx.draw(1)], { label: "Draw 1 card" }),
    ],
  },
  // Red Mage (1-121C): 《雷》《ダル》: a Forward gains Haste.
  "1-121C": {
    abilities: [
      action(cost("《雷》《ダル》"), [fx.gain(ref.chosen(), ["haste"])], {
        choose: [target.forward()],
        label: "Haste until the end of the turn",
      }),
    ],
  },
  // Red Mage (18-069C): the hand draw with 《雷》.
  "18-069C": { abilities: [action(cost("《雷》", { discardSelf: true }), [fx.draw(1)], { zone: "hand", label: "Draw 1 card" })] },
  // Reeve: EX BURST look at the top 3 cards, take 1.
  "20-105C": {
    abilities: [auto(when.enters, [fx.lookTop(3)], { label: "Look at the top 3 cards and take 1", exBurst: true })],
  },
  // Odin: cost reduced by 3 with 5 damage; EX BURST break a Forward of cost 5 or less.
  "13-072R": {
    castRules: { reduce: { by: 3, condition: cond.damage(5) } },
    summon: { choose: [target.forward({ cost: { max: 5 } })], effects: [fx.break(ref.chosen())] },
  },
  // Ramuh: select up to 2 of 3.
  "20-103H": {
    summon: {
      effects: [],
      modal: modal(
        2,
        [
          mode("Dull a Forward", [fx.dull(ref.chosen("a"))], [target.forward({}, "a")]),
          mode("Deal 5000 damage to a Forward", [fx.damage(ref.chosen("b"), 5000)], [target.forward({}, "b")]),
          mode("A Forward gains Haste", [fx.gain(ref.chosen("c"), ["haste"])], [target.forward({}, "c")]),
        ],
        true,
      ),
    },
  },
  // Noctis (LB 2): a Forward back from your Break Zone.
  "23-125R": {
    abilities: [
      auto(when.enters, [fx.toHand(ref.chosen())], {
        choose: [target.inBreakZone({ types: ["Forward"] })],
        label: "Add a Forward from your Break Zone to your hand",
      }),
    ],
  },
  // Maat (LB 1, Brave): your Forwards gain +1000 power and Brave.
  "22-119R": {
    abilities: [
      auto(when.enters, [fx.power(yourForwards, 1000), fx.gain(yourForwards, ["brave"])], {
        label: "Your Forwards gain +1000 power and Brave",
      }),
    ],
  },
  // Cloud: your Forwards gain +3000 and Brave; at the beginning of your Attack Phase, a Forward of yours is protected.
  "27-124S": {
    abilities: [
      auto(when.enters, [fx.power(yourForwards, 3000), fx.gain(yourForwards, ["brave"])], {
        label: "Your Forwards gain +3000 power and Brave",
      }),
      auto(when.phaseStart("attack"), [fx.gain(ref.chosen(), [], ["cantBeBroken", "cantBeReturnedByOpponent"])], {
        choose: [target.forward({ controller: "you" })],
        label: "A Forward you control cannot be broken nor returned to the hand",
      }),
    ],
  },
  // Luso: breaks the Forwards he damages; when he deals damage to your opponent, select up to 2 of 2.
  "27-125S": {
    abilities: [
      auto(when.dealsDamageToForward, [fx.break(ref.event)], { label: "Break the damaged Forward" }),
      auto(when.dealsDamageToOpponent, [], {
        modal: modal(
          2,
          [
            mode("Deal 3000 damage to a Forward", [fx.damage(ref.chosen("a"), 3000)], [target.forward({}, "a")]),
            mode(
              "Add a Character from your Break Zone to your hand",
              [fx.toHand(ref.chosen("b"))],
              [target.inBreakZone({ character: true }, "b")],
            ),
          ],
          true,
        ),
        label: "3000 damage, or a Character back to your hand",
      }),
    ],
  },
  // Sphene: your Break Zone protected from your opponent's removal; 《0》: a Forward put there this turn back to your hand.
  "27-126S": {
    abilities: [
      field(
        { flags: ["cantBeRemovedByOpponent"] },
        { affects: { controller: "you" }, affectsZone: "break", label: "Your Break Zone cannot be removed from the game" },
      ),
      action(cost("《0》"), [fx.toHand(ref.chosen())], {
        choose: [target.inBreakZone({ types: ["Forward"], notNames: ["Sphene"], fromFieldThisTurn: true })],
        limits: { yourTurn: true, oncePerTurn: true },
        label: "Add a Forward put into your Break Zone this turn to your hand",
      }),
    ],
  },
  // Lightning: EX BURST break an opposing Forward of cost 4 or less; Haste to a Forward of yours when an opposing one goes.
  "27-127S": {
    abilities: [
      auto(when.enters, [fx.break(ref.chosen())], {
        choose: [target.forward({ controller: "opponent", cost: { max: 4 } })],
        label: "Break an opposing Forward of cost 4 or less",
        exBurst: true,
      }),
      auto(when.putIntoBreak({ types: ["Forward"], controller: "opponent" }), [fx.gain(ref.chosen(), ["haste"])], {
        choose: [target.forward({ controller: "you" })],
        label: "A Forward you control gains Haste",
      }),
    ],
  },
};
