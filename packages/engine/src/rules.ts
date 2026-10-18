/**
 * Rule processes (CR 12): checked whenever a player would get priority, performed simultaneously as one event, and
 * repeated until none applies (12.3). Also the end of the game (CR 3).
 */
import { chars } from "./chars";
import { ask } from "./choices";
import { emit } from "./events";
import { MAX_RULE_PASSES } from "./limits";
import { msg } from "./text";
import type { GameState, ObjectId, PlayerId } from "./types";
import { moveObject } from "./zones";

/** The game ends: `losers` lose (CR 3.1); both at once is a draw (3.3). */
export function endGame(s: GameState, losers: { player: PlayerId; reason: "damage" | "emptyDeck" | "concede" }[]): void {
  for (const l of losers) {
    const pl = s.players[l.player];
    if (!pl || pl.lost) continue;
    pl.lost = true;
    emit({ type: "lose", player: l.player, reason: l.reason });
  }
  const standing = s.playerOrder.filter((p) => !s.players[p]?.lost);
  s.winner = standing.length === 1 ? (standing[0] as PlayerId) : "draw";
  s.over = true;
  s.flow = "over";
  s.pending = null;
  emit({ type: "gameOver", winner: s.winner });
}

/** The players who lose by a rule process (CR 12.4.1–3). */
function losers(s: GameState): { player: PlayerId; reason: "damage" | "emptyDeck" }[] {
  const out: { player: PlayerId; reason: "damage" | "emptyDeck" }[] = [];
  for (const p of s.playerOrder) {
    const pl = s.players[p];
    if (!pl || pl.lost) continue;
    if (pl.damage.length >= 7) out.push({ player: p, reason: "damage" });
    else if (pl.drewFromEmpty || pl.damagedFromEmpty) out.push({ player: p, reason: "emptyDeck" });
  }
  return out;
}

/** The cards rule processes 12.4.4–7 put into the Break Zone, and whether each is broken (12.4.5). */
function toBreak(s: GameState): { id: ObjectId; broken: boolean; breaker?: ObjectId }[] {
  const out = new Map<ObjectId, { id: ObjectId; broken: boolean; breaker?: ObjectId }>();
  const byController = new Map<PlayerId, ObjectId[]>();
  for (const id of s.field) {
    const o = s.objects[id];
    if (!o) continue;
    byController.set(o.controller, [...(byController.get(o.controller) ?? []), id]);
    const c = chars(s, id);
    // I18: only Characters with a power value (Forwards).
    if (c.type !== "Forward") continue;
    if (c.power <= 0) out.set(id, { id, broken: false });
    else if (c.power >= 1000 && o.damage >= c.power && !c.flags.includes("cantBeBroken"))
      out.set(id, { id, broken: true, ...(o.damagedBy ? { breaker: o.damagedBy } : {}) });
  }
  for (const ids of byController.values()) {
    // CR 12.4.6: two or more Characters of the same name without the generic icon: all of them.
    const byName = new Map<string, ObjectId[]>();
    for (const id of ids) {
      const c = chars(s, id);
      if (c.generic) continue;
      for (const n of c.names) byName.set(n, [...(byName.get(n) ?? []), id]);
    }
    for (const same of byName.values())
      if (same.length > 1) for (const id of same) if (!out.has(id)) out.set(id, { id, broken: false });
    // CR 12.4.7: two or more Light and/or Dark Characters: all of them.
    const lightDark = ids.filter((id) => chars(s, id).elements.some((e) => e === "light" || e === "dark"));
    if (lightDark.length > 1) for (const id of lightDark) if (!out.has(id)) out.set(id, { id, broken: false });
  }
  return [...out.values()];
}

/** Backups beyond five (CR 12.4.8): their controller chooses which go (I19). */
function excessBackups(s: GameState): { player: PlayerId; backups: ObjectId[] } | null {
  for (const p of s.playerOrder) {
    const backups = s.field.filter((id) => s.objects[id]?.controller === p && chars(s, id).type === "Backup");
    if (backups.length > 5) return { player: p, backups };
  }
  return null;
}

/**
 * Performs the rule processes until none applies (CR 12.3). Returns true when the game ended or a player must choose
 * (extra Backups).
 */
export function ruleProcesses(s: GameState): boolean {
  for (let pass = 0; pass < MAX_RULE_PASSES; pass++) {
    if (s.over) return true;
    const lost = losers(s);
    if (lost.length) {
      endGame(s, lost);
      return true;
    }
    const moves = toBreak(s);
    if (moves.length) {
      for (const m of moves)
        if (s.objects[m.id])
          moveObject(s, m.id, "break", m.broken ? { broken: true, ...(m.breaker ? { breaker: m.breaker } : {}) } : {});
      continue;
    }
    const extra = excessBackups(s);
    if (extra) {
      const n = extra.backups.length - 5;
      ask(
        s,
        extra.player,
        {
          type: "pick",
          options: extra.backups,
          min: n,
          max: n,
          prompt: msg("You control more than 5 Backups: put {n} into the Break Zone", { n }),
          intent: "excessBackups",
          suggested: extra.backups.slice(-n),
        },
        { kind: "excessBackups", player: extra.player },
      );
      return true;
    }
    return false;
  }
  // Rule processes that keep applying: a loop no one can stop (CR 13.1).
  endGame(
    s,
    s.playerOrder.map((p) => ({ player: p, reason: "damage" as const })),
  );
  return true;
}

/** Answer to the extra Backups question. */
export function answerExcessBackups(s: GameState, chosen: ObjectId[]): void {
  for (const id of chosen) if (s.objects[id]) moveObject(s, id, "break");
}
