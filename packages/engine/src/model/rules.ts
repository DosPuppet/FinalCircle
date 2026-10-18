/**
 * What abilities refer to: filters of cards, chosen targets (CR 11.3.3), references, amounts and conditions.
 */
import type { CardType, Element } from "./cards";

/** Relative to the controller of the ability (or of the card, for field abilities). */
export type Side = "you" | "opponent";

export interface Compare {
  min?: number;
  max?: number;
  eq?: number;
}

/** A filter of cards: every given field must match. */
export interface ObjectFilter {
  types?: CardType[];
  /** Forward, Backup or Monster. */
  character?: boolean;
  /** At least one of these elements. */
  elements?: Element[];
  /** On the field: who controls it; elsewhere: who owns it. */
  controller?: Side;
  /** "Card Name X" (any of them), compared with English names. */
  names?: string[];
  notNames?: string[];
  /** "Job X" (any of them). */
  jobs?: string[];
  /** "Job X or Card Name X". */
  jobOrName?: string[];
  categories?: string[];
  cost?: Compare;
  power?: Compare;
  dull?: boolean;
  /** "other than [this card]". */
  other?: boolean;
  /** "of the same Element as the chosen Character": an element of the cards designated by this reference. */
  elementOf?: Ref;
  /** "put in your Break Zone from the field during this turn" (turn log). */
  fromFieldThisTurn?: boolean;
}

/** "choose N [filter]" (CR 11.3.3): targets fixed when cast, activated or put on the stack. */
export interface ChooseSpec {
  key: string;
  filter: ObjectFilter;
  /** Where the targets are: the field when absent. */
  zone?: "field" | "break";
  count: number;
  /** "up to N". */
  upTo?: boolean;
}

/** The source of a Summon, an ability or battle damage, for "by your opponent's Summons", "of cost 1"… */
export interface SourceFilter {
  controller?: Side;
  kind?: ("summon" | "ability" | "battle")[];
  cost?: Compare;
  types?: CardType[];
}

/** Cards designated by an effect. */
export type Ref =
  /** The card with the ability (or the Summon). */
  | { kind: "self" }
  /** The targets chosen under this key. */
  | { kind: "chosen"; key: string }
  /** Cards selected or stored during the resolution under this key ("select", "the discarded card"). */
  | { kind: "stored"; key: string }
  /** The card of the trigger event ("When Luso deals damage to a Forward, break it"). */
  | { kind: "event" }
  /** Every card that matches, on the field (locked when the effect resolves, CR 11.12.4.2). */
  | { kind: "all"; filter: ObjectFilter };

export type Amount =
  | number
  | { kind: "count"; filter: ObjectFilter }
  | { kind: "times"; n: number; of: Amount }
  /** Cards in a player's Damage Zone. */
  | { kind: "damage"; who: Side }
  /** "N; if …, M instead" (a self-replacement, CR 11.12.5.6). */
  | { kind: "ifElse"; cond: Condition; then: Amount; else: Amount };

export type Condition =
  | { kind: "count"; filter: ObjectFilter; atLeast: number }
  /** "If you have received N points of damage or more", Damage N (CR 15.2.6). */
  | { kind: "damage"; who: Side; atLeast: number }
  /** A card stored during the resolution matches ("If the discarded card is a Category IV card"). */
  | { kind: "stored"; key: string; filter: ObjectFilter }
  /** Something was stored under this key ("When you do so"). */
  | { kind: "did"; key: string }
  | { kind: "yourTurn" }
  | { kind: "not"; cond: Condition }
  | { kind: "all"; conds: Condition[] };
