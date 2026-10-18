/**
 * "Arena-style" autopilot (from Planecircle): answers trivial decisions on behalf of the player. The engine stays
 * strict; this layer is what makes the game flow.
 */
import { meaningfulActions } from "./legal";
import type { AttackStep, Decision, GameState, Phase, PlayerId } from "./types";

/** Where the autopilot stops: a phase, or a step of the Attack Phase. */
export type Stop = Phase | AttackStep;

export interface AutopilotSettings {
  /** Disables all automation: the player receives every priority and every choice. */
  fullControl: boolean;
  /** Phases and steps where we stop (if there is something to do), during one's own turn and the opponent's. */
  stops: { own: Stop[]; opponent: Stop[] };
  /** "End turn": pass every priority until the end of the given turn. */
  passUntilTurn: number | null;
  /** "End turn": soft pass (an opponent's Summon or ability gives control back) or hard pass. */
  passMode?: "soft" | "hard";
  /** An opponent's Summon or ability on the stack: give control back so that the interface shows it. */
  revealOpponentStack?: boolean;
  /** Hold priority on one's own Summons and abilities (to respond to them oneself). */
  holdPriority?: boolean;
}

export const DEFAULT_AUTOPILOT: AutopilotSettings = {
  fullControl: false,
  stops: { own: ["main1", "main2"], opponent: [] },
  passUntilTurn: null,
  revealOpponentStack: true,
};

const stopOf = (s: GameState): Stop => (s.turn.phase === "attack" && s.turn.step ? s.turn.step : s.turn.phase);

export function autopilotDecision(s: GameState, player: PlayerId, settings: AutopilotSettings): Decision | null {
  const p = s.pending;
  if (!p || p.player !== player || s.over) return null;
  const passingTurn = settings.passUntilTurn === s.turn.number;
  if (p.kind === "declareAttack") return passingTurn ? { type: "endAttacks" } : null;
  if (p.kind === "choice") {
    if (!p.request.autoOk || settings.fullControl) return null;
    return { type: "choose", values: p.request.suggested };
  }
  if (p.kind !== "priority") return null;
  const top = s.stack[s.stack.length - 1];
  // "End turn" is an explicit request: it also holds in full control; a soft pass stops on an opponent's item.
  if (passingTurn) return settings.passMode !== "hard" && top && top.controller !== player ? null : { type: "pass" };
  if (settings.fullControl) return null;
  // Opponent's Summon or ability: the player must see it, even with no possible response.
  if (top && top.controller !== player && settings.revealOpponentStack) return null;
  // Own turn, empty stack, Main Phase 2: we always stop; the player ends their turn themselves.
  if (!top && s.turn.active === player && s.turn.phase === "main2") return null;
  if (meaningfulActions(s, player).length === 0) return { type: "pass" };
  if (top) return top.controller === player && !settings.holdPriority ? { type: "pass" } : null;
  const stops = s.turn.active === player ? settings.stops.own : settings.stops.opponent;
  return stops.includes(stopOf(s)) ? null : { type: "pass" };
}
