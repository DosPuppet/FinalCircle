/** Conditions of abilities (CR 11.8.13, 15.2.6) and the counts they read. */
import { type Chars, chars } from "./chars";
import { cardMatches, type FilterContext } from "./filters";
import { opponentOf } from "./state";
import type { Amount, ChoiceValue, Condition, GameState, ObjectFilter, ObjectId, PlayerId, Side } from "./types";

export interface ConditionContext extends FilterContext {
  /** Values stored by the resolution ("the discarded card", "when you do so"). */
  vars?: Record<string, ChoiceValue[]>;
}

export const playerOf = (s: GameState, controller: PlayerId, side: Side): PlayerId =>
  side === "you" ? controller : opponentOf(s, controller);

/** Cards on the field that match (counted for "if you control 5 or more Characters"). */
export function countMatching(
  s: GameState,
  f: ObjectFilter,
  ctx: FilterContext,
  get: (s: GameState, id: ObjectId) => Chars = chars,
): number {
  return s.field.filter((id) => cardMatches(s, id, f, ctx, get)).length;
}

export function evalCondition(
  s: GameState,
  c: Condition,
  ctx: ConditionContext,
  get: (s: GameState, id: ObjectId) => Chars = chars,
): boolean {
  switch (c.kind) {
    case "count":
      return countMatching(s, c.filter, ctx, get) >= c.atLeast;
    case "damage":
      return (s.players[playerOf(s, ctx.controller, c.who)]?.damage.length ?? 0) >= c.atLeast;
    case "stored": {
      const ids = (ctx.vars?.[c.key] ?? []).map(String);
      return ids.some((id) => s.objects[id] && cardMatches(s, id, c.filter, ctx, get));
    }
    case "did":
      return (ctx.vars?.[c.key]?.length ?? 0) > 0;
    case "yourTurn":
      return s.turn.active === ctx.controller;
    case "not":
      return !evalCondition(s, c.cond, ctx, get);
    case "all":
      return c.conds.every((x) => evalCondition(s, x, ctx, get));
  }
}

/** An amount outside a resolution (a cost reduction, CR 11.4.4): no chosen or stored cards. */
export function staticAmount(s: GameState, a: Amount, ctx: ConditionContext): number {
  if (typeof a === "number") return a;
  switch (a.kind) {
    case "count":
      return countMatching(s, a.filter, ctx);
    case "times":
      return a.n * staticAmount(s, a.of, ctx);
    case "damage":
      return s.players[playerOf(s, ctx.controller, a.who)]?.damage.length ?? 0;
    case "ifElse":
      return staticAmount(s, evalCondition(s, a.cond, ctx) ? a.then : a.else, ctx);
  }
}
