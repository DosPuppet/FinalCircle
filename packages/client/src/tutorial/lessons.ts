/**
 * The tutorial lessons (from Planecircle's design): each one is a staged game excerpt on the Starter Set 2025 cards —
 * you play the Fire/Water cards of Vol. 1, the opponent the Earth/Lightning cards of Vol. 2 — with a scripted
 * opponent and a sequence of steps. Every change is replayed by `client/test/tutorial.test.ts`.
 * Texts are English `msg` literals, translated on display (French catalog, vouvoiement); `**bold**` and CP symbols
 * (《火》, 《水》, 《S》, 《ダル》) are drawn by the guide's bubble.
 */
import { DECKS } from "@finalcircle/cards";
import { msg } from "@finalcircle/engine";
import {
  all,
  type Ctx,
  damageOf,
  gameOver,
  hovered,
  inBreakZone,
  type Lesson,
  myPhase,
  onField,
  onStack,
  pastTurn,
  pendingMine,
} from "./runtime";

/** Your cards (Starter Set 2025 Vol. 1, Fire/Water). */
const Y = {
  machinist: "18-003C",
  warrior: "11-010C",
  palom: "13-013C",
  ward: "21-001R",
  wuk: "27-122S",
  taivas: "21-010H",
  ifrit: "12-005C",
  geomancer: "18-094C",
  porom: "11-121C",
  leonora: "3-143C",
  alphinaud: "20-106R",
  charlotte: "27-128S",
  yuna: "27-129S",
  yuzuki: "13-125R",
  jecht: "18-129C",
  zack: "27-123S",
  zackLb: "22-112R",
  vincent: "23-119R",
  leo: "22-123R",
  ultima: "24-126H",
} as const;

/** The opponent's cards (Starter Set 2025 Vol. 2, Earth/Lightning). */
const O = {
  geomancer: "18-064C",
  moogle: "9-074C",
  miner: "20-074C",
  princess: "19-052C",
  luso: "27-125S",
  prishe: "22-068R",
  cloud: "27-124S",
  hugh: "24-063H",
  shantotto: "12-120C",
  billy: "18-124C",
  redMage: "1-121C",
  sphene: "27-126S",
  noel: "16-092C",
  ramuh: "20-103H",
} as const;

/** Decks without EX Burst cards: damage dealt in a lesson does not ask an unexpected question. */
const MY_DECK = [Y.warrior, Y.machinist, Y.porom, Y.geomancer, Y.alphinaud, Y.yuna, Y.wuk, Y.charlotte, Y.taivas, Y.yuzuki];
const THEIR_DECK = [O.geomancer, O.moogle, O.miner, O.prishe, O.cloud, O.hugh, O.billy, O.sphene, O.princess, O.shantotto];

const hasKeyword = (code: string, keyword: string) => (c: Ctx) =>
  c.view.field.some((o) => o.defId === code && o.controller === c.view.viewer && o.keywords.includes(keyword as never));

/** A deck list in a fixed mixed order (the final game is staged too: no shuffle in a scenario). */
function mixed(entries: [number, string][], seed: number): string[] {
  const cards = entries.flatMap(([n, code]) => Array.from({ length: n }, () => code));
  let x = seed;
  for (let i = cards.length - 1; i > 0; i--) {
    x = (x * 1103515245 + 12345) % 2147483648;
    const j = x % (i + 1);
    [cards[i], cards[j]] = [cards[j] as string, cards[i] as string];
  }
  return cards;
}

const vol1 = DECKS.find((d) => d.id === "starter-2025-vol1");
const vol2 = DECKS.find((d) => d.id === "starter-2025-vol2");
const gameDeck = mixed(vol1?.main ?? [], 7);
const aiDeck = mixed(vol2?.main ?? [], 11);
const lbOf = (entries: [number, string][] | undefined) =>
  (entries ?? []).flatMap(([n, code]) => Array.from({ length: n }, () => code));

export const LESSONS: Lesson[] = [
  // -------------------------------------------------------------------------
  {
    id: "screen",
    title: msg("The goal of the game and the screen"),
    summary: msg("Damage Zone, Forwards and Backups, hand, deck, Break Zone, LB deck and phases."),
    scenario: {
      active: "you",
      turn: 3,
      you: {
        deck: MY_DECK,
        hand: [Y.ward, Y.charlotte, Y.geomancer, Y.leonora],
        field: [Y.warrior, Y.porom, Y.wuk],
        damage: [Y.machinist, Y.alphinaud],
        lb: [Y.zackLb, Y.leo, Y.vincent, Y.ultima],
      },
      opponent: {
        deck: THEIR_DECK,
        hand: [O.prishe, O.luso, O.miner, O.redMage],
        field: [O.miner, O.cloud],
        damage: [O.princess],
      },
      opponentPlays: [],
    },
    steps: [
      {
        next: true,
        text: msg(
          "Welcome! This tutorial teaches you the **FINAL FANTASY Trading Card Game** through short game excerpts. Two players face each other, each with a deck of 50 cards.",
        ),
      },
      {
        next: true,
        target: "myDamage",
        text: msg(
          "This is your **Damage Zone**. Each point of damage you take puts the top card of your deck here. With **7 damage**, you lose the game.",
        ),
      },
      {
        next: true,
        target: "oppDamage",
        text: msg("And this is your opponent's. Your goal: deal them 7 damage."),
      },
      {
        next: true,
        target: "myForwards",
        text: msg(
          "Your **Forwards** fight: they attack and block. Each one has a **power**, at the bottom of the card. Behind them, your **Backups** (5 at most) make the CP you pay your cards with.",
        ),
      },
      {
        next: true,
        target: "hand",
        text: msg("Your **hand**: the cards you can play. Your opponent only sees how many you hold."),
      },
      {
        next: true,
        target: "myDeck",
        text: msg(
          "Your **deck**, face down: you draw 2 cards at the start of each of your turns (only 1 on the very first turn of the game).",
        ),
      },
      {
        next: true,
        target: "myBreak",
        text: msg(
          "Your **Break Zone**: broken Forwards, Summons once used and discarded cards go there. Click it to look through it.",
        ),
      },
      {
        next: true,
        target: "myLb",
        text: msg(
          "Your **LB deck** (Limit Break): up to 8 powerful cards kept apart, face down. Lesson 9 shows how to play them.",
        ),
      },
      {
        next: true,
        target: "phases",
        text: msg(
          "Each turn goes through phases: **Active** (your cards become active again), **Draw**, **Main 1**, **Attack**, **Main 2** and **End**. The current one is lit.",
        ),
      },
      {
        target: { card: Y.ward, zone: "hand" },
        until: hovered(Y.ward),
        text: msg("Point at **Ward** in your hand (on a phone: hold your finger on it). The card is shown large, with its text."),
      },
      {
        next: true,
        target: "preview",
        text: msg(
          "Ward is a Fire Forward of cost 3 and power 8000. The **EX BURST** in its text can trigger for free when it lands in your Damage Zone: lesson 8 shows it.",
        ),
      },
      {
        target: "endTurn",
        allow: ["endTurn"],
        until: pastTurn(3),
        hint: msg("Click End turn."),
        text: msg("That is the screen. Now end your turn: click **End turn**."),
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: "cp",
    title: msg("CP and Backups"),
    summary: msg("Pay a card's cost with Backups and discarded cards."),
    scenario: {
      active: "you",
      turn: 3,
      you: { deck: MY_DECK, hand: [Y.machinist, Y.wuk, Y.ward, Y.geomancer, Y.alphinaud], field: [Y.warrior, Y.porom] },
      opponent: { deck: THEIR_DECK, hand: [O.prishe, O.luso, O.miner], field: [O.moogle, O.miner] },
      opponentPlays: [],
    },
    steps: [
      {
        next: true,
        target: { card: Y.machinist, zone: "hand" },
        text: msg(
          "To play a card, you pay its **cost** in **CP** (Crystal Points): the number at the top left. At least one of those CP must be of the card's **element**, its color.",
        ),
      },
      {
        next: true,
        target: "myBackups",
        text: msg(
          "Two ways to make CP: **dull an active Backup** (turn it sideways) for 1 CP of its element, or **discard a card** from your hand for 2 CP of its element.",
        ),
      },
      {
        target: { card: Y.machinist, zone: "hand" },
        allow: [{ cast: Y.machinist }],
        until: onField(Y.machinist),
        hint: msg("Click Machinist in your hand."),
        text: msg(
          "Play **Machinist**, a Fire Backup of cost 1: click it in your hand. The tray shows its cost, and the suggested payment dulls **Warrior**, your Fire Backup. Click **Confirm**.",
        ),
      },
      {
        next: true,
        target: "myBackups",
        text: msg(
          "Machinist is on the field. A Backup always enters the field **dull**: it will make CP from your next turn on.",
        ),
      },
      {
        target: { card: Y.wuk, zone: "hand" },
        allow: [{ cast: Y.wuk }],
        until: onField(Y.wuk),
        hint: msg("Click Wuk Lamat in your hand."),
        text: msg(
          "Now play **Wuk Lamat**, a Fire Forward of cost 3: 3 CP, at least 1 of them Fire. Only Porom (Water) is still active: **discard Ward** for 2 Fire CP and **dull Porom** for the third. Click them, or keep the suggestion.",
        ),
      },
      {
        next: true,
        target: "myBackups",
        text: msg(
          "CP are not kept: what a payment makes beyond the cost is lost. At the start of your next turn, your Backups become active again.",
        ),
      },
      {
        target: "endTurn",
        allow: ["endTurn"],
        until: pastTurn(3),
        hint: msg("Click End turn."),
        text: msg("End your turn."),
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: "forwards",
    title: msg("Forwards and attacks"),
    summary: msg("Play a Forward, attack, and deal damage."),
    scenario: {
      active: "you",
      turn: 3,
      you: { deck: MY_DECK, hand: [Y.charlotte, Y.zack], field: [Y.porom, Y.geomancer, Y.warrior, Y.machinist, Y.yuzuki] },
      opponent: { deck: THEIR_DECK, hand: [O.prishe, O.luso], field: [O.moogle] },
      opponentPlays: [],
    },
    steps: [
      {
        next: true,
        target: { card: Y.yuzuki, zone: "field" },
        text: msg("**Forwards** are your fighters: only they attack and block. Yuzuki has a power of 7000."),
      },
      {
        target: { card: Y.charlotte, zone: "hand" },
        allow: [{ cast: Y.charlotte }],
        until: onField(Y.charlotte),
        hint: msg("Click Charlotte in your hand."),
        text: msg("Play **Charlotte** (cost 4, Water): your four Backups pay for her."),
      },
      {
        next: true,
        target: { card: Y.charlotte, zone: "field" },
        text: msg(
          "Charlotte has just entered the field: a Forward **cannot attack** during the turn it enters, unless it has **Haste**. Yuzuki has been there since the start of the turn: she can.",
        ),
      },
      {
        target: "mainButton",
        allow: ["pass"],
        until: pendingMine("declareAttack"),
        hint: msg("Click To the attacks."),
        text: msg("Click **To the attacks** to start the Attack Phase."),
      },
      {
        target: { card: Y.yuzuki, zone: "field" },
        allow: [{ attack: [Y.yuzuki] }],
        until: (c) => damageOf(c, "opponent") >= 1,
        hint: msg("Click Yuzuki, then Attack."),
        text: msg(
          "Click **Yuzuki**, then **Attack**. Your opponent has no Forward to block with. An attacking Forward is dulled.",
        ),
      },
      {
        next: true,
        target: "oppDamage",
        text: msg(
          "When nobody blocks, the attack deals **1 damage** to the opponent, whatever the Forward's power: the top card of their deck goes to their Damage Zone. Six more to win!",
        ),
      },
      {
        target: "mainButton",
        allow: ["endAttacks", "endTurn"],
        until: pastTurn(3),
        hint: msg("Click End turn."),
        text: msg("Your attacks are over: click **End turn**."),
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: "battle",
    title: msg("Battles and broken Forwards"),
    summary: msg("A blocked attack: the two Forwards deal damage to each other."),
    scenario: {
      active: "you",
      turn: 5,
      you: { deck: MY_DECK, hand: [Y.geomancer], field: [Y.warrior, Y.porom, Y.yuzuki, Y.jecht] },
      opponent: {
        deck: THEIR_DECK,
        hand: [O.luso, O.miner],
        field: [O.moogle, O.prishe],
        damage: [O.geomancer, O.miner, O.luso],
      },
      opponentPlays: [{ turn: 5, do: "block", blocker: O.prishe }],
    },
    steps: [
      {
        next: true,
        text: msg(
          "When a Forward attacks, the opponent may **block** it with one of their active Forwards. The two then deal damage to each other: each deals damage equal to its power.",
        ),
      },
      {
        next: true,
        text: msg(
          "When the damage on a Forward reaches its power, it is **broken**: it goes to the Break Zone. Otherwise, the damage stays on it until the end of the turn.",
        ),
      },
      {
        target: "mainButton",
        allow: ["pass"],
        until: pendingMine("declareAttack"),
        hint: msg("Click To the attacks."),
        text: msg("Click **To the attacks**."),
      },
      {
        target: { card: Y.yuzuki, zone: "field" },
        allow: [{ attack: [Y.yuzuki] }],
        until: inBreakZone(O.prishe, "opponent"),
        hint: msg("Click Yuzuki, then Attack."),
        text: msg("Attack with **Yuzuki** (7000). Your opponent will block with **Prishe** (5000)."),
      },
      {
        next: true,
        target: { card: Y.yuzuki, zone: "field" },
        text: msg(
          "Prishe is broken. Yuzuki survives: Prishe's 5000 damage is less than her power, and it is removed at the end of the turn.",
        ),
      },
      {
        target: { card: Y.jecht, zone: "field" },
        allow: [{ attack: [Y.jecht] }],
        until: (c) => damageOf(c, "opponent") >= 4,
        hint: msg("Click Jecht, then Attack."),
        text: msg("Now attack with **Jecht**: nobody is left to block him."),
      },
      {
        target: "mainButton",
        allow: ["endAttacks", "endTurn"],
        until: pastTurn(5),
        hint: msg("Click End turn."),
        text: msg("End your turn."),
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: "block",
    title: msg("Blocking"),
    summary: msg("Block the opponent's attacks, or take the damage."),
    scenario: {
      active: "opponent",
      turn: 4,
      you: { deck: MY_DECK, hand: [Y.zack, Y.taivas], field: [Y.porom, Y.charlotte] },
      opponent: { deck: THEIR_DECK, hand: [O.luso], field: [O.moogle, O.shantotto, O.billy] },
      opponentPlays: [
        { turn: 4, do: "attack", with: [O.shantotto] },
        { turn: 4, do: "attack", with: [O.billy] },
      ],
    },
    steps: [
      {
        next: true,
        text: msg(
          "It is your opponent's turn. They attack with **Shantotto** (7000). You can **block** with one of your active Forwards: blocking does not dull it.",
        ),
      },
      {
        target: { card: Y.charlotte, zone: "field" },
        allow: [{ block: Y.charlotte }],
        until: inBreakZone(O.shantotto, "opponent"),
        hint: msg("Click Charlotte, then Block."),
        text: msg("Click **Charlotte**, then **Block**. She deals 8000 damage to Shantotto."),
      },
      {
        next: true,
        target: { card: Y.charlotte, zone: "field" },
        text: msg(
          "Shantotto is broken. Charlotte took 7000 damage, reduced to 6000 by her own ability: less than her 8000 power, she survives.",
        ),
      },
      {
        target: "mainButton",
        allow: [{ block: null }],
        until: (c) => damageOf(c, "you") >= 1,
        hint: msg("Click No block."),
        text: msg(
          "Your opponent attacks again, with **Billy Bob** (8000). Charlotte already holds 6000 damage: blocking would break her. Click **No block** and take 1 damage.",
        ),
      },
      {
        next: true,
        target: "myDamage",
        text: msg(
          "The top card of your deck went to your Damage Zone. Damage on players is never removed: choose well when to block and when to let an attack through.",
        ),
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: "summons",
    title: msg("Summons and the stack"),
    summary: msg("Cast a Summon; your opponent answers; the stack resolves from the top."),
    scenario: {
      active: "you",
      turn: 5,
      you: {
        deck: MY_DECK,
        hand: [Y.ifrit],
        field: [Y.warrior, Y.machinist, Y.porom, Y.geomancer, Y.leonora, Y.wuk],
      },
      opponent: { deck: THEIR_DECK, hand: [O.ramuh], field: [O.redMage, O.moogle, O.noel] },
      opponentPlays: [{ turn: 5, do: "cast", card: O.ramuh, respond: true, modes: [0, 1], targets: [Y.wuk, Y.wuk] }],
    },
    steps: [
      {
        next: true,
        target: { card: Y.ifrit, zone: "hand" },
        text: msg(
          "**Summons** are one-shot cards: their effect happens, then they go to the Break Zone. Unlike Characters, they first go on the **stack**, and either player can answer them.",
        ),
      },
      {
        target: { card: Y.ifrit, zone: "hand" },
        allow: [{ cast: Y.ifrit, target: O.noel }],
        until: (c) => onStack(O.ramuh)(c) || inBreakZone(O.noel, "opponent")(c),
        hint: msg("Click Ifrit in your hand, then choose Noel."),
        text: msg("Cast **Ifrit** (cost 5, Fire) on **Noel**: 9000 damage, enough to break him."),
      },
      {
        next: true,
        target: "stack",
        text: msg(
          "Your opponent answered with **Ramuh**, put on top of Ifrit. The stack resolves from the top: **last in, first out**. Ramuh resolves first, then Ifrit.",
        ),
      },
      {
        target: "mainButton",
        allow: ["pass"],
        until: inBreakZone(O.noel, "opponent"),
        hint: msg("Click Resolve."),
        text: msg("Click **Resolve**."),
      },
      {
        next: true,
        target: { card: Y.wuk, zone: "field" },
        text: msg(
          "Noel is broken. Ramuh dulled Wuk Lamat and dealt her 5000 damage: she survives, but a dull Forward cannot attack this turn.",
        ),
      },
      {
        target: "mainButton",
        allow: ["endTurn", "endAttacks", "pass"],
        until: pastTurn(5),
        hint: msg("Click End turn."),
        text: msg("End your turn."),
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: "abilities",
    title: msg("Abilities"),
    summary: msg("Auto-abilities, action abilities, special abilities and field abilities."),
    scenario: {
      active: "you",
      turn: 5,
      you: {
        deck: MY_DECK,
        // Two more Jechts: one may pay for CP, the other is discarded by Jecht Beam's 《S》.
        hand: [Y.palom, Y.jecht, Y.jecht],
        field: [Y.warrior, Y.machinist, Y.porom, Y.geomancer, { card: Y.jecht, sick: true }],
      },
      opponent: { deck: THEIR_DECK, hand: [O.miner], field: [O.moogle, O.luso, O.princess], damage: [O.geomancer, O.miner] },
      opponentPlays: [],
    },
    steps: [
      {
        next: true,
        text: msg(
          'Cards have **abilities**. **Auto-abilities** trigger by themselves ("When … enters the field"). **Action abilities** are used by paying the cost before the colon. **Special abilities** have a name and 《S》 in their cost. **Field abilities** always apply.',
        ),
      },
      {
        target: { card: Y.palom, zone: "hand" },
        allow: [{ cast: Y.palom }, { choose: [O.luso] }],
        until: inBreakZone(O.luso, "opponent"),
        hint: msg("Click Palom in your hand."),
        text: msg(
          "Play **Palom** (Backup, cost 2). When she enters the field, her **auto-ability** deals 4000 damage to a Forward: choose **Luso** (3000).",
        ),
      },
      {
        target: { card: Y.jecht, zone: "field" },
        allow: [{ activate: Y.jecht, ability: 0 }],
        until: hasKeyword(Y.jecht, "haste"),
        hint: msg("Click Jecht on the field."),
        text: msg(
          "Jecht entered the field this turn: he cannot attack yet. Use his **action ability** 《火》《水》: click Jecht and pay 1 Fire CP and 1 Water CP. He gains **Haste**, **First Strike** and **Brave** until the end of the turn.",
        ),
      },
      {
        target: "mainButton",
        allow: ["pass"],
        until: pendingMine("declareAttack"),
        hint: msg("Click To the attacks."),
        text: msg("Click **To the attacks**."),
      },
      {
        target: { card: Y.jecht, zone: "field" },
        allow: [{ attack: [Y.jecht] }],
        until: (c) => damageOf(c, "opponent") >= 3,
        hint: msg("Click Jecht, then Attack."),
        text: msg("Attack with **Jecht**. Thanks to **Brave**, he does not dull when he attacks."),
      },
      {
        target: "mainButton",
        allow: ["endAttacks", "pass"],
        until: myPhase("main2"),
        hint: msg("Click End attacks."),
        text: msg("Click **End attacks**: you reach Main Phase 2."),
      },
      {
        target: { card: Y.jecht, zone: "field" },
        allow: [{ activate: Y.jecht, ability: 1, target: O.princess }, { choose: [O.princess] }],
        until: inBreakZone(O.princess, "opponent"),
        hint: msg("Click Jecht, choose Jecht Beam, then Undead Princess."),
        text: msg(
          "Now his **special ability**, Jecht Beam: 《S》 means discarding a card **of the same name** (a Jecht from your hand), and 《ダル》 dulling Jecht himself, still active thanks to Brave. Click Jecht, choose **Jecht Beam**, and target **Undead Princess**: 8000 damage.",
        ),
      },
      {
        next: true,
        target: "oppForwards",
        text: msg(
          "Last kind: **field abilities**, always on. Your opponent's Class Tenth Moogle, a Backup, can make Lightning CP as well as Earth CP. Read the cards: everything they can do is written on them.",
        ),
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: "exburst",
    title: msg("EX Burst and keywords"),
    summary: msg("A card of your Damage Zone strikes back; Haste, Brave, First Strike."),
    scenario: {
      active: "opponent",
      turn: 6,
      you: { deck: [Y.ward, ...MY_DECK], hand: [Y.zack], field: [Y.porom], damage: [Y.machinist, Y.geomancer] },
      opponent: { deck: THEIR_DECK, hand: [O.luso], field: [O.moogle, O.billy, O.shantotto] },
      opponentPlays: [{ turn: 6, do: "attack", with: [O.billy] }],
    },
    steps: [
      {
        next: true,
        target: "oppForwards",
        text: msg("Your opponent attacks with **Billy Bob**, and you have no Forward to block with: you will take 1 damage."),
      },
      {
        target: "myDamage",
        allow: [{ choose: [O.shantotto] }],
        until: inBreakZone(O.shantotto, "opponent"),
        hint: msg("Click Yes, then choose Shantotto."),
        text: msg(
          "The card that went to your Damage Zone is **Ward**, with the **EX BURST** mark: you may use its EX BURST ability at once, for free. Click **Yes**, then choose **Shantotto**: 7000 damage.",
        ),
      },
      {
        next: true,
        text: msg("Shantotto is broken. Each damage you take may strike back: an attack is never without risk."),
      },
      {
        next: true,
        text: msg(
          "Some **keywords** you will meet: **Haste**: can attack the turn it enters. **Brave**: does not dull when attacking. **First Strike**: deals its battle damage first.",
        ),
      },
      {
        next: true,
        text: msg(
          "**Damage 3**: an ability that only works once you have taken at least 3 damage, like Alphinaud's. Some cards also cost less when you have much damage.",
        ),
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: "limit",
    title: msg("Limit Break and parties"),
    summary: msg("Play a card from the LB deck; attack with a party."),
    scenario: {
      active: "you",
      turn: 6,
      you: {
        deck: MY_DECK,
        hand: [Y.geomancer],
        field: [Y.warrior, Y.machinist, Y.porom, Y.taivas, Y.ward],
        lb: [Y.zackLb, Y.leo, Y.vincent, Y.ultima],
      },
      opponent: { deck: THEIR_DECK, hand: [O.luso], field: [O.moogle, O.hugh], damage: [O.geomancer, O.miner, O.luso, O.prishe] },
      opponentPlays: [{ turn: 6, do: "block", blocker: O.hugh }],
    },
    steps: [
      {
        next: true,
        target: "myLb",
        text: msg(
          "Your **LB deck** holds Limit Break cards, face down. To play one, pay its CP cost **and** turn face up as many of your other face-down LB cards as its Limit Break number.",
        ),
      },
      {
        target: "myLb",
        allow: [{ cast: Y.zackLb }, { choose: [O.hugh] }],
        until: onField(Y.zackLb),
        hint: msg("Click your LB deck, then Zack."),
        text: msg(
          "Click your LB deck and play **Zack** (Limit Break 1, cost 3): pay the CP and turn 1 other LB card face up. When he enters the field, he deals 3000 damage to a Forward: choose **Hugh Yurg**.",
        ),
      },
      {
        next: true,
        text: msg(
          "A **party**: two Forwards or more that share an element can attack together. If nobody blocks, the party deals only 1 damage. If it is blocked, the blocker takes the **total power** of the party.",
        ),
      },
      {
        target: "mainButton",
        allow: ["pass"],
        until: pendingMine("declareAttack"),
        hint: msg("Click To the attacks."),
        text: msg("Click **To the attacks**."),
      },
      {
        target: { card: Y.taivas, zone: "field" },
        allow: [{ attack: [Y.taivas, Y.ward] }, { choose: [] }],
        until: inBreakZone(O.hugh, "opponent"),
        hint: msg("Click Taivas and Ward, then Attack with the party."),
        text: msg(
          "Click **Taivas** and **Ward** (both Fire), then **Attack with the party**. Your opponent blocks with Hugh Yurg: he takes 17000 damage. You split his 8000 damage between your two Forwards.",
        ),
      },
      {
        next: true,
        text: msg(
          "Hugh Yurg is broken. The blocker's damage is split among the party's members by steps of 1000: you chose who took it.",
        ),
      },
      {
        target: "mainButton",
        allow: ["endAttacks", "endTurn", "pass"],
        until: pastTurn(6),
        hint: msg("Click End turn."),
        text: msg("End your turn."),
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: "game",
    title: msg("A real game"),
    summary: msg("The two Starter Set decks, against the beginner AI."),
    scenario: {
      active: "you",
      turn: 1,
      you: { deck: gameDeck.slice(5), hand: gameDeck.slice(0, 5), lb: lbOf(vol1?.lb) },
      opponent: { deck: aiDeck.slice(5), hand: aiDeck.slice(0, 5), lb: lbOf(vol2?.lb) },
      opponentPlays: "beginner",
    },
    steps: [
      {
        next: true,
        text: msg(
          "Now a real game, against the beginner AI: you have the Fire/Water Starter Set, your opponent the Earth/Lightning one. The guide gives you tips along the way.",
        ),
      },
      {
        free: true,
        until: gameOver,
        text: msg("Play the game: deal 7 damage to your opponent. You can hide the guide."),
        tips: [
          {
            when: all(myPhase("main1"), (c) => c.view.field.filter((o) => o.controller === c.view.viewer).length < 3),
            text: msg("Early on, play Backups: they make the CP for your bigger cards."),
          },
          {
            when: pendingMine("declareAttack"),
            text: msg("Attack when the opponent cannot block well: a blocked Forward weaker than the blocker is broken."),
          },
          {
            when: pendingMine("declareBlock"),
            text: msg("Block when your Forward survives or trades well, or when you are close to 7 damage."),
          },
          {
            when: (c) => damageOf(c, "you") >= 5,
            text: msg("You have 5 damage or more: from now on, block whatever you can."),
          },
        ],
      },
    ],
  },
];

export function lessonById(id: string | null): Lesson | undefined {
  return id ? LESSONS.find((l) => l.id === id) : undefined;
}
