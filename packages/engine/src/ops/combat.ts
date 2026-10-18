/** Effects on Forwards: damage, power, keywords and protections gained, dull, activate, freeze, damage shields. */
import { chars } from "../chars";
import { dealDamage } from "../damage";
import { damageSource, evalAmount, resolveRef } from "../effects";
import { emit } from "../events";
import type { OpHandlers } from "../opRegistry";
import { bump, newId, nextTimestamp, obj } from "../state";
import type { ContinuousEffect, GameState, ObjectId, PlayerId } from "../types";

/** An ongoing effect until the end of the turn on the cards present now (CR 11.12.4.2). */
function untilEndOfTurn(
  s: GameState,
  affected: ObjectId[],
  sourceId: ObjectId,
  controller: PlayerId,
  mods: Omit<ContinuousEffect, "id" | "timestamp" | "affected" | "duration" | "sourceId" | "controller">,
): void {
  if (!affected.length) return;
  s.effects.push({
    id: newId(s, "e"),
    timestamp: nextTimestamp(s),
    affected,
    duration: "endOfTurn",
    sourceId,
    controller,
    ...mods,
  });
  bump(s);
}

const onField = (s: GameState, ids: ObjectId[]) => ids.filter((id) => s.objects[id]?.zone === "field");

export const HANDLERS: OpHandlers = {
  damage(s, r, e, ctx) {
    const src = damageSource(s, r, ctx);
    const n = evalAmount(s, ctx, e.amount);
    for (const t of onField(s, resolveRef(s, ctx, e.to))) dealDamage(s, src, t, n);
    return undefined;
  },
  power(s, _r, e, ctx) {
    const ids = onField(s, resolveRef(s, ctx, e.to)).filter((id) => chars(s, id).type === "Forward");
    const n = evalAmount(s, ctx, e.amount);
    untilEndOfTurn(s, ids, ctx.sourceId, ctx.controller, { power: n });
    if (ids.length) emit({ type: "power", ids, amount: n });
    return undefined;
  },
  gain(s, _r, e, ctx) {
    const ids = onField(s, resolveRef(s, ctx, e.to));
    untilEndOfTurn(s, ids, ctx.sourceId, ctx.controller, {
      ...(e.keywords ? { keywords: e.keywords } : {}),
      ...(e.flags ? { flags: e.flags } : {}),
    });
    return undefined;
  },
  dull(s, _r, e, ctx) {
    const ids = onField(s, resolveRef(s, ctx, e.to));
    for (const id of ids) obj(s, id).dull = true;
    if (ids.length) {
      bump(s);
      emit({ type: "dulled", ids });
    }
    return undefined;
  },
  activate(s, _r, e, ctx) {
    const ids = onField(s, resolveRef(s, ctx, e.to));
    for (const id of ids) obj(s, id).dull = false;
    if (ids.length) {
      bump(s);
      emit({ type: "activated", ids });
    }
    return undefined;
  },
  freeze(s, _r, e, ctx) {
    // CR 15.2.4 (I7): it does not activate during its controller's next Active Phase.
    const ids = onField(s, resolveRef(s, ctx, e.to));
    for (const id of ids) obj(s, id).frozen = true;
    if (ids.length) {
      bump(s);
      emit({ type: "frozen", ids });
    }
    return undefined;
  },
  shield(s, _r, e, ctx) {
    // "During this turn, the next damage dealt to it is reduced by N instead" (CR 11.12.5).
    untilEndOfTurn(s, onField(s, resolveRef(s, ctx, e.to)), ctx.sourceId, ctx.controller, { shield: e.reduce });
    return undefined;
  },
};
