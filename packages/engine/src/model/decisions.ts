/**
 * Decisions: what the engine waits for (`PendingDecision`), what a player answers (`Decision`), the options offered by
 * `legalActions` (`ActionOption`) and the display events (`GameEvent`).
 */
import type { CpCost, Element } from "./cards";
import type { AttackStep, ObjectId, Phase, PlayerId, Zone } from "./state";

export type ChoiceValue = string | number;

export type PendingDecision =
  /** CR 8.2.1.4: keep the 5 cards, or put them on the bottom and draw 5 (once). */
  | { kind: "mulligan"; player: PlayerId }
  | { kind: "priority"; player: PlayerId }
  /** CR 10.1.2: one Forward, a party, or no more attacks. */
  | { kind: "declareAttack"; player: PlayerId }
  /** CR 10.1.3: one active Forward, or no block. */
  | { kind: "declareBlock"; player: PlayerId }
  /** CR 9.5.1.2: discard down to the hand size. */
  | { kind: "discard"; player: PlayerId; count: number }
  | { kind: "choice"; player: PlayerId; request: ChoiceRequest; purpose: ChoicePurpose };

/** What a choice is for (the AI and the interface read it). */
export type ChoiceIntent =
  | "firstPlayer"
  | "mulliganOrder"
  | "triggerOrder"
  | "target"
  | "mode"
  | "may"
  | "discard"
  | "search"
  | "select"
  | "take"
  | "order"
  | "exBurst"
  | "partyDamage"
  | "excessBackups"
  | "replacementOrder"
  | "playFromHand"
  | "other";

interface ChoiceBase {
  prompt: string;
  intent: ChoiceIntent;
  /** Answer proposed by the engine, always valid: autopilot, AI fallback, pre-filling. */
  suggested: ChoiceValue[];
  /** The autopilot may answer with `suggested` (outside full control). */
  autoOk?: boolean;
  /** Labels of options that are neither cards nor players (modes, abilities). */
  labels?: Record<string, string>;
}

export type ChoiceRequest = ChoiceBase &
  (
    | { type: "pick"; options: string[]; min: number; max: number }
    | { type: "number"; min: number; max: number }
    | { type: "order"; items: string[] }
    | { type: "yesNo" }
    /** Split `total` among `among` (CR 10.1.4.2.1: in steps of `step`, at least `minEach`). */
    | { type: "divide"; among: string[]; total: number; step?: number; minEach?: number }
  );

export type ChoicePurpose =
  | { kind: "effect" }
  | { kind: "firstPlayer" }
  | { kind: "mulliganOrder" }
  | { kind: "triggerOrder"; player: PlayerId }
  /** Targets or modes of a triggered auto-ability, chosen when it is put on the stack (CR 11.8.9–10). */
  | { kind: "triggerTargets"; trigger: string; key: string }
  | { kind: "triggerModes"; trigger: string }
  | { kind: "exBurst"; card: ObjectId }
  | { kind: "exBurstTargets"; card: ObjectId; key: string }
  | { kind: "partyDamage" }
  | { kind: "excessBackups"; player: PlayerId }
  | { kind: "replacementOrder" };

/** CP generated for a payment (CR 11.2.2.2): cards discarded (2 CP each) and Backups dulled (1 CP each). */
export interface Payment {
  /** `as`: the element declared for a Multi-Element card (CR 5.2.1.3). */
  discard?: { card: ObjectId; as?: Element }[];
  dull?: { backup: ObjectId; as?: Element }[];
  crystals?: number;
}

/** Targets chosen by key (CR 11.3.3). */
export type Targets = Record<string, ObjectId[]>;

export type Decision =
  | { type: "keep" }
  | { type: "mulligan" }
  | { type: "pass" }
  /** Cast a card from the hand or the LB deck (CR 11.3, 11.4, 15.2.8); `lbFlip`: LB cards turned face up. */
  | { type: "cast"; card: ObjectId; payment?: Payment; targets?: Targets; modes?: number[]; x?: number; lbFlip?: ObjectId[] }
  /** Use an action or special ability (CR 11.6, 11.7); `special`: the same-name card discarded. */
  | {
      type: "activate";
      source: ObjectId;
      ability: number;
      payment?: Payment;
      special?: ObjectId;
      targets?: Targets;
      modes?: number[];
      x?: number;
    }
  /** One Forward, or two or more for a party. */
  | { type: "attack"; forwards: ObjectId[] }
  | { type: "endAttacks" }
  | { type: "block"; blocker: ObjectId | null }
  | { type: "discard"; cards: ObjectId[] }
  | { type: "choose"; values: ChoiceValue[] }
  | { type: "concede" };

/** A source of CP for a payment. */
export interface CpSource {
  kind: "discard" | "dull";
  id: ObjectId;
  cp: number;
  /** Elements it can give (a Multi-Element card or Backup declares one; `cpAs` adds others). */
  elements: Element[];
}

export interface ChooseOption {
  key: string;
  options: ObjectId[];
  count: number;
  upTo?: boolean;
}

/** A modal Summon or ability: what can be selected, and the targets of each mode. */
export interface ModalOption {
  pick: number;
  upTo?: boolean;
  labels: string[];
  choose: ChooseOption[][];
  /** Modes whose targets exist. */
  available: number[];
}

export type ActionOption =
  | { type: "pass" }
  | {
      type: "cast";
      card: ObjectId;
      from: "hand" | "lb";
      cost: CpCost;
      sources: CpSource[];
      /** A minimal payment the engine accepts. */
      suggested: Payment;
      choose: ChooseOption[];
      modal?: ModalOption;
      /** LB cost (CR 15.2.8.3.2): how many face-down LB cards to turn face up, among which. */
      lb?: { count: number; options: ObjectId[] };
      backAttack?: boolean;
    }
  | {
      type: "activate";
      source: ObjectId;
      ability: number;
      zone: Zone;
      label: string;
      cost: CpCost | null;
      sources: CpSource[];
      suggested: Payment;
      choose: ChooseOption[];
      modal?: ModalOption;
      /** Same-name cards that can be discarded for 《S》. */
      special?: { options: ObjectId[] };
    }
  /** CR 10.1.2.1: Forwards that can attack alone, and the parties that can be formed (by shared element). */
  | { type: "attack"; single: ObjectId[]; parties: { element: Element; members: ObjectId[] }[] }
  | { type: "endAttacks" }
  | { type: "block"; blockers: ObjectId[]; mustBlock: boolean };

/** Display events: the log, the sounds and the animations of the interface. Filtered per player (`filterEvents`). */
export type GameEvent =
  | { type: "gameStart"; firstPlayer: PlayerId }
  | { type: "mulligan"; player: PlayerId }
  | { type: "keep"; player: PlayerId }
  | { type: "turn"; number: number; player: PlayerId }
  | { type: "phase"; phase: Phase; step: AttackStep | null }
  /** `cards`: seen by their owner only. */
  | { type: "draw"; player: PlayerId; count: number; cards?: ObjectId[] }
  | { type: "cast"; player: PlayerId; card: ObjectId; defId: string; from: "hand" | "lb"; stackId?: string }
  /** CP generated for a payment: discarded cards (now in the Break Zone) and dulled Backups. */
  | { type: "cp"; player: PlayerId; discarded: ObjectId[]; dulled: ObjectId[] }
  | { type: "activate"; player: PlayerId; source: ObjectId; defId: string; ability: number; stackId: string }
  | { type: "trigger"; player: PlayerId; source: ObjectId; defId: string; stackId: string }
  | { type: "resolve"; stackId: string; defId: string }
  /** Every chosen target became illegal (CR 11.11.2): nothing happens. */
  | { type: "fizzle"; stackId: string; defId: string }
  | {
      type: "moved";
      id: ObjectId;
      newId: ObjectId | null;
      defId: string;
      owner: PlayerId;
      from: Zone;
      to: Zone;
      /** Broken (CR 15.1.1.3), not just put into the Break Zone. */
      broken?: boolean;
      /** Moved between hidden zones, or face down: the card is hidden from the opponent. */
      hidden?: boolean;
    }
  | { type: "attack"; player: PlayerId; attackers: ObjectId[] }
  | { type: "block"; player: PlayerId; blocker: ObjectId | null }
  | { type: "damage"; target: ObjectId; amount: number; source?: ObjectId; battle: boolean }
  /** Damage to a player: the cards put into their Damage Zone (public). */
  | { type: "playerDamage"; player: PlayerId; amount: number; cards: ObjectId[]; source?: ObjectId }
  | { type: "exBurst"; player: PlayerId; card: ObjectId; defId: string; used: boolean }
  | { type: "dulled"; ids: ObjectId[] }
  | { type: "activated"; ids: ObjectId[] }
  | { type: "frozen"; ids: ObjectId[] }
  | { type: "power"; ids: ObjectId[]; amount: number }
  | { type: "discard"; player: PlayerId; cards: ObjectId[] }
  /** `found`: the revealed card (CR 15.1.1.8.1), or nothing. */
  | { type: "search"; player: PlayerId; found: ObjectId | null }
  /** Cards revealed to everyone, or seen by `to` only ("look at"). */
  | { type: "reveal"; player: PlayerId; cards: ObjectId[]; to?: PlayerId }
  | { type: "shuffle"; player: PlayerId }
  | { type: "lbFlip"; player: PlayerId; cards: ObjectId[] }
  | { type: "crystals"; player: PlayerId; amount: number }
  | { type: "lose"; player: PlayerId; reason: "damage" | "emptyDeck" | "concede" }
  | { type: "gameOver"; winner: PlayerId | "draw" }
  | { type: "choice"; player: PlayerId; intent: ChoiceIntent }
  | { type: "capReached"; cap: string };
