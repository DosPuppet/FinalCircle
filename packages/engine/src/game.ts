/**
 * Public API of the engine (from Planecircle): game creation and submission of decisions. Each call returns a new
 * state (working copy, the received state is never modified) and the events produced.
 */

// The effect handlers (ops/*.ts) register themselves here: effects.ts does not import them (opRegistry.ts).
import "./ops/index";
import { answerPartySplit, declareAttack, declareBlock } from "./attack";
import { ask, divisionOf, validateChoice } from "./choices";
import { checkDecisionShape } from "./decisionShape";
import { answerResolutionChoice } from "./effects";
import { RulesError } from "./errors";
import { collectEvents, emit } from "./events";
import { answerExBurst, answerExBurstModes, answerExBurstTargets } from "./exburst";
import { outcomeHash } from "./fingerprint";
import { LOOP_LIMIT, LOOP_SUSPECT } from "./limits";
import { answerExcessBackups, endGame } from "./rules";
import { activateAbility, castCard } from "./stack";
import { cloneState, opponentOf, random, registerDef, shuffle } from "./state";
import { msg } from "./text";
import { answerTriggerModes, answerTriggerOrder, answerTriggerTargets } from "./triggers";
import {
  advance,
  answerMulliganOrder,
  declareLoopDraw,
  declareMulligan,
  discardToHandSize,
  enterPhase,
  keepHand,
  passPriority,
} from "./turn";
import type { CardDef, Decision, GameEvent, GameState, PlayerId } from "./types";
import { createObject, drawCards } from "./zones";

export interface PlayerSetup {
  id: PlayerId;
  name: string;
  /** The main deck (CR 8.1.1.1), in any order (it is shuffled). */
  deck: CardDef[];
  /** The LB deck (CR 8.1.3), face down. */
  lb?: CardDef[];
}

export interface GameOptions {
  seed: number;
  /** Two players (CR 1.1). */
  players: PlayerSetup[];
  /** Who plays first; otherwise a random player chooses (CR 8.2.1.2). */
  startingPlayer?: PlayerId;
}

export interface StepResult {
  state: GameState;
  events: GameEvent[];
}

/** Empty state of a game: the players, without any card (shared by `createGame` and `createScenario`). */
export function blankState(opts: { seed: number; players: { id: PlayerId; name: string }[] }): GameState {
  if (opts.players.length !== 2) throw new Error("FFTCG is played by two players (CR 1.1)");
  const first = opts.players[0] as { id: PlayerId };
  const s: GameState = {
    version: 0,
    rng: opts.seed | 0,
    idCounters: {},
    timestamp: 0,
    defs: {},
    objects: {},
    players: {},
    playerOrder: opts.players.map((p) => p.id),
    field: [],
    stack: [],
    turn: { number: 0, active: first.id, phase: "active", step: null, startingPlayer: first.id, endLoop: 0 },
    flow: "setup",
    priority: { holder: first.id, passes: 0 },
    attack: null,
    effects: [],
    triggers: [],
    exBursts: [],
    pending: null,
    resolving: null,
    setup: { chooser: first.id, mulliganQueue: [] },
    lki: {},
    turnLog: [],
    winner: null,
    over: false,
  };
  for (const p of opts.players)
    s.players[p.id] = {
      id: p.id,
      name: p.name,
      deck: [],
      hand: [],
      breakZone: [],
      damage: [],
      removed: [],
      lb: [],
      crystals: 0,
      mulliganed: false,
      lost: false,
      drewFromEmpty: false,
      damagedFromEmpty: false,
    };
  return s;
}

/** CR 8.2.1.3–4: the first player is known; each player draws 5, then the mulligans, the first player first. */
function setFirstPlayer(s: GameState, first: PlayerId): void {
  s.turn.startingPlayer = first;
  s.turn.active = first;
  emit({ type: "gameStart", firstPlayer: first });
  for (const p of s.playerOrder) drawCards(s, p, 5);
  s.setup.mulliganQueue = [first, opponentOf(s, first)];
  s.flow = "setup";
}

export function createGame(opts: GameOptions): StepResult {
  const [state, events] = collectEvents(() => {
    const s = blankState(opts);
    for (const p of opts.players) {
      for (const card of p.deck) {
        registerDef(s, card);
        createObject(s, card.id, p.id, "deck");
      }
      shuffle(s, s.players[p.id]?.deck ?? []);
      // CR 8.2.1.1: LB decks face down, not shuffled.
      for (const card of p.lb ?? []) {
        registerDef(s, card);
        createObject(s, card.id, p.id, "lb", { faceDown: true });
      }
    }
    if (opts.startingPlayer) setFirstPlayer(s, opts.startingPlayer);
    else {
      // CR 8.2.1.2: a randomly chosen player decides who plays first.
      const chooser = s.playerOrder[Math.floor(random(s) * s.playerOrder.length)] as PlayerId;
      s.setup.chooser = chooser;
      ask(
        s,
        chooser,
        { type: "yesNo", prompt: msg("Do you want to play first?"), intent: "firstPlayer", suggested: [1] },
        { kind: "firstPlayer" },
      );
    }
    advance(s);
    return s;
  });
  return { state, events };
}

function expect<T extends Decision["type"]>(d: Decision, ...types: T[]): asserts d is Extract<Decision, { type: T }> {
  if (!types.includes(d.type as T)) throw new RulesError(msg("Unexpected decision: {type}", { type: d.type }));
}

function apply(s: GameState, submitter: PlayerId, d: Decision): void {
  checkDecisionShape(s, d);
  if (d.type === "concede") {
    // CR 2.1: a player may concede at any time.
    if (!s.over && s.players[submitter]) endGame(s, [{ player: submitter, reason: "concede" }]);
    return;
  }
  const p = s.pending;
  if (s.over || !p) throw new RulesError(msg("No decision pending"));
  if (p.player !== submitter) throw new RulesError(msg("It is not your decision to make"));
  const player = p.player;
  // The pending decision is consumed before applying the answer: the handler can set the next one.
  s.pending = null;
  switch (p.kind) {
    case "mulligan":
      expect(d, "keep", "mulligan");
      if (d.type === "keep") keepHand(s, player);
      else declareMulligan(s, player);
      return;
    case "declareAttack":
      expect(d, "attack", "endAttacks");
      if (d.type === "attack") {
        declareAttack(s, player, d.forwards);
        s.priority = { holder: s.turn.active, passes: 0 };
        s.flow = "priority";
      } else enterPhase(s, "main2");
      return;
    case "declareBlock":
      expect(d, "block");
      declareBlock(s, player, d.blocker);
      s.priority = { holder: s.turn.active, passes: 0 };
      s.flow = "priority";
      return;
    case "discard":
      expect(d, "discard");
      discardToHandSize(s, player, d.cards, p.count);
      return;
    case "priority":
      expect(d, "pass", "cast", "activate");
      if (d.type === "pass") passPriority(s, player);
      else if (d.type === "cast") castCard(s, player, d);
      else activateAbility(s, player, d);
      return;
    case "choice": {
      expect(d, "choose");
      validateChoice(p.request, d.values);
      emit({ type: "choice", player, intent: p.request.intent });
      const values = d.values;
      const ids = values.map(String);
      const purpose = p.purpose;
      switch (purpose.kind) {
        case "effect":
          answerResolutionChoice(s, values);
          return;
        case "firstPlayer":
          setFirstPlayer(s, values[0] === 1 ? player : opponentOf(s, player));
          return;
        case "mulliganOrder":
          answerMulliganOrder(s, player, ids);
          return;
        case "triggerOrder":
          answerTriggerOrder(s, purpose.player, ids);
          return;
        case "triggerModes":
          answerTriggerModes(s, purpose.trigger, ids.map(Number));
          return;
        case "triggerTargets":
          answerTriggerTargets(s, purpose.trigger, purpose.key, ids);
          return;
        case "exBurst":
          answerExBurst(s, purpose.card, values[0] === 1);
          return;
        case "exBurstModes":
          answerExBurstModes(s, purpose.card, ids.map(Number));
          return;
        case "exBurstTargets":
          answerExBurstTargets(s, purpose.card, purpose.key, ids);
          return;
        case "partyDamage":
          if (p.request.type !== "divide") throw new RulesError(msg("Division expected"));
          answerPartySplit(s, divisionOf(p.request, values));
          return;
        case "excessBackups":
          answerExcessBackups(s, ids);
          return;
        case "replacementOrder":
          return;
      }
    }
  }
}

/**
 * Applies a player's decision then advances the game until the next decision. Throws a RulesError if the decision
 * is illegal (the original state stays unchanged, CR 14).
 */
export function submit(state: GameState, player: PlayerId, decision: Decision): StepResult {
  const [next, events] = collectEvents(() => {
    const s = cloneState(state);
    const stacked = s.stack.length > 0;
    apply(s, player, decision);
    advance(s);
    watchLoop(s, decision, stacked);
    return s;
  });
  return { state: next, events };
}

/**
 * CR 13.1: a loop of mandatory actions. While the players only pass (or answer the choices of the loop) with a
 * non-empty stack, the passes are counted; beyond `LOOP_SUSPECT`, the canonical fingerprint is recorded: the same one
 * three times, or more than `LOOP_LIMIT` passes, and the game is a draw.
 */
function watchLoop(s: GameState, d: Decision, stacked: boolean): void {
  if (s.over) return;
  if (d.type === "choose" && s.loop && s.stack.length > 0) return;
  if (d.type !== "pass" || !stacked || s.stack.length === 0) {
    s.loop = undefined;
    return;
  }
  s.loop ??= { passes: 0, seen: [] };
  const loop = s.loop;
  loop.passes += 1;
  if (loop.passes > LOOP_LIMIT) {
    declareLoopDraw(s);
    return;
  }
  if (loop.passes < LOOP_SUSPECT) return;
  const h = outcomeHash(s);
  if (loop.seen.filter((x) => x === h).length >= 2) {
    declareLoopDraw(s);
    return;
  }
  loop.seen.push(h);
}

/**
 * Copy-free variant, reserved for simulations (AI) on a working copy obtained by `cloneState`. Warning: if the
 * decision is illegal, the state may remain half modified.
 */
export function applyMutable(s: GameState, player: PlayerId, decision: Decision): void {
  collectEvents(() => {
    const stacked = s.stack.length > 0;
    apply(s, player, decision);
    advance(s);
    watchLoop(s, decision, stacked);
  });
}

/** CR 13.1: the host notices a loop of automatic decisions; the game is a draw. */
export function drawByLoop(state: GameState): StepResult {
  const [next, events] = collectEvents(() => {
    const s = cloneState(state);
    declareLoopDraw(s);
    return s;
  });
  return { state: next, events };
}
