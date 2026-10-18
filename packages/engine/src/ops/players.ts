/** Effects on players: draw, discard, select (CR 11.3.3: not choosing), Crystals. */
import { chars } from "../chars";
import { evalAmount, filterContext, question, sidePlayer, store } from "../effects";
import { emit } from "../events";
import { cardMatches } from "../filters";
import type { OpHandlers } from "../opRegistry";
import { msg } from "../text";
import { drawCards, moveObject } from "../zones";

export const HANDLERS: OpHandlers = {
  draw(s, _r, e, ctx) {
    drawCards(s, sidePlayer(s, ctx, e.who), evalAmount(s, ctx, e.n));
    return undefined;
  },
  discard(s, r, e, ctx, key) {
    const player = sidePlayer(s, ctx, e.who);
    const hand = s.players[player]?.hand ?? [];
    const n = Math.min(evalAmount(s, ctx, e.n), hand.length);
    const k = key("discard");
    if (n <= 0) {
      store(r, e.store, []);
      return undefined;
    }
    if (!r.vars[k] && n < hand.length)
      return question(
        player,
        {
          type: "pick",
          options: [...hand],
          min: n,
          max: n,
          prompt: msg("Discard {n} card(s) from your hand", { n }),
          intent: "discard",
          suggested: hand.slice(0, n),
        },
        k,
      );
    const chosen = (r.vars[k] ?? hand).map(String).filter((id) => s.objects[id]?.zone === "hand");
    const moved = chosen.map((id) => moveObject(s, id, "break"));
    emit({ type: "discard", player, cards: moved });
    store(r, e.store, moved);
    return undefined;
  },
  select(s, r, e, ctx, key) {
    // "[Player] selects N [cards]" (I15): no targeting, decided now by that player.
    const player = sidePlayer(s, ctx, e.who);
    const k = key("select");
    if (!r.vars[k]) {
      const fctx = filterContext(s, ctx, e.filter);
      const options = s.field.filter((id) => cardMatches(s, id, e.filter, fctx, chars));
      const n = Math.min(e.count, options.length);
      if (!options.length || (n === options.length && !e.upTo)) {
        store(r, e.store, options.slice(0, n));
        r.vars[k] = options.slice(0, n);
        return undefined;
      }
      return question(
        player,
        {
          type: "pick",
          options,
          min: e.upTo ? 0 : n,
          max: n,
          prompt: msg("Select {n} card(s)", { n }),
          intent: "select",
          suggested: options.slice(0, e.upTo ? 0 : n),
        },
        k,
      );
    }
    store(r, e.store, r.vars[k] ?? []);
    return undefined;
  },
  gainCrystals(s, _r, e, ctx) {
    const player = sidePlayer(s, ctx, e.who);
    const pl = s.players[player];
    const n = evalAmount(s, ctx, e.n);
    if (pl && n > 0) {
      pl.crystals += n;
      emit({ type: "crystals", player, amount: n });
    }
    return undefined;
  },
};
