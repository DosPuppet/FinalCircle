/** A game in progress: local (Web Worker, against the AI), replayed, or remote (online). From Planecircle. */
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
import type { ClientMessage, ServerMessage } from "@finalcircle/server/protocol";
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

/** Server address: the same host as the page (/ws, proxied to the server by Vite in development). */
export function serverUrl(): string {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/ws`;
}

/**
 * Online game: a WebSocket to the server, which runs the engine and is authoritative. Decisions and settings are sent
 * as for a local game; the room messages (`room`, `opponent`, errors) are passed up unchanged.
 */
export class RemoteSession implements Session {
  private readonly ws: WebSocket;
  private readonly outbox: string[] = [];
  private closing = false;

  constructor(
    onMessage: (m: ServerMessage) => void,
    /** Connection lost without asking for it (network, server stopped). */
    onLost: () => void,
  ) {
    this.ws = new WebSocket(serverUrl());
    this.ws.onopen = () => {
      for (const m of this.outbox.splice(0)) this.ws.send(m);
    };
    this.ws.onmessage = (e) => {
      try {
        onMessage(JSON.parse(String(e.data)) as ServerMessage);
      } catch {
        // unreadable message: ignored
      }
    };
    this.ws.onclose = () => {
      if (!this.closing) onLost();
    };
  }

  /** A raw message of the online protocol. */
  raw(m: ClientMessage): void {
    const data = JSON.stringify(m);
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(data);
    else if (this.ws.readyState === WebSocket.CONNECTING) this.outbox.push(data);
  }

  send(m: ToWorker): void {
    if (m.type === "decision") this.raw({ type: "decision", decision: m.decision });
    else if (m.type === "settings") this.raw({ type: "settings", settings: m.settings });
    else if (m.type === "export") this.raw({ type: "export" });
    // "start": the server starts the game when the second player arrives.
  }

  close(): void {
    this.closing = true;
    this.ws.close();
  }
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
