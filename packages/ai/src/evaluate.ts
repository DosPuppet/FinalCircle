/**
 * Evaluation of a position for a player, and the simulation helpers of the AI (Planecircle's design, FFTCG content).
 * Higher is better for `me`; a won game is worth +1e6.
 */
import {
  applyMutable,
  chars,
  cloneState,
  type Decision,
  type GameState,
  opponentOf,
  type PlayerId,
  RulesError,
} from "@finalcircle/engine";

/** What 0 to 6 damage cost: the seventh loses (CR 3.1.1), the last ones weigh more. */
const DAMAGE = [0, 5, 11, 18, 27, 39, 56, 1000];

/** The value of a player's side. */
function side(s: GameState, p: PlayerId): number {
  const pl = s.players[p];
  if (!pl) return 0;
  let v = -(DAMAGE[Math.min(7, pl.damage.length)] ?? 1000);
  for (const id of s.field) {
    const o = s.objects[id];
    if (!o || o.controller !== p) continue;
    const c = chars(s, id);
    if (c.type === "Forward") {
      const power = Math.max(0, c.power);
      v += 3 + (power / 1000) * 2.2;
      if (c.keywords.includes("brave")) v += 1.5;
      if (c.keywords.includes("firstStrike")) v += 1.5;
      if (c.flags.includes("cantBeBroken")) v += 1;
      // Damage stays until the End Phase: a damaged Forward breaks more easily.
      v -= (o.damage / 1000) * 0.6;
    } else if (c.type === "Backup") v += 6 + (o.dull ? 0 : 0.5);
    else v += 4;
  }
  v += pl.hand.length * 3.5;
  v += pl.lb.filter((id) => s.objects[id]?.faceDown).length * 1.2;
  v += pl.crystals;
  // A main deck that runs out loses (CR 3.1.2).
  if (pl.deck.length < 5) v -= (5 - pl.deck.length) * 4;
  return v;
}

export function evaluate(s: GameState, me: PlayerId): number {
  if (s.over) return s.winner === me ? 1e6 : s.winner === "draw" ? 0 : -1e6;
  return side(s, me) - side(s, opponentOf(s, me));
}

/** Only rules errors are expected from a simulated decision; any other error is an engine bug. */
export function onlyRulesErrors(e: unknown): void {
  if (!(e instanceof RulesError)) throw e;
}

/** Applies a decision on a copy (or on `s` itself, `mutable`). */
export function step(s: GameState, player: PlayerId, d: Decision, mutable = false): GameState {
  const c = mutable ? s : cloneState(s);
  applyMutable(c, player, d);
  return c;
}

/** Applies a decision on a copy; null if the engine refuses it. */
export function trySubmit(s: GameState, player: PlayerId, d: Decision): GameState | null {
  try {
    return step(s, player, d);
  } catch (e) {
    onlyRulesErrors(e);
    return null;
  }
}
