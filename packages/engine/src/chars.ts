/**
 * Characteristics of a card as the game sees them (CR 11.12.4): printed information, then the ongoing effects of
 * resolved Summons and abilities, then the field abilities, applied in the order of 11.12.4.6 (control, text,
 * type and job, other information, power). This replaces Planecircle's MTG layers.
 *
 * Cached per state version (`bump`): anything that may change characteristics advances `s.version`.
 */
import { cardMatches } from "./filters";
import { onClone } from "./state";
import type {
  CardType,
  DamageReplacement,
  Element,
  FieldAbility,
  Flag,
  GameState,
  Keyword,
  ObjectId,
  PlayerId,
  SourceFilter,
} from "./types";

export interface Chars {
  name: string;
  /** All its names (a Primed Character has two, CR 15.2.9.4.1). */
  names: string[];
  type: CardType;
  elements: Element[];
  cost: number;
  /** Power after every change (may be negative: read it with `effectivePower`, CR 4.3). */
  power: number;
  jobs: string[];
  categories: string[];
  generic: boolean;
  keywords: Keyword[];
  flags: Flag[];
  /** Elements its controller can produce by dulling it (CR 11.2.2.2), besides its own. */
  cpAs: Element[];
  /** "cannot be chosen by…" (CR 11.3.3). */
  cantBeChosenBy: SourceFilter[];
  /** Replacements of the damage dealt to it ("reduce the damage by 1000 instead"), with their source. */
  damageMods: { mod: DamageReplacement; source: ObjectId; controller: PlayerId }[];
  /** Replacements of the damage it deals (`dealtBy`). */
  dealtMods: { mod: DamageReplacement; source: ObjectId; controller: PlayerId }[];
}

interface Cache {
  version: number;
  map: Map<ObjectId, Chars>;
}
const cache = new WeakMap<GameState, Cache>();
onClone((from, to) => {
  const c = cache.get(from);
  if (c && c.version === from.version) cache.set(to, c);
});

/** Printed characteristics and the ongoing effects of resolved Summons and abilities (no field abilities). */
export function baseChars(s: GameState, id: ObjectId): Chars {
  const o = s.objects[id];
  const d = o ? s.defs[o.defId] : undefined;
  if (!o || !d) throw new Error(`unknown object ${id}`);
  const c: Chars = {
    name: d.name,
    names: [d.name],
    type: d.type,
    elements: [...d.elements],
    cost: d.cost,
    power: d.power ?? 0,
    jobs: [...d.jobs],
    categories: [...d.categories],
    generic: d.generic,
    keywords: [...d.keywords],
    flags: [],
    cpAs: [],
    cantBeChosenBy: [],
    damageMods: [],
    dealtMods: [],
  };
  if (o.zone !== "field") return c;
  // CR 11.12.4.6: other information first (keywords, flags), power last.
  let add = 0;
  for (const e of s.effects) {
    if (!e.affected.includes(id)) continue;
    for (const k of e.keywords ?? []) if (!c.keywords.includes(k)) c.keywords.push(k);
    for (const f of e.flags ?? []) if (!c.flags.includes(f)) c.flags.push(f);
    if (e.cantBeChosenBy) c.cantBeChosenBy.push(e.cantBeChosenBy);
    if (e.damage)
      (e.damage.dealtBy ? c.dealtMods : c.damageMods).push({ mod: e.damage, source: e.sourceId, controller: e.controller });
    add += e.power ?? 0;
  }
  c.power += add;
  return c;
}

/**
 * Field abilities of the cards on the field (CR 11.9), and those that work from another zone of their card. Their
 * conditions and the cards they affect are read on the characteristics without field abilities (`baseChars`): a field
 * ability whose condition depends on another field ability is not handled (docs/approximations.md).
 */
function fieldAbilities(s: GameState): { source: ObjectId; controller: PlayerId; ab: FieldAbility }[] {
  const out: { source: ObjectId; controller: PlayerId; ab: FieldAbility }[] = [];
  for (const id of s.field) {
    const o = s.objects[id];
    const d = o ? s.defs[o.defId] : undefined;
    if (!o || !d) continue;
    for (const ab of d.abilities)
      if (ab.kind === "field" && (ab.zone ?? "field") === "field") out.push({ source: id, controller: o.controller, ab });
  }
  return out;
}

/** Condition of a field ability, read without field abilities. Set by the effect interpreter (no import cycle). */
let fieldCondition: (s: GameState, source: ObjectId, controller: PlayerId, ab: FieldAbility) => boolean = (_s, _x, _c, ab) =>
  !ab.condition;
export function setFieldCondition(fn: typeof fieldCondition): void {
  fieldCondition = fn;
}

function compute(s: GameState): Map<ObjectId, Chars> {
  const map = new Map<ObjectId, Chars>();
  const active = fieldAbilities(s).filter((f) => fieldCondition(s, f.source, f.controller, f.ab));
  const zoneOf = (id: ObjectId) => s.objects[id]?.zone;
  const ids = [...s.field, ...s.playerOrder.flatMap((p) => s.players[p]?.breakZone ?? [])];
  for (const id of ids) {
    const c = baseChars(s, id);
    let add = 0;
    for (const f of active) {
      const zone = f.ab.affectsZone ?? "field";
      if (zoneOf(id) !== zone) continue;
      const hit =
        f.ab.affects === "self"
          ? id === f.source
          : cardMatches(s, id, f.ab.affects, { controller: f.controller, sourceId: f.source }, baseChars);
      if (!hit) continue;
      const m = f.ab.mods;
      for (const k of m.keywords ?? []) if (!c.keywords.includes(k)) c.keywords.push(k);
      for (const fl of m.flags ?? []) if (!c.flags.includes(fl)) c.flags.push(fl);
      for (const e of m.cpAs ?? []) if (!c.cpAs.includes(e)) c.cpAs.push(e);
      if (m.cantBeChosenBy) c.cantBeChosenBy.push(m.cantBeChosenBy);
      if (m.damage)
        (m.damage.dealtBy ? c.dealtMods : c.damageMods).push({ mod: m.damage, source: f.source, controller: f.controller });
      add += m.power ?? 0;
    }
    c.power += add;
    map.set(id, c);
  }
  return map;
}

/** Characteristics of a card (on the field and in the Break Zone with every effect; elsewhere, printed). */
export function chars(s: GameState, id: ObjectId): Chars {
  let c = cache.get(s);
  if (!c || c.version !== s.version) {
    c = { version: s.version, map: compute(s) };
    cache.set(s, c);
  }
  return c.map.get(id) ?? baseChars(s, id);
}

/** Power as a value (CR 4.3: a negative power counts as 0). */
export function effectivePower(s: GameState, id: ObjectId): number {
  return Math.max(0, chars(s, id).power);
}

export function hasKeyword(s: GameState, id: ObjectId, k: Keyword): boolean {
  return chars(s, id).keywords.includes(k);
}

export function hasFlag(s: GameState, id: ObjectId, f: Flag): boolean {
  return chars(s, id).flags.includes(f);
}

/** The battlefield's characteristics recomputed without the cache (invariants of the fuzz: the cache is not stale). */
export function freshChars(s: GameState): Map<ObjectId, Chars> {
  return compute(s);
}
