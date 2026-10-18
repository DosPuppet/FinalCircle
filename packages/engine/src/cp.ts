/**
 * Crystal Points (CR 11.2, rewritten in v3.3): costs, the sources a player can use, checking a payment, and the
 * payment the engine suggests. Pure; also used by the client (payment tray) and the AI.
 *
 * A payment is part of the decision that casts or activates (`Payment`): there is no pool of CP in the state.
 * Discarding a card gives 2 CP of its element, dulling a Backup 1 CP of its element (11.2.2.2); a Multi-Element card or
 * Backup declares one of its elements (5.2.1.3, I3); Light and Dark cards cannot be discarded. Generated CP beyond the
 * cost is lost (11.2.2.3, I1).
 */
import { chars } from "./chars";
import { RulesError } from "./errors";
import { msg } from "./text";
import type { CpCost, CpSource, Element, GameState, ObjectId, Payment, PlayerId } from "./types";

/** The CP cost of a card's base cost (CR 11.2.2, 11.2.2.1): one CP of each element, the rest of any element. */
export function baseCost(cost: number, elements: readonly Element[]): CpCost {
  if (cost <= 0) return { elements: {}, generic: 0 };
  // CR 11.2.2: a Light or Dark card is paid with CP of any element.
  const fixed = elements.filter((e) => e !== "light" && e !== "dark");
  const out: CpCost = { elements: {}, generic: Math.max(0, cost - fixed.length) };
  for (const e of fixed) out.elements[e] = 1;
  return out;
}

export const cpTotal = (c: CpCost) => c.generic + Object.values(c.elements).reduce((a: number, b) => a + (b ?? 0), 0);

/**
 * What a player can generate CP with (CR 11.2.2.2): the cards of their hand (except `exclude`: the card being cast,
 * the card discarded for a special ability; never a Light or Dark card) and their active Backups.
 */
export function cpSources(s: GameState, player: PlayerId, exclude: readonly ObjectId[] = []): CpSource[] {
  const pl = s.players[player];
  if (!pl) return [];
  const out: CpSource[] = [];
  for (const id of pl.hand) {
    if (exclude.includes(id)) continue;
    const els = chars(s, id).elements.filter((e) => e !== "light" && e !== "dark");
    if (els.length && els.length === chars(s, id).elements.length) out.push({ kind: "discard", id, cp: 2, elements: els });
  }
  for (const id of s.field) {
    const o = s.objects[id];
    if (!o || o.controller !== player || o.dull || exclude.includes(id)) continue;
    const c = chars(s, id);
    if (c.type !== "Backup") continue;
    out.push({ kind: "dull", id, cp: 1, elements: [...new Set([...c.elements, ...c.cpAs])] });
  }
  return out;
}

interface Unit {
  element: Element;
  cp: number;
}

/** The CP a payment generates, by declared element; throws if a source is not usable. */
function unitsOf(pay: Payment, sources: readonly CpSource[], onlyFrom?: readonly Element[]): Unit[] {
  const units: Unit[] = [];
  const seen = new Set<ObjectId>();
  const take = (kind: CpSource["kind"], id: ObjectId, as: Element | undefined) => {
    if (seen.has(id)) throw new RulesError(msg("The same card cannot pay twice"));
    seen.add(id);
    const src = sources.find((x) => x.kind === kind && x.id === id);
    if (!src)
      throw new RulesError(
        kind === "discard" ? msg("This card cannot be discarded for CP") : msg("This Backup cannot be dulled for CP"),
      );
    const element = as ?? src.elements[0];
    if (!element || !src.elements.includes(element)) throw new RulesError(msg("This card does not produce CP of that element"));
    if (onlyFrom && !onlyFrom.includes(element)) throw new RulesError(msg("This cost can only be paid with CP of its element"));
    units.push({ element, cp: src.cp });
  };
  for (const d of pay.discard ?? []) take("discard", d.card, d.as);
  for (const d of pay.dull ?? []) take("dull", d.backup, d.as);
  return units;
}

/** Whether the generated CP can pay the cost: enough of each element, enough in total (CR 11.2.2, 11.2.2.3). */
function covers(cost: CpCost, units: readonly Unit[]): boolean {
  let total = 0;
  const by: Partial<Record<Element, number>> = {};
  for (const u of units) {
    total += u.cp;
    by[u.element] = (by[u.element] ?? 0) + u.cp;
  }
  for (const [e, n] of Object.entries(cost.elements)) if ((by[e as Element] ?? 0) < (n ?? 0)) return false;
  return total >= cpTotal(cost);
}

/**
 * Checks a payment (CR 11.2): every source usable, the cost covered. A cost of 0 takes no CP (11.2.2.1, 11.2.2.4).
 * Throws a RulesError otherwise.
 */
export function checkPayment(cost: CpCost, sources: readonly CpSource[], pay: Payment, onlyFrom?: readonly Element[]): void {
  const units = unitsOf(pay, sources, onlyFrom);
  if (cpTotal(cost) === 0) {
    if (units.length) throw new RulesError(msg("This cost needs no CP"));
    return;
  }
  if (!covers(cost, units)) throw new RulesError(msg("Not enough CP of the right elements"));
}

/** The value of keeping a source (higher: the AI would rather not spend it). */
export type KeepValue = (src: CpSource) => number;

/** By default: dull Backups before discarding cards (a card in hand is worth more than a Backup's CP this turn). */
export const defaultKeep: KeepValue = (src) => (src.kind === "dull" ? 1 : 3);

const SEARCH_LIMIT = 4000;

/**
 * The cheapest minimal payment of a cost (no source could be left out), or null if the player cannot pay. A search
 * over the sources, cheapest first, bounded (the hand and the five Backups make it small).
 */
export function suggestPayment(
  cost: CpCost,
  sources: readonly CpSource[],
  keep: KeepValue = defaultKeep,
  onlyFrom?: readonly Element[],
): Payment | null {
  const need = cpTotal(cost);
  if (need === 0) return {};
  const usable = sources
    .map((src) => {
      const els = onlyFrom ? src.elements.filter((e) => onlyFrom.includes(e)) : src.elements;
      return { src, els };
    })
    .filter((x) => x.els.length > 0)
    .sort((a, b) => keep(a.src) - keep(b.src));
  const required = Object.entries(cost.elements) as [Element, number][];
  let best: { pay: { src: CpSource; as: Element }[]; score: number } | null = null;
  let nodes = 0;
  const chosen: { src: CpSource; as: Element }[] = [];
  const score = () => chosen.reduce((t, c) => t + keep(c.src), 0) + 0.5 * (chosen.reduce((t, c) => t + c.src.cp, 0) - need);
  const ok = () => {
    let total = 0;
    const by: Partial<Record<Element, number>> = {};
    for (const c of chosen) {
      total += c.src.cp;
      by[c.as] = (by[c.as] ?? 0) + c.src.cp;
    }
    return total >= need && required.every(([e, n]) => (by[e] ?? 0) >= n);
  };
  /** A payment from which no source can be removed. */
  const minimal = () => chosen.every((_, i) => !okWithout(i));
  const okWithout = (i: number) => {
    const removed = chosen.splice(i, 1);
    const r = ok();
    chosen.splice(i, 0, ...removed);
    return r;
  };
  /** Element a source should declare: a required element still short, otherwise its first one. */
  const asFor = (els: Element[]): Element[] => {
    const by: Partial<Record<Element, number>> = {};
    for (const c of chosen) by[c.as] = (by[c.as] ?? 0) + c.src.cp;
    const short = required.filter(([e, n]) => (by[e] ?? 0) < n && els.includes(e)).map(([e]) => e);
    return short.length ? short : [els[0] as Element];
  };
  const dfs = (from: number): void => {
    if (++nodes > SEARCH_LIMIT) return;
    if (ok()) {
      if (minimal()) {
        const sc = score();
        if (!best || sc < best.score) best = { pay: [...chosen], score: sc };
      }
      return;
    }
    for (let i = from; i < usable.length; i++) {
      const u = usable[i] as (typeof usable)[number];
      for (const as of asFor(u.els)) {
        chosen.push({ src: u.src, as });
        dfs(i + 1);
        chosen.pop();
      }
    }
  };
  dfs(0);
  const found = best as { pay: { src: CpSource; as: Element }[] } | null;
  if (!found) return null;
  const discard: NonNullable<Payment["discard"]> = [];
  const dull: NonNullable<Payment["dull"]> = [];
  for (const { src, as } of found.pay) {
    const declared = src.elements.length > 1 ? { as } : {};
    if (src.kind === "discard") discard.push({ card: src.id, ...declared });
    else dull.push({ backup: src.id, ...declared });
  }
  return { ...(discard.length ? { discard } : {}), ...(dull.length ? { dull } : {}) };
}

/** The cards and Backups a payment uses. */
export function paymentIds(pay: Payment | undefined): ObjectId[] {
  return [...(pay?.discard ?? []).map((d) => d.card), ...(pay?.dull ?? []).map((d) => d.backup)];
}
