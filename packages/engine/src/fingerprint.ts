/**
 * Canonical fingerprint of a game state: checkpoints of the records (record.ts) and detection of loops of mandatory
 * actions (CR 13.1, game.ts). From Planecircle.
 */
import type { GameState, ObjectId } from "./types";

/**
 * Fingerprint of what a game "is": turn, phase, pending decision, players (zones, crystals), field and stack. It cites
 * no object id nor internal counter (timestamps, cache version, randomness): two versions of the engine that play the
 * same game give the same fingerprint.
 */
export function outcomeHash(s: GameState): string {
  const def = (id: ObjectId | undefined) => (id ? (s.objects[id]?.defId ?? "?") : null);
  const zone = (ids: ObjectId[]) => ids.map(def);
  const projection = {
    turn: [s.turn.number, s.turn.active, s.turn.phase, s.turn.step],
    pending: s.pending ? [s.pending.kind, s.pending.player] : null,
    over: [s.over, s.winner],
    players: s.playerOrder.map((p) => {
      const pl = s.players[p];
      return pl
        ? [
            p,
            pl.lost,
            pl.crystals,
            zone(pl.deck),
            zone(pl.hand),
            zone(pl.breakZone),
            zone(pl.damage),
            zone(pl.removed),
            pl.lb.map((id) => [def(id), !!s.objects[id]?.faceDown]),
          ]
        : [p, null];
    }),
    field: s.field.map((id) => {
      const o = s.objects[id];
      if (!o) return null;
      const counters = Object.entries(o.counters ?? {})
        .filter(([, n]) => n)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      return [o.defId, o.owner, o.controller, o.dull, o.damage, !!o.frozen, counters];
    }),
    stack: s.stack.map((i) => [i.kind, i.sourceDefId, i.controller]),
  };
  return cyrb53(JSON.stringify(projection));
}

/** 53-bit hash (cyrb53), in hexadecimal: pure and deterministic. */
function cyrb53(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}
