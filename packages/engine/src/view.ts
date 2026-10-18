/**
 * A player's view (from Planecircle): everything public, their own hand and face-down LB cards, the options of their
 * decision. Hidden information (the opponent's hand and face-down LB cards, the decks' order) never leaves the engine.
 */
import { attackCandidates, blockCandidates, partyGroups } from "./attack";
import { chars } from "./chars";
import { legalActions } from "./legal";
import { itemAbility } from "./stack";
import { opponentOf } from "./state";
import { autoAbilityOf } from "./triggers";
import type {
  ActionOption,
  AttackStep,
  CardDef,
  CardType,
  ChoicePurpose,
  ChoiceRequest,
  Element,
  Flag,
  GameEvent,
  GameState,
  Keyword,
  ObjectId,
  Phase,
  PlayerId,
  Zone,
} from "./types";

/** A card the viewer does not see (the back of the card). */
export const HIDDEN_CARD_ID = "hidden-card";

/** Printed information of a card, in both languages, for the interface. */
export interface CardFace {
  defId: string;
  name: string;
  type: CardType;
  elements: Element[];
  cost: number;
  power?: number;
  jobs: string[];
  categories: string[];
  generic: boolean;
  exBurst: boolean;
  lb?: number;
  rarity: string;
  text: string;
  fr?: CardDef["fr"];
  image?: CardDef["image"];
  implemented: boolean;
}

export interface ObjectView {
  id: ObjectId;
  uid: string;
  defId: string;
  owner: PlayerId;
  controller: PlayerId;
  zone: Zone;
  dull: boolean;
  damage: number;
  frozen: boolean;
  faceDown: boolean;
  /** Current power (CR 4.3: shown as is, may be negative), on the field. */
  power?: number;
  keywords: Keyword[];
  flags: Flag[];
  elements: Element[];
  attacking: boolean;
  blocking: boolean;
  /** Not controlled since the start of the turn (CR 10.1.2.1.1): cannot attack or use a 《ダル》 ability without Haste. */
  sick: boolean;
  counters: Record<string, number>;
}

export interface StackItemView {
  id: string;
  kind: "summon" | "action" | "special" | "auto";
  controller: PlayerId;
  sourceId: ObjectId;
  defId: string;
  targets: ObjectId[];
  /** The ability's label (abilities only). */
  label?: string;
}

export interface PlayerView {
  id: PlayerId;
  name: string;
  deckCount: number;
  handCount: number;
  breakZone: ObjectView[];
  damage: ObjectView[];
  removed: ObjectView[];
  /** The LB deck: face-up cards, and face-down ones (hidden from the opponent, CR 7.14.2). */
  lb: ObjectView[];
  crystals: number;
  lost: boolean;
  mulliganed: boolean;
}

export type PendingView =
  | { kind: "mulligan"; player: PlayerId; mulliganed: boolean }
  | { kind: "priority"; player: PlayerId; actions?: ActionOption[] }
  | { kind: "declareAttack"; player: PlayerId; single?: ObjectId[]; parties?: { element: Element; members: ObjectId[] }[] }
  | { kind: "declareBlock"; player: PlayerId; blockers?: ObjectId[] }
  | { kind: "discard"; player: PlayerId; count: number }
  | {
      kind: "choice";
      player: PlayerId;
      /** Present only for the choosing player. */
      request?: ChoiceRequest;
      purpose?: ChoicePurpose;
      /** Cards the request mentions, hidden ones included for the chooser ("look at the top 3 cards"). */
      objects?: ObjectView[];
      /** The ability whose targets or modes are being chosen (not yet on the stack). */
      source?: { defId: string; label?: string };
    };

export interface GameView {
  viewer: PlayerId;
  opponent: PlayerId;
  turn: { number: number; active: PlayerId; phase: Phase; step: AttackStep | null; startingPlayer: PlayerId };
  players: Record<PlayerId, PlayerView>;
  hand: ObjectView[];
  field: ObjectView[];
  stack: StackItemView[];
  attack: { attackers: ObjectId[]; blocker: ObjectId | null; blocked: boolean; partyElement?: Element } | null;
  pending: PendingView | null;
  /** Forwards of the viewer that could attack this turn (for the interface). */
  potentialAttackers: number;
  over: boolean;
  winner: PlayerId | "draw" | null;
}

export function cardFace(d: CardDef): CardFace {
  return {
    defId: d.id,
    name: d.name,
    type: d.type,
    elements: d.elements,
    cost: d.cost,
    ...(d.power !== undefined ? { power: d.power } : {}),
    jobs: d.jobs,
    categories: d.categories,
    generic: d.generic,
    exBurst: d.exBurst,
    ...(d.lb ? { lb: d.lb } : {}),
    rarity: d.rarity,
    text: d.text,
    ...(d.fr ? { fr: d.fr } : {}),
    ...(d.image ? { image: d.image } : {}),
    implemented: d.implemented,
  };
}

/** Whether `viewer` may see this card (CR 7.6, 7.14.2). */
function seen(s: GameState, id: ObjectId, viewer: PlayerId): boolean {
  const o = s.objects[id];
  if (!o) return false;
  if (o.zone === "deck") return false;
  if (o.zone === "hand" || (o.zone === "lb" && o.faceDown) || (o.zone === "removed" && o.faceDown)) return o.owner === viewer;
  return true;
}

export function objectView(s: GameState, id: ObjectId, viewer: PlayerId): ObjectView {
  const o = s.objects[id];
  if (!o) throw new Error(`unknown object ${id}`);
  const visible = seen(s, id, viewer);
  const onField = o.zone === "field";
  const c = visible ? chars(s, id) : null;
  return {
    id,
    uid: o.uid,
    defId: visible ? o.defId : HIDDEN_CARD_ID,
    owner: o.owner,
    controller: o.controller,
    zone: o.zone,
    dull: o.dull,
    damage: o.damage,
    frozen: !!o.frozen,
    faceDown: !!o.faceDown,
    ...(onField && c?.type === "Forward" ? { power: c.power } : {}),
    keywords: onField ? (c?.keywords ?? []) : [],
    flags: onField ? (c?.flags ?? []) : [],
    elements: c?.elements ?? [],
    attacking: !!s.attack?.attackers.includes(id),
    blocking: s.attack?.blocker === id,
    sick: onField && o.controlledSince >= s.turn.number,
    counters: o.counters ?? {},
  };
}

function stackView(s: GameState): StackItemView[] {
  return s.stack.map((item) => {
    const ab = item.kind === "summon" ? undefined : itemAbility(s, item).ab;
    const label =
      item.kind === "auto"
        ? autoAbilityOf(s, item).label
        : item.kind !== "summon"
          ? (s.defs[item.sourceDefId]?.abilities[item.ability ?? -1]?.label ?? ab?.label)
          : undefined;
    return {
      id: item.id,
      kind: item.kind,
      controller: item.controller,
      sourceId: item.sourceId,
      defId: item.sourceDefId,
      targets: Object.values(item.targets).flat(),
      ...(label ? { label } : {}),
    };
  });
}

function pendingView(s: GameState, viewer: PlayerId): PendingView | null {
  const p = s.pending;
  if (!p) return null;
  const mine = p.player === viewer;
  switch (p.kind) {
    case "mulligan":
      return { kind: "mulligan", player: p.player, mulliganed: !!s.players[p.player]?.mulliganed };
    case "priority":
      return { kind: "priority", player: p.player, ...(mine ? { actions: legalActions(s, viewer) } : {}) };
    case "declareAttack":
      return {
        kind: "declareAttack",
        player: p.player,
        ...(mine ? { single: attackCandidates(s, viewer), parties: partyGroups(s, viewer) } : {}),
      };
    case "declareBlock":
      return { kind: "declareBlock", player: p.player, ...(mine ? { blockers: blockCandidates(s, viewer) } : {}) };
    case "discard":
      return { kind: "discard", player: p.player, count: p.count };
    case "choice": {
      if (!mine) return { kind: "choice", player: p.player };
      const ids =
        p.request.type === "pick"
          ? p.request.options
          : p.request.type === "order"
            ? p.request.items
            : p.request.type === "divide"
              ? p.request.among
              : [];
      // The chooser sees the cards of their question, hidden ones included (the top of their deck they look at).
      const objects = ids
        .filter((id) => s.objects[id])
        .map((id) => ({ ...objectView(s, id, viewer), defId: s.objects[id]?.defId as string }));
      const trigger =
        p.purpose.kind === "triggerTargets" || p.purpose.kind === "triggerModes"
          ? s.triggers.find((t) => t.id === (p.purpose as { trigger: string }).trigger)
          : undefined;
      return {
        kind: "choice",
        player: p.player,
        request: p.request,
        purpose: p.purpose,
        ...(objects.length ? { objects } : {}),
        ...(trigger ? { source: { defId: trigger.sourceDefId, label: autoAbilityOf(s, trigger).label } } : {}),
      };
    }
  }
}

export function projectView(s: GameState, viewer: PlayerId): GameView {
  const opponent = opponentOf(s, viewer);
  const players: Record<PlayerId, PlayerView> = {};
  for (const p of s.playerOrder) {
    const pl = s.players[p];
    if (!pl) continue;
    const views = (ids: ObjectId[]) => ids.map((id) => objectView(s, id, viewer));
    players[p] = {
      id: p,
      name: pl.name,
      deckCount: pl.deck.length,
      handCount: pl.hand.length,
      breakZone: views(pl.breakZone),
      damage: views(pl.damage),
      removed: views(pl.removed),
      lb: views(pl.lb),
      crystals: pl.crystals,
      lost: pl.lost,
      mulliganed: pl.mulliganed,
    };
  }
  return {
    viewer,
    opponent,
    turn: {
      number: s.turn.number,
      active: s.turn.active,
      phase: s.turn.phase,
      step: s.turn.step,
      startingPlayer: s.turn.startingPlayer,
    },
    players,
    hand: (s.players[viewer]?.hand ?? []).map((id) => objectView(s, id, viewer)),
    field: s.field.map((id) => objectView(s, id, viewer)),
    stack: stackView(s),
    attack: s.attack
      ? {
          attackers: s.attack.attackers,
          blocker: s.attack.blocker,
          blocked: !!s.attack.blocked,
          ...(s.attack.partyElement ? { partyElement: s.attack.partyElement } : {}),
        }
      : null,
    pending: pendingView(s, viewer),
    potentialAttackers: attackCandidatesNextAttack(s, viewer),
    over: s.over,
    winner: s.winner,
  };
}

/** The viewer's Forwards that could attack in their Attack Phase (for the interface's "attack" hint). */
function attackCandidatesNextAttack(s: GameState, viewer: PlayerId): number {
  return s.turn.active === viewer ? attackCandidates(s, viewer).length : 0;
}

/** Events the viewer may see (CR 7.6): the cards drawn by the opponent, their hidden moves, private looks are removed. */
export function filterEvents(events: GameEvent[], viewer: PlayerId): GameEvent[] {
  const out: GameEvent[] = [];
  for (const e of events) {
    if (e.type === "draw" && e.player !== viewer) {
      const { cards: _cards, ...rest } = e;
      out.push(rest);
    } else if (e.type === "moved" && e.hidden && e.owner !== viewer) out.push({ ...e, defId: HIDDEN_CARD_ID });
    else if (e.type === "reveal" && e.to && e.to !== viewer) continue;
    else out.push(e);
  }
  return out;
}

/** Card ids cited by a value: `defId` fields and `⟦defId⟧` references in texts. */
function collectDefIds(value: unknown, out: Set<string>): void {
  if (typeof value === "string") {
    for (const m of value.matchAll(/⟦([^⟧]+)⟧/g)) out.add(m[1] as string);
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) collectDefIds(v, out);
    return;
  }
  if (value && typeof value === "object")
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === "defId" && typeof v === "string") out.add(v);
      else collectDefIds(v, out);
    }
}

/** The faces of the cards a view and its events cite (never the rest of the opponent's deck list). */
export function visibleFaces(s: GameState, view: GameView, events: GameEvent[]): Record<string, CardFace> {
  const ids = new Set<string>();
  collectDefIds(view, ids);
  collectDefIds(events, ids);
  const out: Record<string, CardFace> = {};
  for (const id of ids) {
    const d = s.defs[id];
    if (d) out[id] = cardFace(d);
  }
  return out;
}
