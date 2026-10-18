/**
 * Test helpers (Planecircle's model): test cards, staged games (`scenario`), decisions, and turning a `legalActions`
 * option into a decision with its suggested payment and first targets.
 */

import { submit } from "../src/game";
import { createScenario, type ScenarioCard } from "../src/scenario";
import type {
  ActionOption,
  CardDef,
  CardType,
  ChooseOption,
  Decision,
  Element,
  GameState,
  ObjectId,
  PlayerId,
  Zone,
} from "../src/types";

/** A test card (no script unless given). */
export function testCard(
  id: string,
  type: CardType,
  element: Element | Element[],
  cost: number,
  extra: Partial<CardDef> = {},
): CardDef {
  return {
    id,
    codes: [id],
    name: extra.name ?? id,
    type,
    elements: Array.isArray(element) ? element : [element],
    cost,
    ...(type === "Forward" ? { power: 5000 } : {}),
    jobs: [],
    categories: [],
    generic: false,
    exBurst: false,
    rarity: "C",
    set: 0,
    keywords: [],
    abilities: [],
    text: "",
    implemented: true,
    ...extra,
  };
}

export const forward = (id: string, element: Element | Element[], cost: number, power: number, extra: Partial<CardDef> = {}) =>
  testCard(id, "Forward", element, cost, { power, ...extra });
export const backup = (id: string, element: Element | Element[], cost: number, extra: Partial<CardDef> = {}) =>
  testCard(id, "Backup", element, cost, extra);
export const summon = (id: string, element: Element | Element[], cost: number, extra: Partial<CardDef> = {}) =>
  testCard(id, "Summon", element, cost, extra);

/** Filler deck cards (vanilla Fire Forwards). */
export const filler = (n: number, id = "filler") =>
  Array.from({ length: n }, () => forward(id, "fire", 9, 1000, { generic: true }));

export interface Side {
  deck?: CardDef[];
  hand?: CardDef[];
  field?: (CardDef | ScenarioCard)[];
  breakZone?: CardDef[];
  damage?: CardDef[];
  lb?: CardDef[];
}

/** A staged game: p1's turn 2, Main Phase 1 by default; decks of 20 filler cards. */
export function scenario(opts: {
  p1?: Side;
  p2?: Side;
  active?: PlayerId;
  turn?: number;
  phase?: GameState["turn"]["phase"];
}): GameState {
  const side = (id: PlayerId, x: Side = {}) => ({
    id,
    name: id,
    deck: x.deck ?? filler(20),
    hand: x.hand ?? [],
    field: (x.field ?? []).map((c) => ("def" in c ? c : { def: c })),
    breakZone: x.breakZone ?? [],
    damage: x.damage ?? [],
    lb: (x.lb ?? []).map((def) => ({ def })),
  });
  return createScenario({
    seed: 42,
    players: [side("p1", opts.p1), side("p2", opts.p2)],
    active: opts.active ?? "p1",
    ...(opts.turn !== undefined ? { turn: opts.turn } : {}),
    ...(opts.phase ? { phase: opts.phase } : {}),
  }).state;
}

export function act(s: GameState, player: PlayerId, d: Decision): GameState {
  return submit(s, player, d).state;
}

/** The ids of the cards with this definition in a zone of a player (the field: controlled by them). */
export function idsOf(s: GameState, player: PlayerId, zone: Zone, defId: string): ObjectId[] {
  const pl = s.players[player];
  const ids =
    zone === "field"
      ? s.field.filter((id) => s.objects[id]?.controller === player)
      : zone === "hand"
        ? (pl?.hand ?? [])
        : zone === "break"
          ? (pl?.breakZone ?? [])
          : zone === "damage"
            ? (pl?.damage ?? [])
            : zone === "deck"
              ? (pl?.deck ?? [])
              : zone === "lb"
                ? (pl?.lb ?? [])
                : (pl?.removed ?? []);
  return ids.filter((id) => s.objects[id]?.defId === defId);
}

export function idOf(s: GameState, player: PlayerId, zone: Zone, defId: string): ObjectId {
  const id = idsOf(s, player, zone, defId)[0];
  if (!id) throw new Error(`no ${defId} in ${player}'s ${zone}`);
  return id;
}

/** The pending decision's player passes, then the other, until the stack is empty (answering questions as suggested). */
export function settle(s: GameState, limit = 50): GameState {
  for (let i = 0; i < limit && s.pending && !s.over; i++) {
    const p = s.pending;
    if (p.kind === "choice") s = act(s, p.player, { type: "choose", values: p.request.suggested });
    else if (p.kind === "priority" && s.stack.length) s = act(s, p.player, { type: "pass" });
    else break;
  }
  return s;
}

/** Both players pass with an empty stack: the phase or step ends (questions answered as suggested on the way). */
export function passPhase(s: GameState): GameState {
  const phase = s.turn.phase;
  const step = s.turn.step;
  for (let i = 0; i < 20 && s.pending && !s.over && s.turn.phase === phase && s.turn.step === step; i++) {
    const p = s.pending;
    if (p.kind === "choice") s = act(s, p.player, { type: "choose", values: p.request.suggested });
    else if (p.kind === "priority") s = act(s, p.player, { type: "pass" });
    else break;
  }
  return s;
}

/** Advances (passing, answering as suggested, not attacking, not blocking) until `until` holds. */
export function advanceUntil(s: GameState, until: (s: GameState) => boolean, limit = 500): GameState {
  for (let i = 0; i < limit && !until(s) && s.pending && !s.over; i++) {
    const p = s.pending;
    if (p.kind === "choice") s = act(s, p.player, { type: "choose", values: p.request.suggested });
    else if (p.kind === "priority") s = act(s, p.player, { type: "pass" });
    else if (p.kind === "declareAttack") s = act(s, p.player, { type: "endAttacks" });
    else if (p.kind === "declareBlock") s = act(s, p.player, { type: "block", blocker: null });
    else if (p.kind === "discard")
      s = act(s, p.player, { type: "discard", cards: s.players[p.player]?.hand.slice(0, p.count) ?? [] });
    else if (p.kind === "mulligan") s = act(s, p.player, { type: "keep" });
  }
  return s;
}

const firstTargets = (choose: ChooseOption[]) =>
  Object.fromEntries(choose.map((c) => [c.key, c.upTo ? [] : c.options.slice(0, Math.min(c.count, c.options.length))]));

/** The decision of an option, with its suggested payment and its first targets (the strict fuzz's default choices). */
export function decisionOf(o: ActionOption, pick = 0): Decision {
  switch (o.type) {
    case "pass":
      return { type: "pass" };
    case "endAttacks":
      return { type: "endAttacks" };
    case "attack": {
      const all = [...o.single.map((id) => [id]), ...o.parties.map((p) => p.members)];
      return { type: "attack", forwards: all[pick % all.length] ?? [] };
    }
    case "block":
      return { type: "block", blocker: o.blockers[pick % (o.blockers.length + 1)] ?? null };
    case "cast":
    case "activate": {
      const modes = o.modal ? o.modal.available.slice(0, o.modal.upTo ? 1 : o.modal.pick) : undefined;
      const targets = o.modal ? firstTargets((modes ?? []).flatMap((m) => o.modal?.choose[m] ?? [])) : firstTargets(o.choose);
      const common = { payment: o.suggested, targets, ...(modes ? { modes } : {}) };
      if (o.type === "cast")
        return { type: "cast", card: o.card, ...common, ...(o.lb ? { lbFlip: o.lb.options.slice(0, o.lb.count) } : {}) };
      return {
        type: "activate",
        source: o.source,
        ability: o.ability,
        ...common,
        ...(o.special ? { special: o.special.options[0] } : {}),
      };
    }
  }
}

/** A seeded generator for the tests (mulberry32), apart from the game's own randomness. */
export function rng(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One random decision for the pending decision (its suggested answer for a question). */
export function randomDecision(s: GameState, options: ActionOption[], random: () => number): Decision {
  const p = s.pending;
  if (!p) throw new Error("no decision pending");
  switch (p.kind) {
    case "mulligan":
      return { type: random() < 0.2 ? "mulligan" : "keep" };
    case "discard":
      return { type: "discard", cards: s.players[p.player]?.hand.slice(0, p.count) ?? [] };
    case "choice":
      return { type: "choose", values: p.request.suggested };
    default: {
      const o = options[Math.floor(random() * options.length)] as ActionOption;
      return decisionOf(o, Math.floor(random() * 10));
    }
  }
}
