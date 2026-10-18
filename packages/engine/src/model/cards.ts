/**
 * Card model (CR 5): elements, types, costs, and abilities as data (CR 11.5). Card scripts (`@finalcircle/cards`) build
 * these with the DSL; the state never holds functions.
 */
import type { Effect } from "./effects";
import type { Amount, ChooseSpec, Condition, ObjectFilter, SourceFilter } from "./rules";

/** CR 5.2.1.1. */
export type Element = "fire" | "ice" | "wind" | "earth" | "lightning" | "water" | "light" | "dark";
export const ELEMENTS: readonly Element[] = ["fire", "ice", "wind", "earth", "lightning", "water", "light", "dark"];

/** CR 5.2.3. Forwards, Backups and Monsters are Characters. */
export type CardType = "Forward" | "Backup" | "Monster" | "Summon";
export const CHARACTER_TYPES: readonly CardType[] = ["Forward", "Backup", "Monster"];

/** Keyword abilities that change the rules (CR 15.2). Damage N, Warp, Limit Break and Priming have their own fields. */
export type Keyword = "haste" | "brave" | "firstStrike" | "backAttack";

/** A CP cost (CR 11.2): CP of given elements, and generic CP of any element. */
export interface CpCost {
  elements: Partial<Record<Element, number>>;
  generic: number;
}

/** The cost of an action or special ability (CR 11.6.2, 11.7.1). */
export interface AbilityCost {
  cp?: CpCost;
  /** 《ダル》 (CR 11.6.2.2): dull the card, controlled since the start of the turn unless it has Haste (Monsters excepted). */
  dull?: boolean;
  /** "put [this card] into the Break Zone". */
  putSelfIntoBreak?: boolean;
  /** "discard [this card]" (an ability usable from the hand). */
  discardSelf?: boolean;
  /** "remove [this card] in the Break Zone from the game". */
  removeSelf?: boolean;
  /** 《S》 (CR 11.7.1): discard a card with the same name. */
  special?: boolean;
  /** 《C》: Crystals to pay (Milestone 2). */
  crystals?: number;
}

/** Zone in which an ability works (CR 11.9.1); the field when absent. */
export type AbilityZone = "field" | "hand" | "break";

/** "You can only use this ability during your turn / Main Phase, only once per turn". */
export interface AbilityLimits {
  yourTurn?: boolean;
  mainPhase?: boolean;
  oncePerTurn?: boolean;
}

/** One action of a "select N of the M following actions" text (CR 11.3.4, 11.8.10). */
export interface ModeDef {
  label: string;
  choose?: ChooseSpec[];
  effects: Effect[];
}

export interface Modal {
  /** Number of modes to select. */
  pick: number;
  /** "up to N": from 1 to N modes. */
  upTo?: boolean;
  modes: ModeDef[];
}

interface AbilityBase {
  /** Player-facing name of the ability (English, translated by the catalogs). */
  label: string;
  /** Marked EX BURST (CR 11.10.3): an auto-ability that an EX Burst applies. */
  exBurst?: boolean;
}

/** "cost: effect" (CR 11.6); a special ability has `specialName` and `cost.special` (CR 11.7). */
export interface ActionAbility extends AbilityBase {
  kind: "action";
  cost: AbilityCost;
  choose?: ChooseSpec[];
  effects: Effect[];
  modal?: Modal;
  zone?: AbilityZone;
  limits?: AbilityLimits;
  specialName?: string;
}

/** "When…, …" (CR 11.8). */
export interface AutoAbility extends AbilityBase {
  kind: "auto";
  on: TriggerSpec[];
  /** Conditional auto-ability (CR 11.8.13): checked when triggering and again on resolution. */
  condition?: Condition;
  choose?: ChooseSpec[];
  effects: Effect[];
  modal?: Modal;
  zone?: AbilityZone;
}

/** Ongoing effect while the card is in its zone (CR 11.9). */
export interface FieldAbility extends AbilityBase {
  kind: "field";
  /** "If…" field abilities, Damage N (CR 15.2.6). */
  condition?: Condition;
  /** The card itself, or the cards that match (controller relative to the card's controller). */
  affects: "self" | ObjectFilter;
  /** Zone of the affected cards: the field when absent ("cards in your Break Zone"). */
  affectsZone?: "field" | "break";
  mods: FieldMods;
  zone?: AbilityZone;
}

export type AbilityDef = ActionAbility | AutoAbility | FieldAbility;

/** What a field ability or an ongoing effect changes on a card. */
export interface FieldMods {
  power?: number;
  keywords?: Keyword[];
  flags?: Flag[];
  /** "can produce Lightning CP" (a Backup dulled for CP, CR 11.2.2.2). */
  cpAs?: Element[];
  /** "cannot be chosen by…" (CR 11.3.3, 11.6.5, 11.8.9). */
  cantBeChosenBy?: SourceFilter;
  /** "If [the affected card] is dealt damage…, … instead" (CR 11.12.5). */
  damage?: DamageReplacement;
}

/** Restrictions and protections a card can have or gain ("gains 'This Forward cannot be broken'"). */
export type Flag =
  | "cantBeBroken"
  /** "cannot be returned to its owner's hand by your opponent's Summons or abilities". */
  | "cantBeReturnedByOpponent"
  /** "cannot use action abilities" (special abilities are action-like: CR 11.7.1). */
  | "cantUseActionAbilities"
  /** "cannot be removed from the game by your opponent's Summons or abilities" (cards in the Break Zone). */
  | "cantBeRemovedByOpponent";

/** A replacement of damage dealt to the affected card (CR 11.12.5): `from` restricts the source. */
export interface DamageReplacement {
  from?: SourceFilter;
  /** "reduce the damage by N", "the damage becomes 0", "the damage increases by N". */
  reduce?: number;
  set?: number;
  add?: number;
  /** The replacement is on the source side: damage *dealt by* the affected card ("If a Forward you control deals damage to a Forward"). */
  dealtBy?: boolean;
  /** Damage to which kind of recipient, for `dealtBy` (Wuk Lamat: to a Forward). */
  toForward?: boolean;
}

/** Trigger events of auto-abilities (CR 11.8.2). */
export type TriggerSpec =
  /** "When [this card] enters the field", or "When a [filter] enters your field" (CR 11.8.16.2.1). */
  | { on: "enters"; self?: true; filter?: ObjectFilter }
  | { on: "attacks"; self: true }
  /** "When [this card] is chosen by a Summon or an ability". */
  | { on: "chosen"; self: true; by: ("summon" | "ability")[] }
  /** "When [this card] deals damage to a Forward / to your opponent". */
  | { on: "dealsDamage"; self: true; to: "forward" | "opponent" }
  /** "At the beginning of the [phase] during each of your turns" (CR 9.3.1.3, 10.1.1.1, 9.5.1.1). */
  | { on: "phaseStart"; phase: "main1" | "attack" | "end"; whose: "you" | "opponent" | "each" }
  /** "When a [filter] is put from the field into the Break Zone". */
  | { on: "putIntoBreak"; fromField: true; self?: true; filter?: ObjectFilter }
  | { on: "leaves"; self: true };

/** Rules a card applies to its own casting (CR 11.4.4, 11.2). */
export interface CastRules {
  /** "You can only pay with Fire CP to cast [this card]". */
  payOnly?: Element[];
  /** "If …, the cost required to cast [this card] is reduced by N". */
  reduce?: { by: Amount; condition: Condition };
}

/** A card's definition: printed information (from the official data) and its script. */
export interface CardDef {
  /** Card number of the identity (CR 5.2.5.1): the oldest printing; reprint codes map to it. */
  id: string;
  /** Every code printed for this card ("Re-174L", "19-102L"). */
  codes: string[];
  /** English name; the French name is in `fr`. */
  name: string;
  type: CardType;
  elements: Element[];
  cost: number;
  /** Forwards only (CR 5.2.6.1). */
  power?: number;
  jobs: string[];
  categories: string[];
  /** Generic icon (CR 5.2.2.1): any number of this name on a field. */
  generic: boolean;
  exBurst: boolean;
  rarity: string;
  /** Set number of the identity printing (1 for Opus I…): L3 legality. */
  set: number;
  /** Limit Break cost X (CR 15.2.8.2): an LB card. */
  lb?: number;
  /** "Damage N --" abilities are field abilities with a damage condition; printed keywords here. */
  keywords: Keyword[];
  abilities: AbilityDef[];
  /** A Summon's effects (CR 11.3); its "choose" targets and modes. */
  summon?: { choose?: ChooseSpec[]; effects: Effect[]; modal?: Modal };
  castRules?: CastRules;
  /** English text with the official markup (`[[br]]`, `《火》`…), rendered by the client. */
  text: string;
  /** French printed information. */
  fr?: { name: string; type: string; job: string; text: string };
  /** Image file names on the official CDN (`<code>_eg.jpg`, `<code>_fr.jpg`); absent: the text frame is shown. */
  image?: { en?: string; fr?: string };
  /** Every ability of the text is handled (a script, or a text the parser reads entirely). */
  implemented: boolean;
}
