/**
 * Server AI worker: thinks about a decision of an AI seat off the main thread, so that the other rooms
 * are not blocked. Receives the game state without its card definitions (kept here per room, completed on each message
 * by the missing ones).
 */
import { parentPort } from "node:worker_threads";
import { type AiBudget, type AiLevel, aiAgent } from "@finalcircle/ai";
import type { CardDef, Decision, GameState } from "@finalcircle/engine";

export type ToAiWorker =
  | {
      type: "decide";
      id: number;
      room: string;
      seat: string;
      level: AiLevel;
      seed: number;
      budget?: AiBudget;
      state: Omit<GameState, "defs">;
      /** Definitions this worker does not have yet for this room. */
      defs?: Record<string, CardDef>;
    }
  | { type: "forget"; room: string };

export type FromAiWorker = { id: number; decision: Decision } | { id: number; error: string };

/** Definitions per room (the oldest rooms are forgotten beyond 64). */
const defsByRoom = new Map<string, Record<string, CardDef>>();
const MAX_ROOMS = 64;

parentPort?.on("message", (m: ToAiWorker) => {
  if (m.type === "forget") {
    defsByRoom.delete(m.room);
    return;
  }
  let defs = defsByRoom.get(m.room);
  if (!defs) {
    defs = {};
    defsByRoom.set(m.room, defs);
    if (defsByRoom.size > MAX_ROOMS) defsByRoom.delete(defsByRoom.keys().next().value as string);
  }
  if (m.defs) Object.assign(defs, m.defs);
  try {
    const state = { ...m.state, defs } as GameState;
    const decision = aiAgent(m.level, { seed: m.seed, ...(m.budget ? { budget: m.budget } : {}), fair: true })(state, m.seat);
    parentPort?.postMessage({ id: m.id, decision } satisfies FromAiWorker);
  } catch (e) {
    parentPort?.postMessage({ id: m.id, error: e instanceof Error ? e.message : String(e) } satisfies FromAiWorker);
  }
});
