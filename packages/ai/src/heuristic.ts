/**
 * Heuristic decisions (Planecircle's design): every option is tried on a copy and played out a little with the fast
 * policy, then the resulting position is evaluated; the best one is taken. Combat is in `combat.ts`.
 */
import {
  type ChoiceRequest,
  type ChoiceValue,
  chars,
  type Decision,
  fallbackDecision,
  type GameState,
  legalActions,
  type PlayerId,
} from "@finalcircle/engine";
import { chooseAttack, chooseBlock } from "./combat";
import { evaluate, onlyRulesErrors, step, trySubmit } from "./evaluate";
import { decisionFor } from "./options";
import { fastPolicy } from "./policy";
import type { Profile } from "./profile";
import { pick, sample } from "./random";

const policy = fastPolicy();

/**
 * Plays on with the fast policy until `stop` holds (or the game ends, or `horizon` decisions). The state is modified.
 */
export function playOn(s: GameState, stop: (s: GameState) => boolean, horizon = 60): GameState {
  for (let i = 0; i < horizon && !s.over && s.pending && !stop(s); i++) {
    const p = s.pending;
    try {
      step(s, p.player, policy(s, p.player), true);
    } catch (e) {
      onlyRulesErrors(e);
      try {
        step(s, p.player, fallbackDecision(s, p), true);
      } catch (e2) {
        onlyRulesErrors(e2);
        break;
      }
    }
  }
  return s;
}

/** After a decision of `me`: until the stack is empty and `me` decides again, or the phase changes. */
export function settleFor(s: GameState, me: PlayerId): GameState {
  const phase = s.turn.phase;
  const turn = s.turn.number;
  return playOn(
    s,
    (x) =>
      x.turn.number !== turn ||
      x.turn.phase !== phase ||
      (x.stack.length === 0 && x.pending?.player === me && x.pending.kind !== "choice"),
  );
}

/** The value of a decision: applied, played on, evaluated (null if the engine refuses it). */
export function scoreDecision(s: GameState, me: PlayerId, d: Decision): number | null {
  const next = trySubmit(s, me, d);
  return next ? evaluate(settleFor(next, me), me) : null;
}

export interface PriorityOptions {
  baseline: number;
  options: { decision: Decision; score: number }[];
  /** A single sensible decision. */
  forced?: Decision;
}

/** Candidate decisions of a priority, with their one-move scores; null when there is nothing but passing. */
export function priorityOptions(s: GameState, me: PlayerId, pr: Profile): PriorityOptions | null {
  const actions = legalActions(s, me).filter((o) => o.type !== "pass");
  if (!actions.length) return null;
  const baseline = scoreDecision(s, me, { type: "pass" }) ?? evaluate(s, me);
  const options: { decision: Decision; score: number }[] = [];
  for (const o of actions) {
    if (pr.outOfTime()) break;
    // A few variants of targets and modes; the first is the deterministic one.
    const tries = [decisionFor(o), ...Array.from({ length: 3 }, () => decisionFor(o, pr.rand))];
    const seen = new Set<string>();
    for (const d of tries) {
      const key = JSON.stringify(d);
      if (seen.has(key)) continue;
      seen.add(key);
      const score = scoreDecision(s, me, d);
      if (score !== null) options.push({ decision: d, score });
    }
  }
  return { baseline, options };
}

/** Candidate answers to a question: every option of a single pick, otherwise a sample. */
function candidateAnswers(req: ChoiceRequest, rand: () => number): ChoiceValue[][] {
  const out: ChoiceValue[][] = [req.suggested];
  if (req.type === "pick") {
    if (req.max === 1 && req.min <= 1) for (const o of req.options) out.push([o]);
    if (req.min === 0) out.push([]);
    for (let i = 0; i < 8; i++) {
      const n = req.min + Math.floor(rand() * (req.max - req.min + 1));
      out.push(sample(rand, req.options, n));
    }
  } else if (req.type === "yesNo") out.push([1], [0]);
  else if (req.type === "divide") {
    const step = req.step ?? 1;
    // Everything on one member, or split evenly in steps.
    for (let i = 0; i < req.among.length; i++) out.push(req.among.map((_x, k) => (k === i ? req.total : 0)));
    const each = Math.floor(req.total / req.among.length / step) * step;
    out.push(req.among.map((_x, k) => (k === 0 ? req.total - each * (req.among.length - 1) : each)));
  }
  return out;
}

/** The answer to a question: the suggested one for orders, the best simulated one otherwise. */
function answer(s: GameState, me: PlayerId, req: ChoiceRequest, pr: Profile): ChoiceValue[] {
  if (req.type === "order" || req.type === "number") return req.suggested;
  if (pr.sloppiness && pr.rand() < pr.sloppiness) return req.suggested;
  let best = req.suggested;
  let bestScore = Number.NEGATIVE_INFINITY;
  const seen = new Set<string>();
  for (const values of candidateAnswers(req, pr.rand)) {
    const key = JSON.stringify(values);
    if (seen.has(key)) continue;
    seen.add(key);
    const score = scoreDecision(s, me, { type: "choose", values });
    if (score !== null && score > bestScore) {
      bestScore = score;
      best = values;
    }
  }
  return best;
}

/** A card's value in hand (the cheapest to discard first). */
function cardValue(s: GameState, id: string): number {
  const c = chars(s, id);
  return c.cost + (c.type === "Forward" ? 1 : 0) + (s.defs[s.objects[id]?.defId ?? ""]?.exBurst ? 0.5 : 0);
}

function keepHand(s: GameState, me: PlayerId, pr: Profile): boolean {
  if (pr.mulligan === "loose") return true;
  const hand = s.players[me]?.hand ?? [];
  const types = hand.map((id) => chars(s, id).type);
  const cheap = hand.filter((id) => chars(s, id).cost <= 3).length;
  return types.includes("Forward") && cheap >= 2;
}

export function decide(s: GameState, me: PlayerId, pr: Profile): Decision {
  const p = s.pending;
  if (!p || p.player !== me) return { type: "pass" };
  switch (p.kind) {
    case "mulligan":
      return keepHand(s, me, pr) || s.players[me]?.mulliganed ? { type: "keep" } : { type: "mulligan" };
    case "discard": {
      const hand = [...(s.players[me]?.hand ?? [])].sort((a, b) => cardValue(s, a) - cardValue(s, b));
      return { type: "discard", cards: hand.slice(0, p.count) };
    }
    case "choice":
      return { type: "choose", values: answer(s, me, p.request, pr) };
    case "declareAttack":
      return chooseAttack(s, me, pr);
    case "declareBlock":
      return chooseBlock(s, me, pr);
    case "priority": {
      if (!pr.responds && (s.turn.active !== me || s.stack.length)) return { type: "pass" };
      if (pr.forgetfulness && pr.rand() < pr.forgetfulness) return { type: "pass" };
      const found = priorityOptions(s, me, pr);
      if (!found?.options.length) return { type: "pass" };
      const better = found.options.filter((o) => o.score > found.baseline + 0.5);
      if (!better.length) return { type: "pass" };
      if (pr.sloppiness && pr.rand() < pr.sloppiness) return (pick(pr.rand, better) ?? better[0])?.decision ?? { type: "pass" };
      return better.sort((a, b) => b.score - a.score)[0]?.decision ?? { type: "pass" };
    }
  }
}
