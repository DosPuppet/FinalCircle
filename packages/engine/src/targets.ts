/**
 * "Choose" (CR 11.3.3, 11.6.5, 11.8.9): the legal targets of a choose specification, and the protections that forbid
 * them ("cannot be chosen by your opponent's Summons of cost 1"). "Select" is not choosing (I15): see `effects.ts`.
 */
import { chars } from "./chars";
import { cardMatches, compareOk, type FilterContext } from "./filters";
import type { ChooseOption, ChooseSpec, GameState, ObjectId, PlayerId, SourceFilter } from "./types";

/** What is choosing: a Summon or an ability, its controller and source (for the protections). */
export interface ChooserContext extends FilterContext {
  kind: "summon" | "ability";
  /** Cost of the source (a Summon's cost, or the cost of the card with the ability). */
  sourceCost: number;
}

/** Whether a protection "cannot be chosen by [source]" covers this chooser. */
export function sourceMatches(
  f: SourceFilter,
  owner: PlayerId,
  by: { controller: PlayerId; kind: string; cost: number },
): boolean {
  if (f.controller && (f.controller === "you") !== (by.controller === owner)) return false;
  if (f.kind && !f.kind.includes(by.kind as never)) return false;
  return compareOk(by.cost, f.cost);
}

/** Whether `id` can be chosen by this chooser (its filter, its zone, the protections). */
export function canChoose(s: GameState, id: ObjectId, spec: ChooseSpec, ctx: ChooserContext): boolean {
  const o = s.objects[id];
  if (!o || o.zone !== (spec.zone ?? "field")) return false;
  // CR 11.3.3, 11.6.5, 11.8.9: an ability or a Summon cannot choose itself; its card can be chosen ("other than [this
  // card]" is written in the filter).
  if (!cardMatches(s, id, spec.filter, ctx, chars)) return false;
  if (o.zone === "field")
    for (const p of chars(s, id).cantBeChosenBy)
      if (sourceMatches(p, o.controller, { controller: ctx.controller, kind: ctx.kind, cost: ctx.sourceCost })) return false;
  return true;
}

/** The cards that can be chosen for a specification. */
export function legalTargets(s: GameState, spec: ChooseSpec, ctx: ChooserContext): ObjectId[] {
  const zone = spec.zone ?? "field";
  const pool = zone === "field" ? s.field : s.playerOrder.flatMap((p) => s.players[p]?.breakZone ?? []);
  return pool.filter((id) => canChoose(s, id, spec, ctx));
}

/** The options of every specification; null when one cannot be met (CR 11.3.3: then it cannot be cast or used). */
export function chooseOptions(
  s: GameState,
  specs: readonly ChooseSpec[] | undefined,
  ctx: ChooserContext,
): ChooseOption[] | null {
  const out: ChooseOption[] = [];
  for (const spec of specs ?? []) {
    const options = legalTargets(s, spec, ctx);
    if (!spec.upTo && options.length < 1) return null;
    out.push({ key: spec.key, options, count: spec.count, ...(spec.upTo ? { upTo: true } : {}) });
  }
  return out;
}

/**
 * Whether chosen targets meet the specifications: each key with between 1 (0 for "up to") and `count` distinct legal
 * cards; "choose 2" with only one legal card takes that one (CR 2.3: the impossible part is ignored).
 */
export function targetsValid(
  s: GameState,
  specs: readonly ChooseSpec[] | undefined,
  chosen: Record<string, ObjectId[]> | undefined,
  ctx: ChooserContext,
): boolean {
  for (const spec of specs ?? []) {
    const ids = chosen?.[spec.key] ?? [];
    if (new Set(ids).size !== ids.length) return false;
    const legal = legalTargets(s, spec, ctx);
    const min = spec.upTo ? 0 : Math.min(spec.count, legal.length, 1);
    const need = spec.upTo ? 0 : Math.min(spec.count, legal.length);
    if (ids.length < Math.max(min, need) || ids.length > spec.count) return false;
    if (ids.some((id) => !legal.includes(id))) return false;
  }
  for (const key of Object.keys(chosen ?? {})) if (!specs?.some((x) => x.key === key)) return false;
  return true;
}
