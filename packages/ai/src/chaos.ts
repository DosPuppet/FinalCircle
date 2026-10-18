/**
 * "Chaos" fuzz (from Planecircle): corrupted decisions that the engine must refuse with a RulesError, leaving the state
 * unchanged. A crash (any other error) or an accepted corruption is a bug.
 */
import type { Decision, GameState, PlayerId } from "@finalcircle/engine";
import { pick } from "./random";

/** A corrupted variant of a valid decision (or a random malformed one). */
export function corruptDecision(s: GameState, me: PlayerId, d: Decision, rand: () => number): Decision {
  const ids = Object.keys(s.objects);
  const anyId = () => pick(rand, ids) ?? "o1";
  const opponentCard = () =>
    pick(
      rand,
      s.field.filter((id) => s.objects[id]?.controller !== me),
    ) ?? anyId();
  switch (Math.floor(rand() * 8)) {
    case 0:
      return { type: "cast", card: anyId(), payment: { discard: [{ card: anyId() }] } };
    case 1:
      // The same card twice in a payment.
      if (d.type === "cast" && d.payment?.discard?.[0])
        return { ...d, payment: { discard: [d.payment.discard[0], d.payment.discard[0]] } };
      return { type: "activate", source: anyId(), ability: Math.floor(rand() * 3) };
    case 2:
      // Paying with the card being cast.
      if (d.type === "cast") return { ...d, payment: { discard: [{ card: d.card }] } };
      return { type: "attack", forwards: [opponentCard()] };
    case 3:
      return { type: "block", blocker: anyId() };
    case 4:
      return { type: "choose", values: [anyId(), anyId(), -1] };
    case 5:
      return { type: "discard", cards: [anyId()] };
    case 6:
      // Targets that are not legal.
      if (d.type === "cast" || d.type === "activate") return { ...d, targets: { t: [anyId(), anyId()] } };
      return { type: "endAttacks" };
    default:
      return { type: "cast", card: anyId(), lbFlip: [anyId()] };
  }
}
