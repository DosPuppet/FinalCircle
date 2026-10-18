/**
 * Staged game (tutorial; from Planecircle): from the description by card numbers (`ScenarioSpec`) to the engine's
 * game. Pure: used by the worker (definitions received in "start") and by the tests (whole card database).
 */
import { aiAgent, scriptedAgent } from "@finalcircle/ai";
import { type Agent, type CardDef, createScenario, type ScenarioPlayer, type StepResult } from "@finalcircle/engine";
import type { ScenarioSide, ScenarioSpec } from "./protocol";

export const YOU = "p1";
export const OPPONENT = "p2";
/** Thinking budget of the AI in the browser: in time, for the same latency whatever the machine. */
export const AI_BUDGET = { ms: 700 } as const;

/** Every card number of a scenario (to send their definitions). */
export function scenarioCards(spec: ScenarioSpec): string[] {
  return [spec.you, spec.opponent].flatMap((side) => [
    ...side.deck,
    ...side.hand,
    ...(side.breakZone ?? []),
    ...(side.damage ?? []),
    ...(side.lb ?? []),
    ...(side.field ?? []).map((f) => (typeof f === "string" ? f : f.card)),
  ]);
}

function player(id: string, fallbackName: string, side: ScenarioSide, def: (code: string) => CardDef): ScenarioPlayer {
  return {
    id,
    name: side.name ?? fallbackName,
    deck: side.deck.map(def),
    hand: side.hand.map(def),
    breakZone: (side.breakZone ?? []).map(def),
    damage: (side.damage ?? []).map(def),
    lb: (side.lb ?? []).map((code) => ({ def: def(code) })),
    field: (side.field ?? []).map((f) =>
      typeof f === "string"
        ? { def: def(f) }
        : {
            def: def(f.card),
            ...(f.dull ? { dull: true } : {}),
            ...(f.sick ? { sick: true } : {}),
            ...(f.damage ? { damage: f.damage } : {}),
          },
    ),
  };
}

export function buildScenario(
  spec: ScenarioSpec,
  def: (code: string) => CardDef,
  seed: number,
  /** Default names of the two sides; the interface passes them in its language. */
  playerName = "You",
  opponentName = "Opponent",
): StepResult & { opponent: Agent } {
  const game = createScenario({
    seed,
    active: spec.active === "you" ? YOU : OPPONENT,
    ...(spec.turn ? { turn: spec.turn } : {}),
    ...(spec.phase ? { phase: spec.phase } : {}),
    players: [player(YOU, playerName, spec.you, def), player(OPPONENT, opponentName, spec.opponent, def)],
  });
  const opponent =
    typeof spec.opponentPlays === "string"
      ? aiAgent(spec.opponentPlays, { seed, budget: AI_BUDGET, fair: true })
      : scriptedAgent(spec.opponentPlays);
  return { ...game, opponent };
}
