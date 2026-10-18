/**
 * The game flow (CR 9, 10, 11.1): phases and steps, priority, and the loop that advances the game until a player must
 * decide (`advance`, Planecircle's design).
 */
import { attackCandidates, blockCandidates, declareBlock, resolveBattleDamage } from "./attack";
import { ask } from "./choices";
import { continueResolution } from "./effects";
import { RulesError } from "./errors";
import { emit } from "./events";
import { processExBursts } from "./exburst";
import { MAX_FLOW_STEPS } from "./limits";
import { endGame, ruleProcesses } from "./rules";
import { resolveTop } from "./stack";
import { bump, opponentOf } from "./state";
import { msg } from "./text";
import { putTriggersOnStack, rulesEvent } from "./triggers";
import type { GameState, ObjectId, Phase, PlayerId } from "./types";
import { drawCards, fieldOf, moveObject } from "./zones";

const NEXT: Record<Phase, Phase | null> = {
  active: "draw",
  draw: "main1",
  main1: "attack",
  attack: "main2",
  main2: "end",
  end: null,
};

/** CR 9.5.1.2: the hand size. */
export const HAND_SIZE = 5;

export function startTurn(s: GameState, player: PlayerId): void {
  s.turn.number += 1;
  s.turn.active = player;
  s.turn.endLoop = 0;
  s.turnLog = [];
  s.attack = null;
  emit({ type: "turn", number: s.turn.number, player });
  enterPhase(s, "active");
}

export function enterPhase(s: GameState, phase: Phase): void {
  s.turn.phase = phase;
  s.turn.step = phase === "attack" ? "preparation" : null;
  s.priority = { holder: s.turn.active, passes: 0 };
  s.flow = "phaseStart";
}

/** Turn-based actions at the start of a phase (CR 9.1–9.5, 10.1.1), then priority where there is one. */
function phaseStart(s: GameState): void {
  const t = s.turn;
  emit({ type: "phase", phase: t.phase, step: t.step });
  switch (t.phase) {
    case "active": {
      // CR 9.1.1.1: activate every dull card of the turn player, except the frozen ones (15.2.4.2).
      const activated: ObjectId[] = [];
      const thawed: ObjectId[] = [];
      for (const id of fieldOf(s, t.active)) {
        const o = s.objects[id];
        if (!o) continue;
        if (o.frozen) {
          delete o.frozen;
          thawed.push(id);
        } else if (o.dull) {
          o.dull = false;
          activated.push(id);
        }
      }
      if (activated.length || thawed.length) bump(s);
      if (activated.length) emit({ type: "activated", ids: activated });
      s.flow = "phaseEnd";
      return;
    }
    case "draw":
      // CR 9.2.1.1, 9.2.1.3: two cards, one for the first player on their first turn.
      drawCards(s, t.active, t.number === 1 ? 1 : 2);
      s.flow = "phaseEnd";
      return;
    case "main1":
      rulesEvent(s, { e: "phaseStart", phase: "main1", player: t.active });
      s.flow = "priority";
      return;
    case "attack":
      rulesEvent(s, { e: "phaseStart", phase: "attack", player: t.active });
      s.flow = "priority";
      return;
    case "end":
      rulesEvent(s, { e: "phaseStart", phase: "end", player: t.active });
      s.flow = "priority";
      return;
    default:
      s.flow = "priority";
  }
}

/**
 * Priority windows where no Summon, ability or Back Attack can be used (the End Phase, CR 9.5.1.1): nobody is asked
 * (I8); the stack resolves and the phase goes on.
 */
const silentWindow = (s: GameState) => s.turn.phase === "end";

/** CR 11.1.3–4, 12.3: rule processes, EX Bursts, triggers, then the decision of the step or priority. */
function priorityStep(s: GameState): void {
  if (ruleProcesses(s)) return;
  if (processExBursts(s) || s.resolving) return;
  if (putTriggersOnStack(s)) return;
  const t = s.turn;
  if (t.phase === "attack" && s.stack.length === 0) {
    if (t.step === "declaration" && !s.attack) {
      // No Forward can attack: nothing to declare (I8).
      if (!attackCandidates(s, t.active).length) {
        enterPhase(s, "main2");
        return;
      }
      s.pending = { kind: "declareAttack", player: t.active };
      return;
    }
    if (t.step === "block" && s.attack && !s.attack.blockDeclared) {
      const defender = opponentOf(s, t.active);
      if (!blockCandidates(s, defender).length || !s.attack.attackers.length) declareBlock(s, defender, null);
      else {
        s.pending = { kind: "declareBlock", player: defender };
        return;
      }
    }
    // The damage is dealt (unless a question is asked); the next pass of the loop handles triggers and priority.
    if (t.step === "damage" && s.attack && s.attack.damage?.stage !== "done") {
      resolveBattleDamage(s);
      return;
    }
  }
  if (silentWindow(s)) {
    if (s.stack.length) resolveTop(s);
    else s.flow = "phaseEnd";
    return;
  }
  s.pending = { kind: "priority", player: s.priority.holder };
}

/** CR 11.1.6–7: a pass gives priority to the opponent; two passes resolve the top of the stack or end the step. */
export function passPriority(s: GameState, player: PlayerId): void {
  s.priority.passes += 1;
  if (s.priority.passes >= 2) {
    if (s.stack.length) resolveTop(s);
    else s.flow = "phaseEnd";
    return;
  }
  s.priority.holder = opponentOf(s, player);
}

/** The end of a phase or step: the next one. */
function phaseEnd(s: GameState): void {
  const t = s.turn;
  if (t.phase === "attack") {
    // CR 10.1.2–10.1.4.6: declaration, block, damage, then back to declaration (the party disbands).
    if (t.step === "preparation") t.step = "declaration";
    else if (t.step === "declaration") t.step = s.attack ? "block" : t.step;
    else if (t.step === "block") t.step = "damage";
    else if (t.step === "damage") {
      s.attack = null;
      t.step = "declaration";
    }
    s.priority = { holder: t.active, passes: 0 };
    s.flow = "priority";
    emit({ type: "phase", phase: "attack", step: t.step });
    return;
  }
  if (t.phase === "end") {
    endPhase(s);
    return;
  }
  const next = NEXT[t.phase];
  if (next) enterPhase(s, next);
}

/** CR 9.5.1.2–5: discard to the hand size, then the cleanup, repeated while it makes something happen. */
function endPhase(s: GameState): void {
  const t = s.turn;
  if (t.endLoop === 0) {
    t.endLoop = 1;
    const hand = s.players[t.active]?.hand.length ?? 0;
    if (hand > HAND_SIZE) {
      s.pending = { kind: "discard", player: t.active, count: hand - HAND_SIZE };
      return;
    }
  }
  t.endLoop += 1;
  // CR 9.5.1.3: damage removed and "until the end of the turn" effects ended, simultaneously.
  let changed = false;
  for (const id of s.field) {
    const o = s.objects[id];
    if (o?.damage) {
      o.damage = 0;
      delete o.damagedBy;
      changed = true;
    }
  }
  const lasting = s.effects.filter((e) => e.duration !== "endOfTurn");
  if (lasting.length !== s.effects.length) {
    s.effects = lasting;
    changed = true;
  }
  if (changed) bump(s);
  // CR 9.5.1.4: rule processes and triggers; a priority window, then the cleanup again.
  if (ruleProcesses(s)) return;
  if (s.triggers.length || s.stack.length || s.exBursts.length) {
    s.priority = { holder: t.active, passes: 0 };
    s.flow = "priority";
    return;
  }
  startTurn(s, opponentOf(s, t.active));
}

/** CR 9.5.1.2: the cards the turn player discards. */
export function discardToHandSize(s: GameState, player: PlayerId, cards: ObjectId[], count: number): void {
  const hand = s.players[player]?.hand ?? [];
  if (cards.length !== count || new Set(cards).size !== count || cards.some((id) => !hand.includes(id)))
    throw new RulesError(msg("Discard {n} card(s) from your hand", { n: count }));
  const moved = cards.map((id) => moveObject(s, id, "break"));
  emit({ type: "discard", player, cards: moved });
  s.flow = "phaseEnd";
}

/** CR 13.1: a loop no one can stop, the game is a draw. */
export function declareLoopDraw(s: GameState): void {
  endGame(
    s,
    s.playerOrder.map((p) => ({ player: p, reason: "damage" as const })),
  );
}

/** Advances the game until a player must decide (or the game is over). */
export function advance(s: GameState): void {
  for (let steps = 0; !s.pending && !s.over; steps++) {
    if (steps > MAX_FLOW_STEPS) {
      declareLoopDraw(s);
      return;
    }
    switch (s.flow) {
      case "setup":
        setupStep(s);
        break;
      case "phaseStart":
        phaseStart(s);
        break;
      case "priority":
        priorityStep(s);
        break;
      case "resolving":
        if (s.resolving) continueResolution(s);
        else s.flow = "priority";
        break;
      case "phaseEnd":
        phaseEnd(s);
        break;
      case "over":
        return;
    }
  }
}

/** CR 8.2.1.4: mulligans, the first player then the second; then the first turn. */
function setupStep(s: GameState): void {
  const next = s.setup.mulliganQueue[0];
  if (next) {
    s.pending = { kind: "mulligan", player: next };
    return;
  }
  startTurn(s, s.turn.startingPlayer);
}

/** A kept hand. */
export function keepHand(s: GameState, player: PlayerId): void {
  emit({ type: "keep", player });
  s.setup.mulliganQueue = s.setup.mulliganQueue.filter((p) => p !== player);
}

/** CR 8.2.1.4: the 5 cards to the bottom in the order the player chooses (I17), then 5 new cards. */
export function declareMulligan(s: GameState, player: PlayerId): void {
  const pl = s.players[player];
  if (!pl || pl.mulliganed) throw new RulesError(msg("You have already taken your mulligan"));
  ask(
    s,
    player,
    {
      type: "order",
      items: [...pl.hand],
      prompt: msg("Order of the cards put on the bottom of your deck (the first one goes to the bottom first)"),
      intent: "mulliganOrder",
      suggested: [...pl.hand],
      autoOk: true,
    },
    { kind: "mulliganOrder" },
  );
}

export function answerMulliganOrder(s: GameState, player: PlayerId, order: ObjectId[]): void {
  const pl = s.players[player];
  if (!pl) return;
  for (const id of order) moveObject(s, id, "deck", { position: "bottom" });
  pl.mulliganed = true;
  emit({ type: "mulligan", player });
  drawCards(s, player, 5);
  s.setup.mulliganQueue = s.setup.mulliganQueue.filter((p) => p !== player);
}
