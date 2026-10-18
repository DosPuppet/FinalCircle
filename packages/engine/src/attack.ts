/**
 * The Attack Phase (CR 10): declaring one attacking Forward or a party, blocking, and the Damage Resolution Step with
 * First Strike (15.2.3) and the split of the blocker's damage among a party (10.1.4.2.1).
 */
import { chars, effectivePower, hasKeyword } from "./chars";
import { ask } from "./choices";
import { damagePlayer, dealDamage } from "./damage";
import { RulesError } from "./errors";
import { emit } from "./events";
import { ruleProcesses } from "./rules";
import { bump, obj, opponentOf } from "./state";
import { msg } from "./text";
import { rulesEvent } from "./triggers";
import type { Element, GameState, ObjectId, PlayerId } from "./types";
import { fieldOf } from "./zones";

/** Forwards that can attack (CR 10.1.2.1): active, controlled since the start of the turn or with Haste, not yet attacked. */
export function attackCandidates(s: GameState, player: PlayerId): ObjectId[] {
  return fieldOf(s, player).filter((id) => {
    const o = obj(s, id);
    if (chars(s, id).type !== "Forward" || o.dull) return false;
    if (o.controlledSince >= s.turn.number && !hasKeyword(s, id, "haste")) return false;
    return !s.turnLog.some((e) => e.e === "attacked" && e.id === id);
  });
}

/** Parties that can be formed (CR 15.1.1.9.2, I21): two or more candidates sharing an element. */
export function partyGroups(s: GameState, player: PlayerId): { element: Element; members: ObjectId[] }[] {
  const candidates = attackCandidates(s, player);
  const out: { element: Element; members: ObjectId[] }[] = [];
  const elements = new Set(candidates.flatMap((id) => chars(s, id).elements));
  for (const element of elements) {
    const members = candidates.filter((id) => chars(s, id).elements.includes(element));
    if (members.length >= 2) out.push({ element, members });
  }
  return out;
}

/** The element a party shares, if any (I21). */
function sharedElement(s: GameState, forwards: ObjectId[]): Element | undefined {
  const [first, ...rest] = forwards.map((id) => chars(s, id).elements);
  return first?.find((e) => rest.every((els) => els.includes(e)));
}

/** CR 10.1.2: one Forward, or a party, attacks. */
export function declareAttack(s: GameState, player: PlayerId, forwards: ObjectId[]): void {
  const candidates = attackCandidates(s, player);
  if (!forwards.length || new Set(forwards).size !== forwards.length || forwards.some((id) => !candidates.includes(id)))
    throw new RulesError(msg("These Forwards cannot attack"));
  const element = forwards.length > 1 ? sharedElement(s, forwards) : undefined;
  if (forwards.length > 1 && !element) throw new RulesError(msg("A party is formed of Forwards of the same Element"));
  for (const id of forwards) {
    // CR 10.1.2.2: attacking dulls the Forward, unless it has Brave.
    if (!hasKeyword(s, id, "brave")) obj(s, id).dull = true;
    s.turnLog.push({ e: "attacked", id });
  }
  bump(s);
  s.attack = { attackers: [...forwards], ...(element ? { partyElement: element } : {}), blocker: null, blockDeclared: false };
  emit({ type: "attack", player, attackers: forwards });
  rulesEvent(s, { e: "attack", attackers: forwards });
}

/** Forwards that can block the attack (CR 10.1.3.1): active Forwards of the non-turn player. */
export function blockCandidates(s: GameState, player: PlayerId): ObjectId[] {
  if (!s.attack?.attackers.length) return [];
  return fieldOf(s, player).filter((id) => chars(s, id).type === "Forward" && !obj(s, id).dull);
}

/** CR 10.1.3: one Forward blocks, or none. */
export function declareBlock(s: GameState, player: PlayerId, blocker: ObjectId | null): void {
  const a = s.attack;
  if (!a) throw new RulesError(msg("There is no attack to block"));
  if (blocker !== null && !blockCandidates(s, player).includes(blocker)) throw new RulesError(msg("This Forward cannot block"));
  a.blocker = blocker;
  a.blockDeclared = true;
  a.blocked = blocker !== null;
  emit({ type: "block", player, blocker });
  if (blocker) rulesEvent(s, { e: "block", blocker });
}

/** Forwards of the attack that deal First Strike damage (CR 15.2.3.2; a party only if all its members have it, 15.2.3.4). */
function firstStrikers(s: GameState): Set<ObjectId> {
  const a = s.attack;
  const out = new Set<ObjectId>();
  if (!a) return out;
  if (a.attackers.length && a.attackers.every((id) => hasKeyword(s, id, "firstStrike")))
    for (const id of a.attackers) out.add(id);
  if (a.blocker && hasKeyword(s, a.blocker, "firstStrike")) out.add(a.blocker);
  return out;
}

/**
 * The Damage Resolution Step (CR 10.1.4): the First Strike round, the rule processes, then the others. Returns true
 * when a question was asked (the split of the blocker's damage among a party, extra Backups).
 */
export function resolveBattleDamage(s: GameState): boolean {
  const a = s.attack;
  if (!a) return false;
  const first = firstStrikers(s);
  a.damage ??= { stage: first.size ? "first" : "normal", dealt: [] };
  while (a.damage.stage !== "done") {
    const stage = a.damage.stage;
    const strikers = (id: ObjectId) => !a.damage?.dealt.includes(id) && (stage === "normal" || first.has(id));
    const attackers = a.attackers.filter((id) => s.objects[id] && strikers(id));
    const blocker = a.blocker && s.objects[a.blocker] && strikers(a.blocker) ? a.blocker : null;
    // CR 10.1.4.2.1: the blocker's controller splits its damage among the party, in multiples of 1000.
    const party = a.attackers.filter((id) => s.objects[id]);
    if (blocker && party.length > 1 && !a.damage.split) {
      const total = Math.floor(effectivePower(s, blocker) / 1000) * 1000;
      ask(
        s,
        obj(s, blocker).controller,
        {
          type: "divide",
          among: party,
          total,
          step: 1000,
          prompt: msg("Split the damage of your blocking Forward among the party"),
          intent: "partyDamage",
          suggested: party.map((_, i) => (i === 0 ? total : 0)),
        },
        { kind: "partyDamage" },
      );
      return true;
    }
    dealRound(s, attackers, blocker);
    a.damage.dealt.push(...attackers, ...(blocker ? [blocker] : []));
    a.damage.stage = stage === "first" ? "normal" : "done";
    // Between the two rounds: the rule processes (a broken Forward deals no more damage); no priority is useful (I8).
    if (stage === "first" && ruleProcesses(s)) return true;
  }
  return false;
}

/** One round of battle damage, dealt simultaneously (CR 10.1.4.1–2). */
function dealRound(s: GameState, attackers: ObjectId[], blocker: ObjectId | null): void {
  const a = s.attack;
  if (!a) return;
  const turnPlayer = s.turn.active;
  if (!a.blocked) {
    // Unblocked (CR 10.1.4.1): 1 point of damage to the opponent, for one Forward or a whole party (I4).
    if (attackers.length)
      damagePlayer(
        s,
        opponentOf(s, turnPlayer),
        1,
        { id: attackers[0] as ObjectId, controller: turnPlayer, kind: "battle" },
        attackers,
      );
    return;
  }
  const hits: { from: ObjectId; to: ObjectId; n: number }[] = [];
  const target = a.blocker;
  if (target && s.objects[target]) for (const id of attackers) hits.push({ from: id, to: target, n: effectivePower(s, id) });
  if (blocker) {
    const party = a.attackers.filter((id) => s.objects[id]);
    if (party.length > 1 && a.damage?.split) {
      for (const [id, n] of Object.entries(a.damage.split)) if (n > 0 && s.objects[id]) hits.push({ from: blocker, to: id, n });
    } else if (party[0]) hits.push({ from: blocker, to: party[0], n: effectivePower(s, blocker) });
  }
  for (const h of hits) dealDamage(s, { id: h.from, controller: obj(s, h.from).controller, kind: "battle" }, h.to, h.n);
}

/** Answer to the split of the blocker's damage. */
export function answerPartySplit(s: GameState, split: Record<ObjectId, number>): void {
  if (s.attack?.damage) s.attack.damage.split = split;
}
