/**
 * Effect interpreter (from Planecircle): effects are data, a resolution can be suspended on a player's choice and
 * resumed with the answer (`Resolution.vars`). The `op` handlers are in `ops/` (registered by `ops/index.ts`).
 */
import { baseChars, chars, setFieldCondition } from "./chars";
import { ask } from "./choices";
import { countMatching, evalCondition, playerOf } from "./conditions";
import type { DamageSource } from "./damage";
import { RulesError } from "./errors";
import { cardMatches } from "./filters";
import { type EffectContext, type OpResult, opHandler, registeredOps } from "./opRegistry";
import { msg } from "./text";
import type {
  Amount,
  ChoiceValue,
  Condition,
  Effect,
  Element,
  GameState,
  ObjectFilter,
  ObjectId,
  PlayerId,
  Ref,
  Resolution,
} from "./types";
import { snapshot } from "./zones";

export type { EffectContext, OpResult };

// Field abilities' conditions (CR 11.9), read on the characteristics without field abilities.
setFieldCondition(
  (s, source, controller, ab) => !ab.condition || evalCondition(s, ab.condition, { controller, sourceId: source }, baseChars),
);

export function contextOf(r: Resolution): EffectContext {
  return {
    controller: r.controller,
    sourceId: r.item.sourceId,
    sourceDefId: r.item.sourceDefId,
    kind: r.item.kind,
    targets: r.targets,
    ...(r.item.event ? { event: r.item.event } : {}),
    vars: r.vars,
    x: r.item.x ?? 0,
  };
}

/** The elements of the cards a reference designates (the `elementOf` of a filter). */
export function elementsOf(s: GameState, ctx: EffectContext, ref: Ref | undefined): Element[] | undefined {
  if (!ref) return undefined;
  return [...new Set(resolveRef(s, ctx, ref).flatMap((id) => chars(s, id).elements))];
}

/** A filter read in the context of a resolution ("you", "other than this card", "of the same Element as…"). */
export function filterContext(s: GameState, ctx: EffectContext, f: ObjectFilter) {
  const elementOf = elementsOf(s, ctx, f.elementOf);
  return { controller: ctx.controller, sourceId: ctx.sourceId, ...(elementOf ? { elementOf } : {}) };
}

/** The cards a reference designates now (cards that left their zone are gone, CR 7.4). */
export function resolveRef(s: GameState, ctx: EffectContext, ref: Ref): ObjectId[] {
  switch (ref.kind) {
    case "self":
      return s.objects[ctx.sourceId] ? [ctx.sourceId] : [];
    case "chosen":
      return (ctx.targets[ref.key] ?? []).filter((id) => s.objects[id]);
    case "stored":
      return (ctx.vars[ref.key] ?? []).map(String).filter((id) => s.objects[id]);
    case "event":
      return ctx.event?.subject && s.objects[ctx.event.subject] ? [ctx.event.subject] : [];
    case "all":
      return s.field.filter((id) => cardMatches(s, id, ref.filter, filterContext(s, ctx, ref.filter), chars));
  }
}

export function evalAmount(s: GameState, ctx: EffectContext, a: Amount): number {
  if (typeof a === "number") return a;
  switch (a.kind) {
    case "count":
      return countMatching(s, a.filter, filterContext(s, ctx, a.filter));
    case "times":
      return a.n * evalAmount(s, ctx, a.of);
    case "damage":
      return s.players[playerOf(s, ctx.controller, a.who)]?.damage.length ?? 0;
    case "ifElse":
      return evalAmount(s, ctx, evalCond(s, ctx, a.cond) ? a.then : a.else);
  }
}

export function evalCond(s: GameState, ctx: EffectContext, c: Condition): boolean {
  return evalCondition(s, c, { controller: ctx.controller, sourceId: ctx.sourceId, vars: ctx.vars });
}

/** The player a side designates. */
export function sidePlayer(s: GameState, ctx: EffectContext, side: "you" | "opponent"): PlayerId {
  return playerOf(s, ctx.controller, side);
}

/** The source of the damage an effect deals (CR 11.11.8: the card that is the source of the ability). */
export function damageSource(s: GameState, r: Resolution, ctx: EffectContext): DamageSource {
  const id = ctx.sourceId;
  const lki = s.objects[id] ? snapshot(s, id) : r.item.lki;
  return { id, controller: ctx.controller, kind: ctx.kind === "summon" ? "summon" : "ability", ...(lki ? { lki } : {}) };
}

/** Stores values under a key of the resolution (for the next effects). */
export function store(r: Resolution, key: string | undefined, values: ChoiceValue[]): void {
  if (key) r.vars[key] = values;
}

/** Asks a question during the resolution: the effect is replayed once the answer is under `key`. */
export function question(player: PlayerId, request: Parameters<typeof ask>[2], key: string): OpResult {
  return { ask: { player, request, key } };
}

/** Runs one effect; an effect that asks returns `ask`. */
export function runEffect(s: GameState, r: Resolution, e: Effect): OpResult {
  const handler = opHandler(e.op);
  if (!handler && registeredOps().length === 0)
    throw new Error("No effect handler registered: import the engine through game.ts (which imports ops/index.ts)");
  if (!handler) throw new Error(`no handler for effect op "${e.op}"`);
  const prefix = `${r.pc}`;
  return handler(s, r, e as never, contextOf(r), (suffix: string) => `${prefix}:${suffix}`);
}

/** Effects of nested blocks ("you may…", "if…") run inline, with their own keys. */
export function runEffects(
  s: GameState,
  r: Resolution,
  effects: Effect[],
  ctx: EffectContext,
  key: (x: string) => string,
): OpResult {
  for (let i = 0; i < effects.length; i++) {
    const e = effects[i] as Effect;
    const handler = opHandler(e.op);
    if (!handler) throw new Error(`no handler for effect op "${e.op}"`);
    const result = handler(s, r, e as never, ctx, (suffix: string) => key(`${i}:${suffix}`));
    if (result) return result;
  }
  return undefined;
}

/** What happens once a resolution is done (the Summon to the Break Zone, priority, the next EX Burst). */
let onResolved: (s: GameState, r: Resolution) => void = () => {};
export function setOnResolved(fn: typeof onResolved): void {
  onResolved = fn;
}

/** Runs the remaining effects; stops at the first question. Returns true when the resolution is over. */
export function continueResolution(s: GameState): boolean {
  const r = s.resolving;
  if (!r) return true;
  while (r.pc < r.effects.length && !s.over) {
    const result = runEffect(s, r, r.effects[r.pc] as Effect);
    if (result && "ask" in result) {
      r.awaiting = result.ask.key;
      ask(s, result.ask.player, result.ask.request, { kind: "effect" });
      s.flow = "resolving";
      return false;
    }
    r.pc += 1;
  }
  s.resolving = null;
  onResolved(s, r);
  return true;
}

/** The answer to a question of the resolution. */
export function answerResolutionChoice(s: GameState, values: ChoiceValue[]): boolean {
  const r = s.resolving;
  if (!r?.awaiting) throw new RulesError(msg("No pending resolution"));
  r.vars[r.awaiting] = values;
  r.awaiting = null;
  return continueResolution(s);
}
