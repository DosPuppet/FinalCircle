/**
 * Effects that move cards: break, put into the Break Zone, to the hand, remove from the game; search, look at the top
 * of the deck, play from the hand onto the field.
 */
import { chars, hasFlag } from "../chars";
import { filterContext, question, resolveRef, store } from "../effects";
import { emit } from "../events";
import { cardMatches } from "../filters";
import type { OpHandlers } from "../opRegistry";
import { fieldAllows } from "../stack";
import { shuffle } from "../state";
import { msg } from "../text";
import type { GameState, ObjectId, PlayerId } from "../types";
import { moveObject } from "../zones";

/** Whose card it is, against the ability's controller: an opponent's effect (protections "by your opponent's…"). */
const byOpponent = (s: GameState, id: ObjectId, controller: PlayerId) => {
  const o = s.objects[id];
  return !!o && (o.zone === "field" ? o.controller : o.owner) !== controller;
};

export const HANDLERS: OpHandlers = {
  break(s, _r, e, ctx) {
    // CR 15.1.1.3: from the field to its owner's Break Zone; "cannot be broken" stops it.
    for (const id of resolveRef(s, ctx, e.what))
      if (s.objects[id]?.zone === "field" && !hasFlag(s, id, "cantBeBroken"))
        moveObject(s, id, "break", { broken: true, breaker: ctx.sourceId });
    return undefined;
  },
  toBreakZone(s, _r, e, ctx) {
    // CR 15.1.1.3.2: put into the Break Zone, not broken.
    for (const id of resolveRef(s, ctx, e.what)) if (s.objects[id]?.zone === "field") moveObject(s, id, "break");
    return undefined;
  },
  toHand(s, _r, e, ctx) {
    for (const id of resolveRef(s, ctx, e.what)) {
      const o = s.objects[id];
      if (!o || (o.zone !== "field" && o.zone !== "break")) continue;
      if (o.zone === "field" && byOpponent(s, id, ctx.controller) && hasFlag(s, id, "cantBeReturnedByOpponent")) continue;
      moveObject(s, id, "hand");
    }
    return undefined;
  },
  removeFromGame(s, _r, e, ctx) {
    for (const id of resolveRef(s, ctx, e.what)) {
      const o = s.objects[id];
      if (!o || o.zone === "removed") continue;
      if (byOpponent(s, id, ctx.controller) && chars(s, id).flags.includes("cantBeRemovedByOpponent")) continue;
      moveObject(s, id, "removed");
    }
    return undefined;
  },
  search(s, r, e, ctx, key) {
    // CR 15.1.1.8: find the card, reveal it, shuffle, then follow the text; one may fail to find (15.1.1.8.2); a card
    // whose next step is impossible cannot be searched for (15.1.1.8.1).
    const k = key("search");
    const deck = s.players[ctx.controller]?.deck ?? [];
    const fctx = filterContext(s, ctx, e.filter);
    const pick = r.vars[k];
    if (!pick) {
      const options = deck.filter((id) => {
        if (!cardMatches(s, id, e.filter, fctx, chars)) return false;
        const d = s.defs[s.objects[id]?.defId ?? ""];
        return e.to !== "field" || (!!d && d.type !== "Summon" && fieldAllows(s, ctx.controller, d));
      });
      if (!options.length) {
        shuffle(s, deck);
        emit({ type: "search", player: ctx.controller, found: null });
        emit({ type: "shuffle", player: ctx.controller });
        return undefined;
      }
      return question(
        ctx.controller,
        {
          type: "pick",
          options,
          min: 0,
          max: 1,
          prompt: msg("Search your deck"),
          intent: "search",
          suggested: options.slice(0, 1),
        },
        k,
      );
    }
    const found = pick.map(String).find((id) => s.objects[id]?.zone === "deck");
    if (found) emit({ type: "reveal", player: ctx.controller, cards: [found] });
    emit({ type: "search", player: ctx.controller, found: found ?? null });
    let placed: ObjectId | undefined;
    if (found) {
      const d = s.defs[s.objects[found]?.defId ?? ""];
      placed =
        e.to === "field"
          ? moveObject(s, found, "field", { controller: ctx.controller, dull: d?.type === "Backup" })
          : moveObject(s, found, "hand");
    }
    shuffle(s, s.players[ctx.controller]?.deck ?? []);
    emit({ type: "shuffle", player: ctx.controller });
    store(r, `${k}:found`, placed ? [placed] : []);
    return undefined;
  },
  lookTop(s, r, e, ctx, key) {
    // "Look at / reveal the top N cards. Add 1 [card] among them to your hand and return the others to the bottom of
    // your deck in any order."
    const takeKey = key("take");
    const orderKey = key("order");
    const deck = s.players[ctx.controller]?.deck ?? [];
    const top = deck.slice(0, e.n);
    if (!r.vars[takeKey]) {
      emit({ type: "reveal", player: ctx.controller, cards: top, ...(e.reveal ? {} : { to: ctx.controller }) });
      const fctx = filterContext(s, ctx, e.take.filter ?? {});
      const options = top.filter((id) => !e.take.filter || cardMatches(s, id, e.take.filter, fctx, chars));
      const n = Math.min(e.take.count, options.length);
      if (!n) r.vars[takeKey] = [];
      else
        return question(
          ctx.controller,
          {
            type: "pick",
            options,
            min: n,
            max: n,
            prompt: msg("Add {n} card(s) to your hand", { n }),
            intent: "take",
            suggested: options.slice(0, n),
          },
          takeKey,
        );
    }
    const taken = (r.vars[takeKey] ?? []).map(String);
    const rest = top.filter((id) => !taken.includes(id));
    if (rest.length > 1 && !r.vars[orderKey])
      return question(
        ctx.controller,
        {
          type: "order",
          items: rest,
          prompt: msg("Order of the cards put on the bottom of your deck (the first one goes to the bottom first)"),
          intent: "order",
          suggested: rest,
          autoOk: true,
        },
        orderKey,
      );
    for (const id of taken) if (s.objects[id]?.zone === "deck") moveObject(s, id, "hand");
    for (const id of (r.vars[orderKey] ?? rest).map(String))
      if (s.objects[id]?.zone === "deck") moveObject(s, id, "deck", { position: "bottom" });
    return undefined;
  },
  playFromHand(s, r, e, ctx, key) {
    // "Play 1 [card] from your hand onto the field": without paying its cost (I6).
    const k = key("play");
    const hand = s.players[ctx.controller]?.hand ?? [];
    const pick = r.vars[k];
    if (!pick) {
      const fctx = filterContext(s, ctx, e.filter);
      const options = hand.filter((id) => {
        const d = s.defs[s.objects[id]?.defId ?? ""];
        return !!d && d.type !== "Summon" && cardMatches(s, id, e.filter, fctx, chars) && fieldAllows(s, ctx.controller, d);
      });
      if (!options.length) return undefined;
      return question(
        ctx.controller,
        {
          type: "pick",
          options,
          min: e.may ? 0 : 1,
          max: 1,
          prompt: msg("Play a card from your hand onto the field"),
          intent: "playFromHand",
          suggested: options.slice(0, 1),
        },
        k,
      );
    }
    for (const id of pick.map(String)) {
      const d = s.defs[s.objects[id]?.defId ?? ""];
      if (s.objects[id]?.zone === "hand" && d && fieldAllows(s, ctx.controller, d))
        moveObject(s, id, "field", { controller: ctx.controller, dull: d.type === "Backup" });
    }
    return undefined;
  },
};
