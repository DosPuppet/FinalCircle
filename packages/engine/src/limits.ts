/**
 * Safety caps of the engine (from Planecircle). The loop guards declare the game a draw (CR 13.1); the others cut an
 * amount. A cut emits the `capReached` event (game log, counted by the fuzz): it signals an approximation, never normal
 * operation. Every new cap goes here and in docs/approximations.md.
 */
import { emit } from "./events";

/** Steps of the game flow (`advance`) without a decision: beyond, a loop of mandatory actions, the game is a draw. */
export const MAX_FLOW_STEPS = 100_000;
/** Consecutive passes of rule processes (CR 12.3): beyond, the game is a draw. */
export const MAX_RULE_PASSES = 100;
/** Passes with a non-empty stack beyond which the fingerprint of the state is recorded (mandatory loop, CR 13.1). */
export const LOOP_SUSPECT = 20;
/** Passes with a non-empty stack beyond which the game is a draw, even without a repeated fingerprint. */
export const LOOP_LIMIT = 2000;
/** Consecutive automatic decisions (AI, autopilot) in a turn: beyond, the game is a draw (`GameHost`). */
export const MAX_AUTOMATIC_DECISIONS = 10_000;
/** Replaced or computed amount (damage, power): beyond, cut. */
export const MAX_AMOUNT = 1_000_000;
/** Announced X: beyond, the decision is refused. */
export const MAX_X = 1_000;
/** Applications of the ongoing effects to resolve dependencies (CR 11.12.4.12–13, fixed point). */
export const MAX_CHAR_PASSES = 3;

export type CapName = "amount" | "characteristics";

/** A cut happened: log event (without hidden information). */
export function capReached(cap: CapName): void {
  emit({ type: "capReached", cap });
}
