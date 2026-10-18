/**
 * Effects as data (one `op` per kind): run by the interpreter (`effects.ts`), each `op` handled in `ops/<domain>.ts`.
 * An effect that needs a player's answer suspends the resolution and is replayed with the answer (Planecircle's design).
 */
import type { AutoAbility, Flag, Keyword } from "./cards";
import type { Amount, Condition, ObjectFilter, Ref, Side } from "./rules";

export type Effect =
  | { op: "damage"; to: Ref; amount: Amount }
  /** "+N power until the end of the turn" (a negative N lowers it). */
  | { op: "power"; to: Ref; amount: Amount }
  /** "gains Haste…" / "gains 'This Forward cannot be broken'" until the end of the turn. */
  | { op: "gain"; to: Ref; keywords?: Keyword[]; flags?: Flag[] }
  | { op: "dull"; to: Ref }
  | { op: "activate"; to: Ref }
  | { op: "freeze"; to: Ref }
  /** Break (CR 15.1.1.3): from the field to the Break Zone, "broken". */
  | { op: "break"; what: Ref }
  /** "Put it into the Break Zone" (not breaking, CR 15.1.1.3.2). */
  | { op: "toBreakZone"; what: Ref }
  /** "Add it to your hand" (from the Break Zone), "return it to its owner's hand" (from the field). */
  | { op: "toHand"; what: Ref }
  | { op: "removeFromGame"; what: Ref }
  | { op: "draw"; who: Side; n: Amount }
  /** The player discards N cards of their choice; `store` keeps them ("the discarded card"). */
  | { op: "discard"; who: Side; n: Amount; store?: string }
  /** CR 15.1.1.8: search the deck for a card, reveal it, shuffle; then to the hand or onto the field. */
  | { op: "search"; filter: ObjectFilter; to: "hand" | "field"; may?: boolean }
  /** "Look at / reveal the top N cards. Add 1 [filter] among them to your hand, the others to the bottom in any order." */
  | { op: "lookTop"; n: number; reveal?: boolean; take: { filter?: ObjectFilter; count: number } }
  /** "Play 1 [filter] from your hand onto the field" (without paying its cost, I6). */
  | { op: "playFromHand"; filter: ObjectFilter; may?: boolean }
  /** "During this turn, the next damage dealt to it is reduced by N" (a one-time replacement). */
  | { op: "shield"; to: Ref; reduce: number }
  /** "[Player] selects N [filter]" (not choosing, CR 11.3.3; I15): stored under `store` for the next effects. */
  | { op: "select"; who: Side; filter: ObjectFilter; count: number; upTo?: boolean; store: string }
  /** "You may …": asked on resolution (CR 11.8.14); `store` notes "did" for a "When you do so" that follows. */
  | { op: "may"; prompt: string; effects: Effect[]; store?: string }
  | { op: "if"; cond: Condition; then: Effect[]; else?: Effect[] }
  /** "When you do so, …": an auto-ability triggered by this resolution (put on the stack at the next priority). */
  | { op: "reflexive"; ability: AutoAbility; cond?: Condition }
  | { op: "gainCrystals"; who: Side; n: Amount };

export type EffectOp = Effect["op"];
