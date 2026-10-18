/**
 * Deck construction (CR 8.1) and format legality: Standard (every set, official ban and restricted list) and L3 (the
 * latest three booster sets). Every message is player-facing text (`msg`), translated by the client.
 */
import { type CardDef, cardRef, msg } from "@finalcircle/engine";
import formats from "../data/formats.json";
import { latestBoosters } from "./setRegistry";

export const DECK_RULES = { main: 50, lbMax: 8, maxCopies: 3 } as const;

export type Format = "standard" | "l3";
export const FORMATS: Format[] = ["standard", "l3"];
export const FORMAT_LABELS: Record<Format, string> = { standard: msg("Standard"), l3: msg("L3") };

/** Deck entries: `[count, card number]`. */
export interface DeckEntries {
  main: [number, string][];
  lb?: [number, string][];
}

export interface DeckValidation {
  /** Construction and format rules are met. */
  legal: boolean;
  /** Every card is handled by the engine. */
  playable: boolean;
  errors: string[];
  warnings: string[];
  mainCount: number;
  lbCount: number;
}

interface FormatRules {
  banned: string[];
  restricted?: Record<string, number>;
  nameGroups?: { with: string; names: string[]; max: number }[];
}

const RULES: Record<Format, FormatRules> = { standard: formats.standard, l3: formats.l3 };

/** The booster sets legal in L3 on a date (by serial number). */
export function l3Sets(date: string): number[] {
  return latestBoosters(date, formats.l3.boosters);
}

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Checks a deck: exactly 50 main cards and 0 to 8 LB cards (CR 8.1.1.1), LB cards in the LB deck only (8.1.3), at most
 * 3 copies of a card number (8.1.1.2), then the format; `find` gives the definition of a card number or reprint code.
 */
export function validateDeck(
  deck: DeckEntries,
  find: (code: string) => CardDef | undefined,
  format: Format = "standard",
  opts: { date?: string } = {},
): DeckValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const lb = deck.lb ?? [];
  const mainCount = deck.main.reduce((n, [c]) => n + c, 0);
  const lbCount = lb.reduce((n, [c]) => n + c, 0);
  if (mainCount !== DECK_RULES.main) errors.push(msg("The main deck must have exactly 50 cards (it has {n})", { n: mainCount }));
  if (lbCount > DECK_RULES.lbMax) errors.push(msg("The LB deck can have at most 8 cards (it has {n})", { n: lbCount }));

  const copies = new Map<string, number>();
  const defs = new Map<string, CardDef>();
  let unknown = false;
  const check = (entries: [number, string][], inLb: boolean) => {
    for (const [count, code] of entries) {
      const c = find(code);
      if (!c) {
        errors.push(msg("Unknown card: {code}", { code }));
        unknown = true;
        continue;
      }
      copies.set(c.id, (copies.get(c.id) ?? 0) + count);
      defs.set(c.id, c);
      if (!inLb && c.lb) errors.push(msg("{card}: Limit Break cards go in the LB deck only", { card: cardRef(c.id) }));
      if (inLb && !c.lb) errors.push(msg("{card}: only Limit Break cards go in the LB deck", { card: cardRef(c.id) }));
    }
  };
  check(deck.main, false);
  check(lb, true);
  for (const [id, n] of copies)
    if (n > DECK_RULES.maxCopies) errors.push(msg("{card}: at most 3 copies (the deck has {n})", { card: cardRef(id), n }));

  const rules = RULES[format];
  const label = FORMAT_LABELS[format];
  const window = format === "l3" ? l3Sets(opts.date ?? today()) : null;
  for (const [id, n] of copies) {
    const c = defs.get(id) as CardDef;
    if (rules.banned.includes(id)) errors.push(msg("{card} is banned in {format}", { card: cardRef(id), format: label }));
    const max = rules.restricted?.[id];
    if (max !== undefined && n > max)
      errors.push(msg("{card} is restricted to {max} copy in {format}", { card: cardRef(id), max, format: label }));
    if (window && !window.includes(c.set))
      errors.push(msg("{card} is not legal in L3 (set {set})", { card: cardRef(id), set: c.set || "-" }));
    if (!c.implemented) warnings.push(msg("{card} is not playable yet", { card: cardRef(id) }));
  }
  for (const g of rules.nameGroups ?? []) {
    if (!copies.has(g.with)) continue;
    const named = [...copies].filter(([id]) => g.names.includes(defs.get(id)?.name ?? "")).reduce((t, [, n]) => t + n, 0);
    if (named > g.max)
      errors.push(
        msg("With {card}, at most {max} cards named {names} in total", {
          card: cardRef(g.with),
          max: g.max,
          names: g.names.join(" / "),
        }),
      );
  }
  return {
    legal: errors.length === 0,
    playable: !unknown && warnings.length === 0,
    errors,
    warnings,
    mainCount,
    lbCount,
  };
}
