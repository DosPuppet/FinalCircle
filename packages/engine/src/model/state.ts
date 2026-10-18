/**
 * Game state: plain JSON (no class, Map or Set), copied by `cloneState` before each decision.
 */
import type { AutoAbility, CardDef, CardType, Element, FieldMods, Keyword } from "./cards";
import type { ChoiceValue, PendingDecision } from "./decisions";
import type { Effect } from "./effects";

export type PlayerId = string;
export type ObjectId = string;

/** CR 7.1. The field and the stack are shared; the other zones belong to a player. */
export type Zone = "deck" | "hand" | "field" | "break" | "damage" | "removed" | "lb" | "stack";

/** CR 9. Main Phase 2 is any Main Phase after the first (CR 9.3.1.1). */
export type Phase = "active" | "draw" | "main1" | "attack" | "main2" | "end";
/** CR 10.1. */
export type AttackStep = "preparation" | "declaration" | "block" | "damage";

export interface GameObject {
  id: ObjectId;
  /** Physical identity: follows the card from one zone to another (CR 7.4 gives a new `id`), for animations. */
  uid: string;
  defId: string;
  owner: PlayerId;
  controller: PlayerId;
  zone: Zone;
  dull: boolean;
  /** Damage received this turn (removed in the End Phase, CR 9.5.1.3.1). */
  damage: number;
  /** Source of the last damage it received: it broke it, if a rule process breaks it right after (CR 12.4.5). */
  damagedBy?: ObjectId;
  /** CR 15.2.4: does not activate during its controller's next Active Phase. */
  frozen?: boolean;
  /** Face down (LB deck cards, CR 7.14.2; cards removed face down, CR 7.13.3). */
  faceDown?: boolean;
  /** Turn number since which its controller controls it (CR 10.1.2.1.1, 11.6.2.2). */
  controlledSince: number;
  /** When it entered its zone (CR 11.12.4.10). */
  timestamp: number;
  counters?: Record<string, number>;
}

export interface PlayerState {
  id: PlayerId;
  name: string;
  /** Top card first. */
  deck: ObjectId[];
  hand: ObjectId[];
  breakZone: ObjectId[];
  /** In the order the cards arrived (CR 7.8.3). */
  damage: ObjectId[];
  removed: ObjectId[];
  lb: ObjectId[];
  crystals: number;
  mulliganed: boolean;
  lost: boolean;
  /** CR 12.4.2: tried to draw from an empty main deck. */
  drewFromEmpty: boolean;
  /** CR 12.4.3: took damage with no card left in the main deck. */
  damagedFromEmpty: boolean;
}

/** Characteristics of a card when it last was in a zone (CR 6.4.2, 11.11.4). */
export interface LkiSnapshot {
  id: ObjectId;
  defId: string;
  name: string;
  type: CardType;
  elements: Element[];
  cost: number;
  power: number;
  jobs: string[];
  categories: string[];
  owner: PlayerId;
  controller: PlayerId;
  zone: Zone;
  dull: boolean;
  keywords: Keyword[];
}

/** An ongoing effect from a resolved Summon or ability (CR 11.12.4.2: the affected cards are locked). */
export interface ContinuousEffect extends FieldMods {
  id: string;
  timestamp: number;
  affected: ObjectId[];
  duration: "endOfTurn" | "permanent";
  sourceId: ObjectId;
  controller: PlayerId;
  /** "the next damage dealt to it is reduced by N", used once (CR 11.12.5). */
  shield?: number;
}

/** What triggered an auto-ability: the card concerned, the damage, the cause. */
export interface TriggerEvent {
  /** The card of the event (it entered, attacked, was damaged, was put into the Break Zone…). */
  subject?: ObjectId;
  /** Its last known information, when it left a zone. */
  lki?: LkiSnapshot;
  amount?: number;
}

/** A triggered auto-ability waiting to be put on the stack (CR 11.8.7). */
export interface PendingTrigger {
  id: string;
  controller: PlayerId;
  sourceId: ObjectId;
  sourceDefId: string;
  /** Index of the ability in its card's `abilities`; absent for a reflexive ability (`inline`). */
  ability?: number;
  inline?: AutoAbility;
  /** Values fixed when a reflexive ability was created (the resolution's stored cards). */
  vars?: Record<string, ChoiceValue[]>;
  event: TriggerEvent;
  /** Its controller placed it in this order among theirs (CR 11.8.7). */
  ordered?: boolean;
  /** Modes and targets chosen while it is put on the stack (CR 11.8.9–10). */
  modes?: number[];
  targets?: Record<string, ObjectId[]>;
}

export interface StackItem {
  id: string;
  kind: "summon" | "action" | "special" | "auto";
  controller: PlayerId;
  /** The Summon on the stack, or the card with the ability. */
  sourceId: ObjectId;
  sourceDefId: string;
  /** Index in the card's `abilities` (abilities); absent for a Summon or an inline ability. */
  ability?: number;
  inline?: AutoAbility;
  /** Chosen targets by key (CR 11.3.3). */
  targets: Record<string, ObjectId[]>;
  /** Selected modes (CR 11.3.4). */
  modes?: number[];
  x?: number;
  event?: TriggerEvent;
  vars?: Record<string, ChoiceValue[]>;
  /** Information of the source when the ability was put on the stack (CR 6.4.2). */
  lki?: LkiSnapshot;
}

/** A resolution in progress: suspended when an effect asks a question, resumed with the answer. */
export interface Resolution {
  item: StackItem;
  effects: Effect[];
  /** Index of the current effect. */
  pc: number;
  controller: PlayerId;
  targets: Record<string, ObjectId[]>;
  /** Answers and stored values by key. */
  vars: Record<string, ChoiceValue[]>;
  awaiting: string | null;
  /** An EX Burst (CR 11.10): resolved without the stack; the damage resolution continues afterwards. */
  exBurst?: boolean;
}

/** CR 10.1: the attack in progress. */
export interface AttackState {
  /** One Forward, or the members of a party (CR 15.1.1.9). */
  attackers: ObjectId[];
  /** Element shared by a party (I21). */
  partyElement?: Element;
  blocker: ObjectId | null;
  blockDeclared: boolean;
  /** A blocker was declared: the attack stays blocked even if the blocker leaves (I25). */
  blocked?: boolean;
  /** Damage Resolution Step (CR 10.1.4, 15.2.3): the First Strike round, then the others. */
  damage?: {
    stage: "first" | "normal" | "done";
    /** Forwards that already dealt their battle damage. */
    dealt: ObjectId[];
    /** The blocker's damage split among the party (CR 10.1.4.2.1), once chosen. */
    split?: Record<ObjectId, number>;
  };
}

/** An EX Burst waiting after a damage resolution (CR 6.5.2.1): queued in the order the cards arrived. */
export interface ExBurstEntry {
  player: PlayerId;
  card: ObjectId;
  /** The player's answer: use it or not (CR 11.10.2). */
  use?: boolean;
  modes?: number[];
  targets?: Record<string, ObjectId[]>;
}

/** Turn log: facts of this turn that abilities read ("put in your Break Zone from the field during this turn"). */
export type TurnLogEntry =
  | { e: "toBreakFromField"; id: ObjectId; owner: PlayerId; defId: string; type: CardType }
  | { e: "attacked"; id: ObjectId }
  | { e: "used"; source: ObjectId; ability: number }
  | { e: "damaged"; player: PlayerId; amount: number };

export type Flow = "setup" | "phaseStart" | "priority" | "resolving" | "phaseEnd" | "over";

export interface TurnState {
  number: number;
  active: PlayerId;
  phase: Phase;
  step: AttackStep | null;
  startingPlayer: PlayerId;
  /** CR 9.5.1.4: End Phase cleanup repeated until nothing new happens. */
  endLoop: number;
}

export interface GameState {
  /** Incremented by `bump` whenever characteristics may change (cache key of `chars`). */
  version: number;
  rng: number;
  /** One counter per id prefix ("o" objects, "s" stack items, "t" triggers, "e" effects). */
  idCounters: Record<string, number>;
  timestamp: number;
  defs: Record<string, CardDef>;
  objects: Record<ObjectId, GameObject>;
  players: Record<PlayerId, PlayerState>;
  playerOrder: PlayerId[];
  field: ObjectId[];
  stack: StackItem[];
  turn: TurnState;
  flow: Flow;
  priority: { holder: PlayerId; passes: number };
  attack: AttackState | null;
  effects: ContinuousEffect[];
  triggers: PendingTrigger[];
  exBursts: ExBurstEntry[];
  pending: PendingDecision | null;
  resolving: Resolution | null;
  setup: { chooser: PlayerId; mulliganQueue: PlayerId[] };
  lki: Record<ObjectId, LkiSnapshot>;
  turnLog: TurnLogEntry[];
  winner: PlayerId | "draw" | null;
  over: boolean;
  /** Watch of a loop of mandatory actions (CR 13.1). */
  loop?: { passes: number; seen: string[] };
}
