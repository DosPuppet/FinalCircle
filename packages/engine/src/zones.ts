/**
 * Zones (CR 7): creating objects, moving them (a card that changes zone is a new object, CR 7.4), drawing.
 */
import { chars } from "./chars";
import { emit } from "./events";
import { bump, newId, nextTimestamp, obj } from "./state";
import { rulesEvent } from "./triggers";
import type { GameObject, GameState, LkiSnapshot, ObjectId, PlayerId, PlayerState, Zone } from "./types";

const PLAYER_ZONE: Partial<Record<Zone, keyof PlayerState>> = {
  deck: "deck",
  hand: "hand",
  break: "breakZone",
  damage: "damage",
  removed: "removed",
  lb: "lb",
};

/** The array of a zone (a Summon on the stack is in none: the stack holds `StackItem`s). */
export function zoneArray(s: GameState, zone: Zone, owner: PlayerId): ObjectId[] | null {
  if (zone === "field") return s.field;
  const key = PLAYER_ZONE[zone];
  if (!key) return null;
  return (s.players[owner]?.[key] as ObjectId[] | undefined) ?? null;
}

/** Hidden zones (CR 7.6.1). */
export const isHiddenZone = (z: Zone) => z === "deck" || z === "hand";

export function createObject(
  s: GameState,
  defId: string,
  owner: PlayerId,
  zone: Zone,
  opts: { uid?: string; controller?: PlayerId; dull?: boolean; faceDown?: boolean; position?: "top" | "bottom" } = {},
): GameObject {
  const id = newId(s);
  bump(s);
  const o: GameObject = {
    id,
    uid: opts.uid ?? `c${id}`,
    defId,
    owner,
    controller: opts.controller ?? owner,
    zone,
    dull: !!opts.dull,
    damage: 0,
    controlledSince: s.turn.number,
    timestamp: nextTimestamp(s),
  };
  if (opts.faceDown) o.faceDown = true;
  s.objects[id] = o;
  const arr = zoneArray(s, zone, owner);
  if (arr) {
    if (zone === "deck" && opts.position === "top") arr.unshift(id);
    else arr.push(id);
  }
  return o;
}

/** Characteristics of a card as it is now (CR 6.4.2: kept when it leaves its zone). */
export function snapshot(s: GameState, id: ObjectId): LkiSnapshot {
  const o = obj(s, id);
  const c = chars(s, id);
  return {
    id,
    defId: o.defId,
    name: c.name,
    type: c.type,
    elements: c.elements,
    cost: c.cost,
    power: c.power,
    jobs: c.jobs,
    categories: c.categories,
    owner: o.owner,
    controller: o.controller,
    zone: o.zone,
    dull: o.dull,
    keywords: c.keywords,
  };
}

export interface MoveOptions {
  /** Controller on the field (the owner by default, CR 6.2.4). */
  controller?: PlayerId;
  /** Deck: top (default) or bottom. */
  position?: "top" | "bottom";
  /** Enters the field dull (Backups, CR 5.2.3.1.1.3). */
  dull?: boolean;
  faceDown?: boolean;
  /** Broken (CR 15.1.1.3), not merely put into the Break Zone (15.1.1.3.2). */
  broken?: boolean;
  /** Who broke it (the damage source, CR 12.4.5). */
  breaker?: ObjectId;
}

/**
 * Moves a card to another zone; it becomes a new object (CR 7.4) and returns its new id. A card always goes to its
 * owner's zones (7.3). A Limit Break card that goes to the hand, the Break Zone, the main deck or removed from play
 * goes there, then at once to its LB deck face up (15.2.8.4.1): the id returned is then the one in the LB deck.
 */
export function moveObject(s: GameState, id: ObjectId, to: Zone, opts: MoveOptions = {}): ObjectId {
  const o = obj(s, id);
  const from = o.zone;
  const lki = from === "field" ? snapshot(s, id) : null;
  if (lki) s.lki[id] = lki;
  const fromArr = zoneArray(s, from, o.owner);
  if (fromArr) {
    const i = fromArr.indexOf(id);
    if (i >= 0) fromArr.splice(i, 1);
  }
  // A Forward that leaves the field leaves the battle (CR 10.1.3.2.1) and its party (15.1.1.9.5).
  if (from === "field" && s.attack) {
    s.attack.attackers = s.attack.attackers.filter((a) => a !== id);
    if (s.attack.blocker === id) s.attack.blocker = null;
  }
  delete s.objects[id];
  const toField = to === "field";
  const moved = createObject(s, o.defId, o.owner, to, {
    uid: o.uid,
    controller: toField || to === "stack" ? (opts.controller ?? o.owner) : o.owner,
    dull: toField && !!opts.dull,
    faceDown: !!opts.faceDown,
    position: opts.position === "bottom" ? "bottom" : "top",
  });
  if (from === "field" && to === "break")
    s.turnLog.push({ e: "toBreakFromField", id: moved.id, owner: o.owner, defId: o.defId, type: lki?.type ?? "Forward" });
  const hidden = (isHiddenZone(from) && isHiddenZone(to)) || (to === "lb" && !!opts.faceDown);
  emit({
    type: "moved",
    id,
    newId: moved.id,
    defId: o.defId,
    owner: o.owner,
    from,
    to,
    ...(opts.broken ? { broken: true } : {}),
    ...(hidden ? { hidden: true } : {}),
  });
  rulesEvent(s, { e: "zone", oldId: id, newId: moved.id, from, to, lki, broken: !!opts.broken, breaker: opts.breaker });
  const def = s.defs[o.defId];
  if (def?.lb && (to === "hand" || to === "break" || to === "deck" || to === "removed")) {
    // CR 15.2.8.4.1, 15.2.8.4.5: back to the LB deck face up, without the stack or replacements.
    const back = moveObject(s, moved.id, "lb", { faceDown: false });
    return back;
  }
  return moved.id;
}

/** Draws `n` cards (CR 9.2.1.1); a draw from an empty main deck loses at the next rule processes (12.4.2). */
export function drawCards(s: GameState, player: PlayerId, n: number): ObjectId[] {
  const pl = s.players[player];
  if (!pl) return [];
  const drawn: ObjectId[] = [];
  for (let i = 0; i < n; i++) {
    const top = pl.deck[0];
    if (!top) {
      pl.drewFromEmpty = true;
      break;
    }
    drawn.push(moveObject(s, top, "hand"));
  }
  if (drawn.length) emit({ type: "draw", player, count: drawn.length, cards: drawn });
  return drawn;
}

/** The cards a player controls on the field. */
export function fieldOf(s: GameState, player: PlayerId): ObjectId[] {
  return s.field.filter((id) => s.objects[id]?.controller === player);
}
