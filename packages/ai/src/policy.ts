/**
 * Fast policy of the simulations (playouts of ISMCTS, the end of a one-move lookahead): plays the most expensive card
 * it can in its Main Phase, attacks with a Forward that the opposing blockers cannot stop, blocks when its blocker
 * survives or the damage would be lethal, answers questions as suggested.
 */
import {
  attackCandidates,
  blockCandidates,
  chars,
  type Decision,
  effectivePower,
  type GameState,
  legalActions,
  opponentOf,
  type PlayerId,
} from "@finalcircle/engine";
import { decisionFor } from "./options";

export type Policy = (s: GameState, me: PlayerId) => Decision;

export function fastPolicy(): Policy {
  return (s, me) => {
    const p = s.pending;
    if (!p) return { type: "pass" };
    switch (p.kind) {
      case "mulligan":
        return { type: "keep" };
      case "discard":
        return { type: "discard", cards: (s.players[me]?.hand ?? []).slice(0, p.count) };
      case "choice":
        return { type: "choose", values: p.request.suggested };
      case "declareAttack": {
        const strongest = Math.max(0, ...activeForwards(s, opponentOf(s, me)).map((id) => effectivePower(s, id)));
        const id = attackCandidates(s, me).find((x) => effectivePower(s, x) > strongest);
        return id ? { type: "attack", forwards: [id] } : { type: "endAttacks" };
      }
      case "declareBlock": {
        const attackers = s.attack?.attackers ?? [];
        const power = attackers.reduce((t, id) => t + effectivePower(s, id), 0);
        const lethal = (s.players[me]?.damage.length ?? 0) >= 6;
        const blocker =
          blockCandidates(s, me).find((id) => effectivePower(s, id) > power) ?? (lethal ? blockCandidates(s, me)[0] : undefined);
        return { type: "block", blocker: blocker ?? null };
      }
      case "priority": {
        if (s.stack.length || s.turn.active !== me || (s.turn.phase !== "main1" && s.turn.phase !== "main2"))
          return { type: "pass" };
        const casts = legalActions(s, me).filter((o) => o.type === "cast");
        const best = casts.sort((a, b) => cost(s, b) - cost(s, a))[0];
        return best ? decisionFor(best) : { type: "pass" };
      }
    }
  };
}

/** A player's active Forwards: the ones that could block. */
export function activeForwards(s: GameState, p: PlayerId): string[] {
  return s.field.filter((id) => s.objects[id]?.controller === p && !s.objects[id]?.dull && chars(s, id).type === "Forward");
}

const cost = (s: GameState, o: ReturnType<typeof legalActions>[number]) =>
  o.type === "cast" && s.objects[o.card] ? chars(s, o.card).cost : 0;
