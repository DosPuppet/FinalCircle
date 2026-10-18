/**
 * State primitives (from Planecircle): ids, timestamps, deterministic randomness, copy of the state, cache version.
 */
import type { CardDef, GameObject, GameState, ObjectId, PlayerId } from "./types";

// Display events: `events.ts` (no dependencies), re-exported here.
export { collectEvents, emit } from "./events";

function deepClone<T>(v: T): T {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) {
    const out = new Array(v.length);
    for (let i = 0; i < v.length; i++) out[i] = deepClone(v[i]);
    return out as T;
  }
  const out: Record<string, unknown> = {};
  for (const k in v) out[k] = deepClone((v as Record<string, unknown>)[k]);
  return out as T;
}

/**
 * Caches keyed by state (WeakMap) that a copy may reuse while its `version` is unchanged: each cache registers how to
 * carry its entry from a state to its copy, so this module imports none of them.
 */
const cloneHooks: ((from: GameState, to: GameState) => void)[] = [];

/** Registers a hook; returns its removal (a test that registers one removes it). */
export function onClone(hook: (from: GameState, to: GameState) => void): () => void {
  cloneHooks.push(hook);
  return () => {
    const i = cloneHooks.indexOf(hook);
    if (i >= 0) cloneHooks.splice(i, 1);
  };
}

/**
 * Deep copy of the state, except the card definitions (immutable, shared). Much faster than Immer for our use (AI
 * simulations).
 */
export function cloneState(s: GameState): GameState {
  const { defs, ...rest } = s;
  const copy = deepClone(rest) as GameState;
  copy.defs = { ...defs };
  for (const hook of cloneHooks) hook(s, copy);
  return copy;
}

/** Anything that may change characteristics (CR 11.12.4) advances the version: the characteristics cache is invalidated. */
export function bump(s: GameState): void {
  s.version += 1;
}

export function newId(s: GameState, prefix = "o"): string {
  // One counter per prefix: creating one more effect or trigger doesn't shift the object ids.
  const n = s.idCounters[prefix] ?? 1;
  s.idCounters[prefix] = n + 1;
  return `${prefix}${n}`;
}

export function nextTimestamp(s: GameState): number {
  s.timestamp += 1;
  return s.timestamp;
}

/** mulberry32 on `s.rng`: the only source of randomness of the engine (no `Math.random`, no `Date`). */
export function random(s: GameState): number {
  s.rng = (s.rng + 0x6d2b79f5) | 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Fisher–Yates on the state's randomness (CR 15.1.1.6). */
export function shuffle<T>(s: GameState, items: T[]): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random(s) * (i + 1));
    const tmp = items[i] as T;
    items[i] = items[j] as T;
    items[j] = tmp;
  }
}

/** The object; an unknown id is an engine bug (not a RulesError). */
export function obj(s: GameState, id: ObjectId): GameObject {
  const o = s.objects[id];
  if (!o) throw new Error(`unknown object ${id}`);
  return o;
}

export function defOf(s: GameState, id: ObjectId): CardDef {
  const d = s.defs[obj(s, id).defId];
  if (!d) throw new Error(`unknown definition for object ${id}`);
  return d;
}

/** The other player (CR 1.1: two players). */
export function opponentOf(s: GameState, p: PlayerId): PlayerId {
  const other = s.playerOrder.find((x) => x !== p);
  if (!other) throw new Error(`no opponent for ${p}`);
  return other;
}

export function registerDef(s: GameState, d: CardDef): void {
  s.defs[d.id] = d;
}
