/**
 * Damage (CR 6.5, 5.2.6.1): to Forwards (kept until the End Phase, breaking them by rule process) and to players (one
 * card of the main deck to the Damage Zone per point, EX Bursts after all of it, 6.5.2.1).
 */
import { chars } from "./chars";
import { emit } from "./events";
import { MAX_AMOUNT } from "./limits";
import { bump } from "./state";
import { sourceMatches } from "./targets";
import { rulesEvent } from "./triggers";
import type { DamageReplacement, GameState, LkiSnapshot, ObjectId, PlayerId } from "./types";
import { moveObject } from "./zones";

/** Who deals damage: a card (or a Summon), its controller, and how (CR 11.12.5: "by your opponent's abilities"). */
export interface DamageSource {
  id: ObjectId | null;
  controller: PlayerId;
  kind: "summon" | "ability" | "battle";
  /** Its characteristics, when it already left its zone. */
  lki?: LkiSnapshot;
}

const sourceKind = (k: DamageSource["kind"]) => (k === "battle" ? "battle" : k);

/** Applies one replacement (CR 11.12.5). */
function applyMod(n: number, m: DamageReplacement): number {
  if (m.set !== undefined) return m.set;
  if (m.reduce) return n - m.reduce;
  if (m.add) return n + m.add;
  return n;
}

function permutations<T>(xs: T[]): T[][] {
  if (xs.length <= 1) return [xs];
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
}

/**
 * The damage a Forward receives after the replacements (CR 11.12.5): those of the source ("If a Forward you control
 * deals damage to a Forward, the damage increases by 2000"), those of the Forward and its one-time shields. The
 * controller of the affected card orders them (11.12.5.7): the engine takes the order best for that player (I20).
 */
function replacedDamage(s: GameState, src: DamageSource, target: ObjectId, amount: number): number {
  const t = s.objects[target];
  if (!t) return 0;
  const by = {
    controller: src.controller,
    kind: sourceKind(src.kind),
    cost: src.lki?.cost ?? (src.id && s.objects[src.id] ? chars(s, src.id).cost : 0),
  };
  const mods: DamageReplacement[] = [];
  if (src.id && s.objects[src.id]?.zone === "field")
    for (const d of chars(s, src.id).dealtMods)
      if (
        (!d.mod.toForward || chars(s, target).type === "Forward") &&
        (!d.mod.from || sourceMatches(d.mod.from, d.controller, by))
      )
        mods.push(d.mod);
  for (const d of chars(s, target).damageMods) if (!d.mod.from || sourceMatches(d.mod.from, d.controller, by)) mods.push(d.mod);
  const shields = s.effects.filter((e) => e.shield && e.affected.includes(target));
  for (const e of shields) mods.push({ reduce: e.shield });
  if (shields.length) {
    // Used once: "the next damage dealt to it" (CR 11.12.5).
    s.effects = s.effects.filter((e) => !shields.includes(e));
    bump(s);
  }
  if (!mods.length) return amount;
  const orders = mods.length <= 5 ? permutations(mods) : [mods];
  return Math.min(...orders.map((o) => o.reduce(applyMod, amount)));
}

/** Deals damage to a Forward (CR 5.2.6.1); returns the damage dealt after the replacements. */
export function dealDamage(s: GameState, src: DamageSource, target: ObjectId, amount: number): number {
  const o = s.objects[target];
  if (o?.zone !== "field") return 0;
  const n = Math.min(MAX_AMOUNT, Math.max(0, replacedDamage(s, src, target, amount)));
  if (n <= 0) return 0;
  o.damage += n;
  if (src.id) o.damagedBy = src.id;
  bump(s);
  emit({ type: "damage", target, amount: n, ...(src.id ? { source: src.id } : {}), battle: src.kind === "battle" });
  rulesEvent(s, { e: "damage", source: src.id, target, toPlayer: false, amount: n, battle: src.kind === "battle" });
  return n;
}

/**
 * Deals damage to a player (CR 6.5): one card from the top of their main deck to their Damage Zone per point. Damage
 * with an empty main deck loses (3.1.3, 12.4.3). Cards with an EX Burst wait until all the damage is dealt (6.5.2.1);
 * one gated by "Damage N" counts only if met when the card arrives (15.2.6.3).
 */
export function damagePlayer(s: GameState, player: PlayerId, amount: number, src: DamageSource, members: ObjectId[] = []): void {
  const pl = s.players[player];
  if (!pl || amount <= 0) return;
  const cards: ObjectId[] = [];
  const bursts: ObjectId[] = [];
  for (let i = 0; i < amount; i++) {
    const top = pl.deck[0];
    if (!top) {
      pl.damagedFromEmpty = true;
      break;
    }
    const id = moveObject(s, top, "damage");
    cards.push(id);
    const d = s.defs[s.objects[id]?.defId ?? ""];
    if (d?.exBurst && pl.damage.length >= (d.exBurstDamage ?? 0)) bursts.push(id);
  }
  emit({ type: "playerDamage", player, amount, cards, ...(src.id ? { source: src.id } : {}) });
  s.turnLog.push({ e: "damaged", player, amount });
  // Every member of a party deals the party's damage (I24); otherwise the source.
  for (const m of members.length ? members : [src.id])
    rulesEvent(s, { e: "damage", source: m, target: player, toPlayer: true, amount, battle: src.kind === "battle" });
  for (const card of bursts) s.exBursts.push({ player, card });
}
