/**
 * Tutorial, pure part (from Planecircle): lesson format, allowed decisions (strict guidance), end-of-step predicates
 * and the solver (the decision a step expects, for the tests). No dependency on the DOM or the store. Cards are named
 * by their card number (two cards can share a name: Zack and the Limit Break Zack).
 */
import type {
  AutopilotSettings,
  ChooseOption,
  Decision,
  GameEvent,
  GameView,
  ObjectId,
  ObjectView,
  Phase,
} from "@finalcircle/engine";
import type { ScenarioSpec } from "../protocol";

/** A decision of the player, or "until the end of the turn" (`endTurn`, handed to the autopilot). */
export type PlayerIntent = Decision | { type: "endTurn" };

/** Interface element to circle (`data-tuto` of the board), or a card by its number. */
export type Target =
  | "myDamage"
  | "oppDamage"
  | "myForwards"
  | "myBackups"
  | "oppForwards"
  | "hand"
  | "myDeck"
  | "myBreak"
  | "myLb"
  | "phases"
  | "stack"
  | "mainButton"
  | "endTurn"
  | "preview"
  | "log"
  | "payment"
  | "attackInfo"
  | { card: string; zone?: "hand" | "field" | "stack"; owner?: "you" | "opponent" };

/** A decision allowed during a step. Cards and targets are card numbers. */
export type Allow =
  | { cast: string; target?: string }
  /** `ability`: its index on the card, when the card has several. */
  | { activate: string; ability?: number; target?: string }
  | { attack: string[] }
  | { block: string | null }
  /** For the solver only (answers are always allowed): yes, no, or the cards to pick. */
  | { choose: "yes" | "no" | string[] }
  | "pass"
  | "endTurn"
  | "endAttacks"
  | "keep";

export interface Ctx {
  view: GameView;
  /** Events of the last update. */
  events: GameEvent[];
  /** Card number of the card shown in the preview (hover or long press). */
  hovered: string | null;
}

export interface Tip {
  when: (c: Ctx) => boolean;
  /** A `msg` literal, translated on display. */
  text: string;
}

export interface Step {
  /** `msg` literals, translated on display. */
  text: string | ((c: Ctx) => string);
  target?: Target;
  /** Explanation: "Next" button, opponent paused. */
  next?: true;
  /** End condition of the step (without `next`). */
  until?: (c: Ctx) => boolean;
  /** Decisions accepted during the step (strict guidance). */
  allow?: Allow[];
  /** Reminder shown when the player does something else. */
  hint?: string;
  /** Free play: every decision is allowed, the guide gives tips (`tips`). */
  free?: true;
  tips?: Tip[];
  /** Autopilot settings applied when entering the step. */
  settings?: Partial<AutopilotSettings>;
}

export interface Lesson {
  id: string;
  /** `msg` literals, translated on display. */
  title: string;
  summary: string;
  scenario: ScenarioSpec;
  steps: Step[];
}

// ---------------------------------------------------------------------------
// Reading the view
// ---------------------------------------------------------------------------

export type Who = "you" | "opponent";

const playerId = (v: GameView, who: Who): string => (who === "you" ? v.viewer : v.opponent);

/** Every card the view shows. */
const objects = (v: GameView): ObjectView[] => [
  ...v.hand,
  ...v.field,
  ...Object.values(v.players).flatMap((p) => [...p.breakZone, ...p.damage, ...p.removed, ...p.lb]),
  ...(v.pending?.kind === "choice" ? (v.pending.objects ?? []) : []),
];

const defOf = (v: GameView, id: ObjectId | null | undefined): string | undefined =>
  id ? objects(v).find((o) => o.id === id)?.defId : undefined;

const sameSet = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");

// ---------------------------------------------------------------------------
// Strict guidance: is the player's decision the one the step expects?
// ---------------------------------------------------------------------------

/** `partial`: a casting that is just starting (its targets are not chosen yet). */
export function matches(allow: Allow, intent: PlayerIntent, v: GameView, partial = false): boolean {
  if (typeof allow === "string") return intent.type === allow;
  if ("choose" in allow) return intent.type === "choose";
  if ("cast" in allow || "activate" in allow) {
    const ok =
      "cast" in allow
        ? intent.type === "cast" && defOf(v, intent.card) === allow.cast
        : intent.type === "activate" &&
          defOf(v, intent.source) === allow.activate &&
          (allow.ability === undefined || intent.ability === allow.ability);
    if (!ok || partial || !allow.target || (intent.type !== "cast" && intent.type !== "activate")) return ok;
    return Object.values(intent.targets ?? {})
      .flat()
      .some((id) => defOf(v, id) === allow.target);
  }
  if ("attack" in allow)
    return (
      intent.type === "attack" &&
      sameSet(
        intent.forwards.map((id) => defOf(v, id) ?? ""),
        allow.attack,
      )
    );
  if ("block" in allow)
    return intent.type === "block" && (allow.block === null ? intent.blocker === null : defOf(v, intent.blocker) === allow.block);
  return false;
}

/** Decisions always allowed: answering a question of the engine, discarding at the end of the turn, conceding. */
export function alwaysAllowed(intent: PlayerIntent): boolean {
  return intent.type === "choose" || intent.type === "discard" || intent.type === "concede";
}

// ---------------------------------------------------------------------------
// Solver: the decision that completes a step (tests)
// ---------------------------------------------------------------------------

function pickTargets(choose: ChooseOption[], want: string | undefined, v: GameView): Record<string, ObjectId[]> {
  const out: Record<string, ObjectId[]> = {};
  choose.forEach((c, i) => {
    const wanted = i === 0 && want ? c.options.find((id) => defOf(v, id) === want) : undefined;
    out[c.key] = wanted ? [wanted] : c.upTo ? [] : c.options.slice(0, Math.min(c.count, c.options.length));
  });
  return out;
}

export function solve(allow: Allow, v: GameView): PlayerIntent | null {
  const p = v.pending;
  if (!p || p.player !== v.viewer) return null;
  if (allow === "keep") return p.kind === "mulligan" ? { type: "keep" } : null;
  if (allow === "endAttacks") return p.kind === "declareAttack" ? { type: "endAttacks" } : null;
  if (allow === "endTurn") return p.kind === "priority" || p.kind === "declareAttack" ? { type: "endTurn" } : null;
  if (allow === "pass") return p.kind === "priority" ? { type: "pass" } : null;
  if ("choose" in allow) {
    if (p.kind !== "choice" || !p.request) return null;
    const req = p.request;
    if (req.type === "yesNo") return { type: "choose", values: [allow.choose === "no" ? 0 : 1] };
    if (req.type === "pick" && Array.isArray(allow.choose)) {
      const wanted = allow.choose;
      const picked = req.options.filter((id) => wanted.includes(defOf(v, id) ?? "")).slice(0, req.max);
      if (picked.length >= req.min) return { type: "choose", values: picked };
    }
    return { type: "choose", values: req.suggested };
  }
  if ("attack" in allow) {
    if (p.kind !== "declareAttack") return null;
    const pool = [...new Set([...(p.single ?? []), ...(p.parties ?? []).flatMap((g) => g.members)])];
    const forwards: ObjectId[] = [];
    for (const code of allow.attack) {
      const id = pool.find((x) => !forwards.includes(x) && defOf(v, x) === code);
      if (!id) return null;
      forwards.push(id);
    }
    return { type: "attack", forwards };
  }
  if ("block" in allow) {
    if (p.kind !== "declareBlock") return null;
    if (allow.block === null) return { type: "block", blocker: null };
    const blocker = (p.blockers ?? []).find((id) => defOf(v, id) === allow.block);
    return blocker ? { type: "block", blocker } : null;
  }
  if (p.kind !== "priority") return null;
  const actions = p.actions ?? [];
  if ("cast" in allow) {
    const o = actions.find((a) => a.type === "cast" && defOf(v, a.card) === allow.cast);
    if (o?.type !== "cast") return null;
    const modes = o.modal ? o.modal.available.slice(0, o.modal.pick) : undefined;
    const choose = o.modal && modes ? modes.flatMap((m) => o.modal?.choose[m] ?? []) : o.choose;
    return {
      type: "cast",
      card: o.card,
      payment: o.suggested,
      targets: pickTargets(choose, allow.target, v),
      ...(modes ? { modes } : {}),
      ...(o.lb ? { lbFlip: o.lb.options.slice(0, o.lb.count) } : {}),
    };
  }
  const o = actions.find(
    (a) =>
      a.type === "activate" &&
      defOf(v, a.source) === allow.activate &&
      (allow.ability === undefined || a.ability === allow.ability),
  );
  if (o?.type !== "activate") return null;
  const modes = o.modal ? o.modal.available.slice(0, o.modal.pick) : undefined;
  const choose = o.modal && modes ? modes.flatMap((m) => o.modal?.choose[m] ?? []) : o.choose;
  return {
    type: "activate",
    source: o.source,
    ability: o.ability,
    payment: o.suggested,
    targets: pickTargets(choose, allow.target, v),
    ...(modes ? { modes } : {}),
    ...(o.special ? { special: o.special.options[0] as ObjectId } : {}),
  };
}

// ---------------------------------------------------------------------------
// Step predicates
// ---------------------------------------------------------------------------

export const onField =
  (code: string, who: Who = "you") =>
  (c: Ctx) =>
    c.view.field.some((o) => o.defId === code && o.controller === playerId(c.view, who));

export const inBreakZone =
  (code: string, who: Who = "you") =>
  (c: Ctx) =>
    (c.view.players[playerId(c.view, who)]?.breakZone ?? []).some((o) => o.defId === code);

export const damageOf = (c: Ctx, who: Who) => c.view.players[playerId(c.view, who)]?.damage.length ?? 0;

export const onStack = (code: string) => (c: Ctx) => c.view.stack.some((it) => it.defId === code);

export const stackEmpty = (c: Ctx) => c.view.stack.length === 0;

/** A pending decision of the player, of a given kind. */
export const pendingMine = (kind: string) => (c: Ctx) => c.view.pending?.player === c.view.viewer && c.view.pending.kind === kind;

/** The player has priority during their own turn, in this phase. */
export const myPhase = (phase: Phase) => (c: Ctx) =>
  c.view.turn.active === c.view.viewer && c.view.turn.phase === phase && pendingMine("priority")(c);

export const hovered = (code?: string) => (c: Ctx) => (code ? c.hovered === code : c.hovered !== null);

export const gameOver = (c: Ctx) => c.view.over;

/** The game has moved past turn n. */
export const pastTurn = (n: number) => (c: Ctx) => c.view.turn.number > n;

export const all =
  (...preds: ((c: Ctx) => boolean)[]) =>
  (c: Ctx) =>
    preds.every((p) => p(c));

export const stepText = (s: Step, c: Ctx | null): string => (typeof s.text === "string" ? s.text : c ? s.text(c) : "");
