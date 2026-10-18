/**
 * Flow of a resolution: "you may…" (CR 11.8.14: decided on resolution), "if…", "When you do so" (a reflexive
 * auto-ability). Nested effects are spliced into the resolution after the current one, so that a question asked
 * inside them resumes the resolution without replaying what was already done.
 */
import { evalCond, question, store } from "../effects";
import type { OpHandlers } from "../opRegistry";
import { newId } from "../state";
import type { Effect, Resolution } from "../types";

/** Inserts effects right after the current one. */
function inline(r: Resolution, effects: Effect[]): void {
  r.effects = [...r.effects.slice(0, r.pc + 1), ...effects, ...r.effects.slice(r.pc + 1)];
}

export const HANDLERS: OpHandlers = {
  may(_s, r, e, ctx, key) {
    const k = key("may");
    const answer = r.vars[k];
    if (!answer) return question(ctx.controller, { type: "yesNo", prompt: e.prompt, intent: "may", suggested: [1] }, k);
    const yes = answer[0] === 1;
    if (yes) inline(r, e.effects);
    store(r, e.store, yes ? [1] : []);
    return undefined;
  },
  if(s, r, e, ctx) {
    const branch = evalCond(s, ctx, e.cond) ? e.then : (e.else ?? []);
    inline(r, branch);
    return undefined;
  },
  reflexive(s, r, e, ctx) {
    // "When you do so, …": triggered by this resolution (CR 11.8.17), put on the stack at the next priority.
    if (e.cond && !evalCond(s, ctx, e.cond)) return undefined;
    s.triggers.push({
      id: newId(s, "t"),
      controller: ctx.controller,
      sourceId: ctx.sourceId,
      sourceDefId: ctx.sourceDefId,
      inline: e.ability,
      vars: { ...r.vars },
      event: ctx.event ?? {},
    });
    return undefined;
  },
};
