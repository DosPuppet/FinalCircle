/**
 * The `op → handler` table of the effect interpreter. The `ops/*.ts` modules export their `HANDLERS`, registered by
 * `ops/index.ts`, which `game.ts` imports: the interpreter does not import the handlers, which keeps `ops/` out of the
 * engine's import cycle (Planecircle's design). This module imports only types.
 */
import type {
  ChoiceRequest,
  ChoiceValue,
  Effect,
  GameState,
  ObjectId,
  PlayerId,
  Resolution,
  StackItem,
  TriggerEvent,
} from "./types";

/** What an effect knows while it resolves. */
export interface EffectContext {
  controller: PlayerId;
  /** The Summon, or the card with the ability. */
  sourceId: ObjectId;
  sourceDefId: string;
  /** A Summon or an ability (damage sources, "cannot be chosen by…"). */
  kind: StackItem["kind"];
  /** Targets still legal at resolution. */
  targets: Record<string, ObjectId[]>;
  event?: TriggerEvent;
  /** Answers and stored values of the resolution. */
  vars: Record<string, ChoiceValue[]>;
  x: number;
}

/** An effect that needs an answer suspends the resolution; it is replayed with the answer under `key`. */
export type OpResult = undefined | { ask: { player: PlayerId; request: ChoiceRequest; key: string } };

/** Handling of an effect `op`: state, resolution, effect (typed by its `op`), context, choice key. */
export type Handler<E extends Effect> = (
  s: GameState,
  r: Resolution,
  e: E,
  ctx: EffectContext,
  key: (suffix: string) => string,
) => OpResult;
export type AnyHandler = Handler<never>;
/** `op → handler` table, split by domain in `ops/`. */
export type OpHandlers = { [K in Effect["op"]]?: Handler<Extract<Effect, { op: K }>> };

const registry: Record<string, AnyHandler> = {};

/** Adds the handlers of an `ops/` domain; an `op` has one handler only. */
export function registerOps(handlers: OpHandlers): void {
  for (const [op, handler] of Object.entries(handlers as Record<string, AnyHandler>)) {
    if (registry[op] && registry[op] !== handler) throw new Error(`effect op "${op}" registered twice`);
    registry[op] = handler;
  }
}

/** The handler of an `op` (undefined: unknown op). */
export function opHandler(op: string): AnyHandler | undefined {
  return registry[op];
}

/** The registered ops (the test that every op written by a card has a handler). */
export function registeredOps(): string[] {
  return Object.keys(registry);
}
