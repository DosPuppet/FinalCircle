/**
 * Random legal decks for the fuzz and the tournament (from Planecircle's random-deck): two elements, 50 main cards
 * (at most 3 per card number) and an LB deck of up to 8 Limit Break cards, drawn from the implemented cards of a card
 * group (or of all groups).
 */
import { CARDS } from "@finalcircle/cards";
import type { CardDef, Element } from "@finalcircle/engine";
import { GROUPS } from "../packages/cards/src/groups";

function rng(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The implemented cards of a group (`undefined`: every group). */
export function poolOf(group?: string): CardDef[] {
  const ids = new Set(GROUPS.filter((g) => !group || g.code === group).flatMap((g) => g.data.map((c) => c.id)));
  return [...ids].map((id) => CARDS[id]).filter((c): c is CardDef => !!c && c.implemented);
}

export function randomDeck(seed: number, group?: string): { main: CardDef[]; lb: CardDef[] } {
  const rand = rng(seed);
  const pool = poolOf(group);
  const elements = [...new Set(pool.flatMap((c) => c.elements).filter((e) => e !== "light" && e !== "dark"))];
  const pair: Element[] = [];
  while (pair.length < 2 && pair.length < elements.length) {
    const e = elements[Math.floor(rand() * elements.length)] as Element;
    if (!pair.includes(e)) pair.push(e);
  }
  const fits = (c: CardDef) => c.elements.every((e) => pair.includes(e));
  const mains = pool.filter((c) => !c.lb && fits(c));
  const others = pool.filter((c) => !c.lb && !fits(c));
  const main: CardDef[] = [];
  const count = new Map<string, number>();
  const add = (from: CardDef[]) => {
    for (let tries = 0; tries < 500 && main.length < 50 && from.length; tries++) {
      const c = from[Math.floor(rand() * from.length)] as CardDef;
      if ((count.get(c.id) ?? 0) >= 3) continue;
      count.set(c.id, (count.get(c.id) ?? 0) + 1);
      main.push(c);
    }
  };
  add(mains);
  add(others);
  const lbs = pool.filter((c) => c.lb && fits(c));
  const lb: CardDef[] = [];
  const lbCount = new Map<string, number>();
  const size = Math.floor(rand() * 9);
  for (let tries = 0; tries < 100 && lb.length < size && lbs.length; tries++) {
    const c = lbs[Math.floor(rand() * lbs.length)] as CardDef;
    if ((lbCount.get(c.id) ?? 0) >= 3) continue;
    lbCount.set(c.id, (lbCount.get(c.id) ?? 0) + 1);
    lb.push(c);
  }
  return { main, lb };
}
