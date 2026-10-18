/**
 * Display events (`GameEvent`): the engine is synchronous, so a global collector is enough. A module without runtime
 * dependencies, so that any file can emit without entering the engine's import cycle.
 */
import type { GameEvent } from "./types";

let sink: GameEvent[] | null = null;

export function collectEvents<T>(fn: () => T): [T, GameEvent[]] {
  const previous = sink;
  const events: GameEvent[] = [];
  sink = events;
  try {
    return [fn(), events];
  } finally {
    sink = previous;
  }
}

export function emit(event: GameEvent): void {
  sink?.push(event);
}
