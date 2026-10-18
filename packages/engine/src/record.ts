/**
 * Record of a game (from Planecircle): seed, players and decks (in order), then all the applied decisions. Since the
 * engine is deterministic, replaying these decisions gives back exactly the same game: resuming an online game after
 * a server restart, replays, exporting a game to report a bug. Decks are recorded by card number: `resolve` gives back
 * the definitions on replay.
 */
export { outcomeHash } from "./fingerprint";

import { outcomeHash } from "./fingerprint";
import { createGame, type GameOptions, type StepResult, submit } from "./game";
import type { CardDef, Decision, GameEvent, GameState, PlayerId } from "./types";

export const RECORD_FORMAT = "finalcircle-game";
export const RECORD_VERSION = 1;

/**
 * Version of the engine rules. It moves at each lot that changes the behavior of a game ("[rules]" lots): a record
 * from another version may no longer replay identically. Absent from a record: 0.
 *
 * - 1: first engine (PLAN-A A4): phases, priority, CP, casting, attacks and parties, damage, EX Burst, rule processes.
 * - 2: abilities (PLAN-A A5): the effect handlers; an ability may choose its own card (CR 11.8.9 forbids only the ability
 *   itself); the rule processes run again after the EX Bursts.
 */
export const RULES_VERSION = 2;

/** One checkpoint every N decisions (plus the last one of the game). */
export const CHECKPOINT_EVERY = 25;

export interface GameRecord {
  format: typeof RECORD_FORMAT;
  version: typeof RECORD_VERSION;
  seed: number;
  /** Starting player imposed at creation (absent: chosen in the game, CR 8.2.1.2). */
  startingPlayer?: PlayerId;
  /** Main and LB decks by card number. */
  players: { id: PlayerId; name: string; deck: string[]; lb?: string[] }[];
  /** Applied decisions, in order: [player who decided, decision]. */
  decisions: [PlayerId, Decision][];
  /** Start date (ISO), for display. */
  createdAt?: string;
  /** Version of the engine rules that played the game (absent: 0). */
  rules?: number;
  /** Checkpoints: [number of applied decisions, `outcomeHash` of the resulting state]. */
  checkpoints?: [number, string][];
}

/** Creates the game and the record that will allow replaying it. */
export function createRecordedGame(opts: GameOptions): StepResult & { record: GameRecord } {
  const result = createGame(opts);
  const record: GameRecord = {
    format: RECORD_FORMAT,
    version: RECORD_VERSION,
    seed: opts.seed,
    ...(opts.startingPlayer ? { startingPlayer: opts.startingPlayer } : {}),
    players: opts.players.map((p) => ({
      id: p.id,
      name: p.name,
      deck: p.deck.map((c) => c.id),
      ...(p.lb?.length ? { lb: p.lb.map((c) => c.id) } : {}),
    })),
    decisions: [],
    createdAt: new Date().toISOString(),
    rules: RULES_VERSION,
    checkpoints: [],
  };
  return { ...result, record };
}

/** Adds an accepted decision to the record, with a checkpoint every `every` decisions. */
export function recordDecision(
  record: GameRecord,
  player: PlayerId,
  d: Decision,
  after: GameState,
  every: number = CHECKPOINT_EVERY,
): void {
  record.decisions.push([player, d]);
  const n = record.decisions.length;
  if (n % every !== 0 && !after.over) return;
  record.checkpoints = [...(record.checkpoints ?? []), [n, outcomeHash(after)]];
}

/** Checks the shape of a received record (imported file, server disk). */
export function isGameRecord(x: unknown): x is GameRecord {
  const r = x as Partial<GameRecord> | null;
  const strings = (v: unknown) => Array.isArray(v) && v.every((n) => typeof n === "string");
  return (
    !!r &&
    r.format === RECORD_FORMAT &&
    r.version === RECORD_VERSION &&
    Number.isInteger(r.seed) &&
    (r.rules === undefined || Number.isInteger(r.rules)) &&
    (r.checkpoints === undefined ||
      (Array.isArray(r.checkpoints) &&
        r.checkpoints.every((c) => Array.isArray(c) && Number.isInteger(c[0]) && typeof c[1] === "string"))) &&
    (r.startingPlayer === undefined || typeof r.startingPlayer === "string") &&
    Array.isArray(r.players) &&
    r.players.every(
      (p) => typeof p?.id === "string" && typeof p.name === "string" && strings(p.deck) && (p.lb === undefined || strings(p.lb)),
    ) &&
    Array.isArray(r.decisions) &&
    r.decisions.every((d) => Array.isArray(d) && typeof d[0] === "string" && !!d[1] && typeof d[1] === "object")
  );
}

function initial(record: GameRecord, resolve: (code: string) => CardDef): StepResult {
  return createGame({
    seed: record.seed,
    ...(record.startingPlayer ? { startingPlayer: record.startingPlayer } : {}),
    players: record.players.map((p) => ({
      id: p.id,
      name: p.name,
      deck: p.deck.map(resolve),
      lb: (p.lb ?? []).map(resolve),
    })),
  });
}

/** Replays the game up to decision `upTo` (excluded; all by default): state and events produced. */
export function replayGame(
  record: GameRecord,
  resolve: (code: string) => CardDef,
  upTo = record.decisions.length,
): { state: GameState; events: GameEvent[] } {
  let { state, events } = initial(record, resolve);
  const all = [...events];
  for (const [player, d] of record.decisions.slice(0, upTo)) {
    ({ state, events } = submit(state, player, d));
    all.push(...events);
  }
  return { state, events: all };
}

/** All the states of the game: the start, then one per decision (step-by-step replays). */
export function replayStates(record: GameRecord, resolve: (code: string) => CardDef): GameState[] {
  let { state } = initial(record, resolve);
  const out = [state];
  for (const [player, d] of record.decisions) {
    state = submit(state, player, d).state;
    out.push(state);
  }
  return out;
}

/** Checked replay: where and why the game stops being the one that was recorded. */
export interface ReplayDivergence {
  /** Number of decisions applied without discrepancy. */
  index: number;
  reason: "error" | "checkpoint";
  message: string;
}

/**
 * Replays the record checking its checkpoints, and stops at the first divergence: refused decision (or engine error),
 * or different fingerprint. `onStep` receives each validated state (the start included) and the events that lead to it.
 */
export function replayChecked(
  record: GameRecord,
  resolve: (code: string) => CardDef,
  onStep?: (state: GameState, events: GameEvent[]) => void,
): { state: GameState; applied: number; divergence: ReplayDivergence | null } {
  let { state, events } = initial(record, resolve);
  onStep?.(state, events);
  const expected = new Map(record.checkpoints ?? []);
  let verified = { state, applied: 0 };
  const pending: [GameState, GameEvent[]][] = [];
  const flush = () => {
    for (const [st, ev] of pending) onStep?.(st, ev);
    pending.length = 0;
  };
  for (let i = 0; i < record.decisions.length; i++) {
    const [player, d] = record.decisions[i] as [PlayerId, Decision];
    try {
      ({ state, events } = submit(state, player, d));
    } catch (e) {
      flush();
      const message = e instanceof Error ? e.message : String(e);
      return { state, applied: i, divergence: { index: i, reason: "error", message } };
    }
    pending.push([state, events]);
    const hash = expected.get(i + 1);
    if (hash === undefined) continue;
    if (hash !== outcomeHash(state)) {
      pending.length = 0;
      return {
        state: verified.state,
        applied: verified.applied,
        divergence: { index: verified.applied, reason: "checkpoint", message: `discrepancy found at decision ${i + 1}` },
      };
    }
    flush();
    verified = { state, applied: i + 1 };
  }
  flush();
  return { state, applied: record.decisions.length, divergence: null };
}
