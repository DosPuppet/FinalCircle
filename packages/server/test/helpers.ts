/** Test clients (from Planecircle): real WebSockets to a server on a free port, a bot that only sees its own view. */
import { type DeckEntries, deckById } from "@finalcircle/cards";
import { type ActionOption, type ChooseOption, type Decision, type GameView, RULES_VERSION } from "@finalcircle/engine";
import { WebSocket } from "ws";
import type { ClientMessage, RoomConfig, ServerMessage } from "../src/index";
import { type RunningServer, startServer } from "../src/index";
import { PROTOCOL_VERSION } from "../src/protocol";

/** Versions of an up-to-date client (handshake). */
export const VERSION = { protocol: PROTOCOL_VERSION, rules: RULES_VERSION };

const deck = (id: string): DeckEntries => {
  const d = deckById(id);
  if (!d) throw new Error(id);
  return { main: d.main, lb: d.lb };
};
export const VOL1: DeckEntries = deck("starter-2025-vol1");
export const VOL2: DeckEntries = deck("starter-2025-vol2");

export function server(
  config: Partial<RoomConfig> = {},
  opts: { maxPerIp?: number; pingMs?: number; rate?: { perSecond: number; burst: number }; aiWorkers?: number } = {},
): Promise<RunningServer> {
  // Memory caps disabled by default: the test process may exceed the production ones without that being relevant to
  // the test; the cap test sets them itself. No AI workers unless asked.
  return startServer({ port: 0, host: "127.0.0.1", aiWorkers: 0, config: { maxHeapMb: 0, maxRssMb: 0, ...config }, ...opts });
}

/** Targets of a casting: the first legal ones (none for an "up to" choice). */
function firstTargets(choose: ChooseOption[]): Record<string, string[]> {
  return Object.fromEntries(choose.map((c) => [c.key, c.upTo ? [] : c.options.slice(0, Math.min(c.count, c.options.length))]));
}

export class Client {
  readonly received: ServerMessage[] = [];
  private cursor = 0;
  private waiters: (() => void)[] = [];
  /** Answers its decisions by itself (bot). */
  bot = false;
  private failed = new Set<string>();
  lastView: GameView | null = null;
  private lastPending: string | null = null;

  private constructor(private readonly ws: WebSocket) {
    ws.on("message", (data) => {
      const m = JSON.parse(String(data)) as ServerMessage;
      this.received.push(m);
      if (m.type === "update") this.lastView = m.view;
      if (m.type === "error" && m.code === "rules" && this.lastPending) this.failed.add(this.lastPending);
      for (const w of this.waiters.splice(0)) w();
      if (this.bot && m.type === "update") setImmediate(() => this.play(m.view));
      // Decision refused: no new view will arrive, so play again cautiously (pass, no attack).
      const view = this.lastView;
      if (this.bot && m.type === "error" && m.code === "rules" && view) setImmediate(() => this.play(view));
    });
  }

  static connect(port: number): Promise<Client> {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    return new Promise((ok, ko) => {
      ws.once("open", () => ok(new Client(ws)));
      ws.once("error", ko);
    });
  }

  /** Sends a message; create, join and rejoin carry the version of an up-to-date client, unless `raw`. */
  send(message: ClientMessage, raw = false): void {
    const versioned = !raw && (message.type === "create" || message.type === "join" || message.type === "rejoin");
    this.ws.send(JSON.stringify(versioned && !message.version ? { ...message, version: VERSION } : message));
  }

  close(): Promise<void> {
    return new Promise((ok) => {
      if (this.ws.readyState === WebSocket.CLOSED) return ok();
      this.ws.once("close", () => ok());
      this.ws.close();
    });
  }

  /** Next message (not yet consumed) that satisfies `pred`. */
  async next<T extends ServerMessage["type"]>(
    type: T,
    pred: (m: Extract<ServerMessage, { type: T }>) => boolean = () => true,
    timeoutMs = 10_000,
  ): Promise<Extract<ServerMessage, { type: T }>> {
    const end = Date.now() + timeoutMs;
    for (;;) {
      while (this.cursor < this.received.length) {
        const m = this.received[this.cursor++] as ServerMessage;
        if (m.type === type && pred(m as Extract<ServerMessage, { type: T }>)) return m as Extract<ServerMessage, { type: T }>;
      }
      const left = end - Date.now();
      if (left <= 0) throw new Error(`Message "${type}" expected, not received`);
      await new Promise<void>((ok) => {
        const t = setTimeout(ok, left);
        this.waiters.push(() => {
          clearTimeout(t);
          ok();
        });
      });
    }
  }

  /** Bot: casts what it can with the suggested payment, attacks with one Forward, never blocks, suggested answers. */
  play(view: GameView): void {
    const p = view.pending;
    if (!p || p.player !== view.viewer || view.over || view !== this.lastView) return;
    const key = `${view.turn.number}|${view.turn.phase}|${view.turn.step}|${p.kind}|${view.hand.length}|${view.stack.length}`;
    this.lastPending = key;
    const d = this.decide(view, this.failed.has(key));
    if (d) this.send({ type: "decision", decision: d });
  }

  private decide(view: GameView, safe: boolean): Decision | null {
    const p = view.pending;
    if (!p) return null;
    switch (p.kind) {
      case "mulligan":
        return { type: "keep" };
      case "discard":
        return { type: "discard", cards: view.hand.slice(0, p.count).map((c) => c.id) };
      case "declareAttack": {
        const first = p.single?.[0];
        return safe || !first ? { type: "endAttacks" } : { type: "attack", forwards: [first] };
      }
      case "declareBlock":
        return { type: "block", blocker: null };
      case "choice":
        return { type: "choose", values: p.request?.suggested ?? [] };
      case "priority": {
        if (safe) return { type: "pass" };
        const cast = (p.actions ?? []).find(
          (a): a is Extract<ActionOption, { type: "cast" }> => a.type === "cast" && !a.modal && !a.lb,
        );
        if (cast) return { type: "cast", card: cast.card, payment: cast.suggested, targets: firstTargets(cast.choose) };
        return { type: "pass" };
      }
    }
  }
}

/** Two players in a room, game started. */
export async function duel(port: number, opts: { bots?: boolean } = {}) {
  const a = await Client.connect(port);
  const b = await Client.connect(port);
  a.bot = b.bot = opts.bots ?? true;
  a.send({ type: "create", name: "Alice", deck: VOL1 });
  const created = await a.next("room");
  b.send({ type: "join", code: created.room.code, name: "Bob", deck: VOL2 });
  await a.next("update");
  await b.next("update");
  return { a, b, code: created.room.code };
}
