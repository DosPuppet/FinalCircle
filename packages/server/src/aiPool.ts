/**
 * Server AI worker pool: the AI seats of a room think in `worker_threads`, not in the main thread that
 * serves all the rooms. One decision at a time per worker, shared queue; a thinking that takes too long is abandoned
 * (worker restarted) and the host plays the default decision.
 */
import { availableParallelism } from "node:os";
import { Worker } from "node:worker_threads";
import type { AiBudget, AiLevel } from "@finalcircle/ai";
import type { CardDef, Decision, GameState } from "@finalcircle/engine";
import type { FromAiWorker, ToAiWorker } from "./aiWorker";

export interface AiJob {
  room: string;
  seat: string;
  level: AiLevel;
  seed: number;
  budget?: AiBudget;
  state: GameState;
}

interface Slot {
  worker: Worker;
  /** Definitions already sent, per room. */
  sent: Map<string, Set<string>>;
  busy: { id: number; resolve: (d: Decision) => void; reject: (e: Error) => void; timer: NodeJS.Timeout; at: number } | null;
}

/** The worker: TypeScript source (development, tests: loaded by tsx), or compiled file next to the server. */
function workerUrl(): { url: URL; execArgv: string[] } {
  const ts = import.meta.url.endsWith(".ts");
  return ts
    ? { url: new URL("./aiWorker.ts", import.meta.url), execArgv: ["--import", "tsx"] }
    : { url: new URL("./ai-worker.mjs", import.meta.url), execArgv: [] };
}

export class AiPool {
  private readonly slots: Slot[] = [];
  private readonly queue: { job: AiJob; resolve: (d: Decision) => void; reject: (e: Error) => void }[] = [];
  private nextId = 1;
  /** Durations of the last thinkings (ms), for `/healthz`. */
  private readonly times: number[] = [];
  private closed = false;

  constructor(
    readonly size = Math.max(1, Math.min(2, availableParallelism() - 1)),
    private readonly timeoutMs = 10_000,
  ) {}

  /** Decision of an AI seat; rejected if the worker fails or exceeds the delay (the host then plays the default decision). */
  decide(job: AiJob): Promise<Decision> {
    if (this.closed) return Promise.reject(new Error("AI pool closed"));
    return new Promise((resolve, reject) => {
      this.queue.push({ job, resolve, reject });
      this.pump();
    });
  }

  /** Room closed: the workers forget its definitions. */
  forget(room: string): void {
    for (const slot of this.slots) {
      if (!slot.sent.delete(room)) continue;
      slot.worker.postMessage({ type: "forget", room } satisfies ToAiWorker);
    }
  }

  stats(): { workers: number; busy: number; queue: number; p50: number; p95: number } {
    const sorted = [...this.times].sort((a, b) => a - b);
    const at = (q: number) => Math.round(sorted[Math.floor(q * (sorted.length - 1))] ?? 0);
    return {
      workers: this.slots.length,
      busy: this.slots.filter((s) => s.busy).length,
      queue: this.queue.length,
      p50: at(0.5),
      p95: at(0.95),
    };
  }

  async close(): Promise<void> {
    this.closed = true;
    for (const q of this.queue.splice(0)) q.reject(new Error("AI pool closed"));
    await Promise.all(this.slots.splice(0).map((s) => this.stop(s)));
  }

  private spawn(): Slot {
    const { url, execArgv } = workerUrl();
    const slot: Slot = {
      worker: new Worker(url, { execArgv, resourceLimits: { maxOldGenerationSizeMb: 160 } }),
      sent: new Map(),
      busy: null,
    };
    slot.worker.unref();
    slot.worker.on("message", (m: FromAiWorker) => {
      const b = slot.busy;
      if (!b || b.id !== m.id) return;
      clearTimeout(b.timer);
      slot.busy = null;
      this.times.push(Date.now() - b.at);
      if (this.times.length > 200) this.times.shift();
      if ("decision" in m) b.resolve(m.decision);
      else b.reject(new Error(m.error));
      this.pump();
    });
    slot.worker.on("error", (e) => this.fail(slot, e instanceof Error ? e : new Error(String(e))));
    slot.worker.on("exit", (code) => {
      if (code !== 0) this.fail(slot, new Error(`AI worker stopped (${code})`));
    });
    this.slots.push(slot);
    return slot;
  }

  /** Failed worker (error, delay exceeded): the current thinking fails, the worker is replaced. */
  private fail(slot: Slot, e: Error): void {
    const i = this.slots.indexOf(slot);
    if (i < 0) return;
    this.slots.splice(i, 1);
    const b = slot.busy;
    slot.busy = null;
    if (b) {
      clearTimeout(b.timer);
      b.reject(e);
    }
    void this.stop(slot);
    this.pump();
  }

  private async stop(slot: Slot): Promise<void> {
    if (slot.busy) clearTimeout(slot.busy.timer);
    await slot.worker.terminate().catch(() => 0);
  }

  private pump(): void {
    while (this.queue.length) {
      const slot = this.slots.find((s) => !s.busy) ?? (this.slots.length < this.size ? this.spawn() : undefined);
      if (!slot) return;
      const next = this.queue.shift();
      if (!next) return;
      this.send(slot, next.job, next.resolve, next.reject);
    }
  }

  private send(slot: Slot, job: AiJob, resolve: (d: Decision) => void, reject: (e: Error) => void): void {
    const id = this.nextId++;
    // Definitions this worker does not have yet for this room.
    let sent = slot.sent.get(job.room);
    if (!sent) {
      sent = new Set();
      slot.sent.set(job.room, sent);
    }
    const defs: Record<string, CardDef> = {};
    for (const [k, d] of Object.entries(job.state.defs))
      if (!sent.has(k)) {
        defs[k] = d;
        sent.add(k);
      }
    const { defs: _all, ...state } = job.state;
    const timer = setTimeout(() => this.fail(slot, new Error("AI thinking took too long")), this.timeoutMs);
    slot.busy = { id, resolve, reject, timer, at: Date.now() };
    slot.worker.postMessage({
      type: "decide",
      id,
      room: job.room,
      seat: job.seat,
      level: job.level,
      seed: job.seed,
      budget: job.budget,
      state,
      ...(Object.keys(defs).length ? { defs } : {}),
    } satisfies ToAiWorker);
  }
}
