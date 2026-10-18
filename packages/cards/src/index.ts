/**
 * Card definitions: the data of each group (`data/<group>.json`) with its scripts (`src/<group>/`), keyed by card
 * number. What the text says and the engine can read without a script (keywords, Limit Break) is deduced by `fftext.ts`.
 */
import type { CardDef } from "@finalcircle/engine";
import { lbCost, onlyKeywords, printedKeywords } from "./fftext";
import { GROUPS } from "./groups";
import type { RawCard } from "./raw";
import type { CardScript } from "./script";

export {
  DECK_RULES,
  type DeckEntries,
  type DeckValidation,
  FORMAT_LABELS,
  FORMATS,
  type Format,
  l3Sets,
  validateDeck,
} from "./decklist";
export { DECKS, type DeckList, deckById } from "./decks";
export { CARD_NAMES } from "./names";
export type { RawCard } from "./raw";
export type { CardScript } from "./script";
export { CARD_GROUPS, SET_INFO } from "./setRegistry";

export function toCardDef(raw: RawCard, script: CardScript | undefined): CardDef {
  const keywords = [...new Set([...printedKeywords(raw.text, raw.type), ...(script?.keywords ?? [])])];
  const lb = lbCost(raw.text, raw.type);
  return {
    id: raw.id,
    codes: raw.codes,
    name: raw.name,
    type: raw.type,
    elements: raw.elements,
    cost: raw.cost,
    ...(raw.power !== undefined ? { power: raw.power } : {}),
    jobs: raw.jobs,
    categories: raw.categories,
    generic: raw.generic,
    exBurst: raw.exBurst,
    rarity: raw.rarity,
    set: raw.set,
    ...(lb ? { lb } : {}),
    keywords,
    abilities: script?.abilities ?? [],
    ...(script?.summon ? { summon: script.summon } : {}),
    ...(script?.castRules ? { castRules: script.castRules } : {}),
    text: raw.text,
    fr: raw.fr,
    ...(raw.image ? { image: raw.image } : {}),
    implemented: !!script || onlyKeywords(raw.text, raw.type),
  };
}

/** Every card, by the card number of its identity; the first group that has it wins. */
export const CARDS: Record<string, CardDef> = {};
/** Every printed code → card number of the identity. */
export const CODES: Record<string, string> = {};
for (const g of GROUPS)
  for (const raw of g.data) {
    if (!CARDS[raw.id]) CARDS[raw.id] = toCardDef(raw, g.scripts[raw.id]);
    for (const code of raw.codes) CODES[code] ??= raw.id;
  }

/** The definition of a card number or reprint code, if known. */
export function findCard(code: string): CardDef | undefined {
  return CARDS[CODES[code] ?? code];
}

/** The definition of a card number (or of a reprint code); an unknown number is a bug of the caller. */
export function card(code: string): CardDef {
  const d = findCard(code);
  if (!d) throw new Error(`unknown card ${code}`);
  return d;
}

/** The definitions of a deck's entries, one per copy, in order. */
export function buildDeck(entries: [number, string][]): CardDef[] {
  return entries.flatMap(([n, code]) => Array.from({ length: n }, () => card(code)));
}
