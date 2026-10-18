/** A game in progress: local (Web Worker, against the AI), replayed, or remote (online, lot A11). From Planecircle. */
import {
  type CardDef,
  type CardFace,
  filterEvents,
  type GameEvent,
  type GameRecord,
  type GameState,
  type GameView,
  msg,
  projectView,
  RULES_VERSION,
  replayChecked,
  visibleFaces,
} from "@finalcircle/engine";
import type { FromWorker, ToWorker } from "./protocol";

export interface Session {
  send(m: ToWorker): void;
  close(): void;
}

/** Local game against the AI: the engine runs in a Web Worker. */
export class LocalSession implements Session {
  private readonly worker: Worker;

  constructor(onMessage: (m: FromWorker) => void) {
    this.worker = new Worker(new URL("./worker/game.worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (e: MessageEvent<FromWorker>) => onMessage(e.data);
    // Engine error in the worker: visible in the console rather than silent.
    this.worker.onerror = (e) => console.error("Game worker error:", e.message);
  }

  send(m: ToWorker): void {
    this.worker.postMessage(m);
  }

  close(): void {
    this.worker.terminate();
  }
}

/** Production: downloads the game worker early (cached by the service worker) so that a game can start offline. */
export function prefetchGameWorker(): void {
  const worker = new Worker(new URL("./worker/game.worker.ts", import.meta.url), { type: "module" });
  setTimeout(() => worker.terminate(), 10_000);
}

/**
 * Replay of a recorded game: the states are computed in advance (`replayChecked`), then shown one by one from the
 * chosen point of view. A game recorded by another version of the rules may stop at the first divergence (`warning`).
 */
export class ReplaySession implements Session {
  readonly states: GameState[] = [];
  private readonly events: GameEvent[][] = [];
  readonly warning: string | null;

  constructor(record: GameRecord, resolve: (code: string) => CardDef) {
    const { divergence } = replayChecked(record, resolve, (state, events) => {
      this.states.push(state);
      this.events.push(events);
    });
    const other = (record.rules ?? 0) !== RULES_VERSION;
    const at = { index: divergence?.index ?? 0, total: record.decisions.length };
    this.warning = divergence
      ? other
        ? msg("Replay stopped at decision {index} of {total} (game recorded with an earlier version of the rules).", at)
        : msg("Replay stopped at decision {index} of {total}.", at)
      : null;
  }

  frame(
    i: number,
    viewer: string,
    withEvents: boolean,
  ): { view: GameView; events: GameEvent[]; faces: Record<string, CardFace> } {
    const state = this.states[i] as GameState;
    const events = withEvents ? filterEvents(this.events[i] ?? [], viewer) : [];
    const view = { ...projectView(state, viewer), pending: null };
    return { view, events, faces: visibleFaces(state, view, events) };
  }

  send(_m: ToWorker): void {}

  close(): void {}
}
