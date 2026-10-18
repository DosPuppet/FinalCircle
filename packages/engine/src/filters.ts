/** Whether a card matches an `ObjectFilter`, relative to a controller (CR 7.2.1: "you", "your opponent"). */
import type { Chars } from "./chars";
import type { Compare, Element, GameState, LkiSnapshot, ObjectFilter, ObjectId, PlayerId } from "./types";

export interface FilterContext {
  /** The player "you" refers to. */
  controller: PlayerId;
  /** The card with the ability ("other than [this card]"). */
  sourceId?: ObjectId;
  /** Elements of the cards an `elementOf` reference designates, resolved by the caller. */
  elementOf?: Element[];
}

export function compareOk(n: number, c: Compare | undefined): boolean {
  if (!c) return true;
  return (c.min === undefined || n >= c.min) && (c.max === undefined || n <= c.max) && (c.eq === undefined || n === c.eq);
}

/** `get` gives the characteristics to read (with field abilities by default; without them inside their computation). */
export function cardMatches(
  s: GameState,
  id: ObjectId,
  f: ObjectFilter,
  ctx: FilterContext,
  get: (s: GameState, id: ObjectId) => Chars,
): boolean {
  const o = s.objects[id];
  if (!o) return false;
  const c = get(s, id);
  if (f.types && !f.types.includes(c.type)) return false;
  if (f.character && c.type === "Summon") return false;
  if (f.elements && !c.elements.some((e) => f.elements?.includes(e))) return false;
  if (f.controller) {
    const who = o.zone === "field" || o.zone === "stack" ? o.controller : o.owner;
    if ((f.controller === "you") !== (who === ctx.controller)) return false;
  }
  if (f.names && !c.names.some((n) => f.names?.includes(n))) return false;
  if (f.notNames && c.names.some((n) => f.notNames?.includes(n))) return false;
  if (f.jobs && !c.jobs.some((j) => f.jobs?.includes(j))) return false;
  if (f.jobOrName && !c.jobs.some((j) => f.jobOrName?.includes(j)) && !c.names.some((n) => f.jobOrName?.includes(n)))
    return false;
  if (f.categories && !c.categories.some((x) => f.categories?.includes(x))) return false;
  if (!compareOk(c.cost, f.cost)) return false;
  if (f.power && !compareOk(Math.max(0, c.power), f.power)) return false;
  if (f.dull !== undefined && o.dull !== f.dull) return false;
  if (f.other && id === ctx.sourceId) return false;
  if (f.elementOf && !c.elements.some((e) => ctx.elementOf?.includes(e))) return false;
  if (f.fromFieldThisTurn && !s.turnLog.some((e) => e.e === "toBreakFromField" && e.id === id)) return false;
  return true;
}

/** Whether a card as it last was (a card that left the field, CR 6.4.2) matches a filter. */
export function snapshotMatches(l: LkiSnapshot, f: ObjectFilter, ctx: FilterContext): boolean {
  if (f.types && !f.types.includes(l.type)) return false;
  if (f.character && l.type === "Summon") return false;
  if (f.elements && !l.elements.some((e) => f.elements?.includes(e))) return false;
  if (f.controller && (f.controller === "you") !== (l.controller === ctx.controller)) return false;
  if (f.names && !f.names.includes(l.name)) return false;
  if (f.notNames?.includes(l.name)) return false;
  if (f.jobs && !l.jobs.some((j) => f.jobs?.includes(j))) return false;
  if (f.jobOrName && !l.jobs.some((j) => f.jobOrName?.includes(j)) && !f.jobOrName.includes(l.name)) return false;
  if (f.categories && !l.categories.some((x) => f.categories?.includes(x))) return false;
  if (!compareOk(l.cost, f.cost)) return false;
  if (f.power && !compareOk(Math.max(0, l.power), f.power)) return false;
  if (f.dull !== undefined && l.dull !== f.dull) return false;
  if (f.other && l.id === ctx.sourceId) return false;
  return true;
}
