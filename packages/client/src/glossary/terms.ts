/**
 * The glossary: the keywords and game terms, each with its definition (CR v3.3, `docs/rules.md`), and the words that
 * name it in the card texts. Those words are a message too (`ctx:forms|…`): the French forms come from the catalog,
 * checked against the official French texts (`client/test/glossary.test.ts`). `#` stands for a number ("Damage 3").
 */
import { msg } from "@finalcircle/engine";
import { type Lang, textIn } from "../translate";

export type TermGroup = "abilities" | "actions" | "resources" | "cards";

export interface GlossaryTerm {
  id: string;
  group: TermGroup;
  name: string;
  definition: string;
  /** Words of the card texts, comma-separated; none: the term is only in the glossary (card types). */
  forms?: string;
  /** Symbol of the card texts (`《S》`…) whose icon also explains the term. */
  symbol?: string;
}

export const GROUP_LABEL: Record<TermGroup, string> = {
  abilities: msg("Keyword abilities"),
  actions: msg("Keyword actions"),
  resources: msg("Costs and zones"),
  cards: msg("Card types"),
};

export const GLOSSARY: GlossaryTerm[] = [
  // CR 15.2: keyword abilities (Freeze, 15.2.4, is with the actions it reads like).
  {
    id: "haste",
    group: "abilities",
    name: msg("Haste"),
    forms: msg("ctx:forms|Haste"),
    definition: msg(
      "This Character can attack, and use abilities with 《ダル》 in their cost, on the turn it comes under your control.",
    ),
  },
  {
    id: "brave",
    group: "abilities",
    name: msg("Brave"),
    forms: msg("ctx:forms|Brave"),
    definition: msg(
      "This Forward does not dull when it attacks, so it can still block afterwards. It still attacks only once per turn.",
    ),
  },
  {
    id: "firstStrike",
    group: "abilities",
    name: msg("First Strike"),
    forms: msg("ctx:forms|First Strike"),
    definition: msg(
      "In battle, this Forward deals its damage before the Forwards without First Strike: it may break them before they strike back. A party has First Strike only if every member has it.",
    ),
  },
  {
    id: "backAttack",
    group: "abilities",
    name: msg("Back Attack"),
    forms: msg("ctx:forms|Back Attack"),
    definition: msg(
      "You may cast this Character whenever you have priority during your or your opponent's Main Phase or Attack Phase, even in response to a card. It still does not go on the stack.",
    ),
  },
  {
    id: "damage",
    group: "abilities",
    name: msg("Damage N"),
    forms: msg("ctx:forms|Damage #"),
    definition: msg(
      "The ability written after it works only while you have received at least that many points of damage (cards in your Damage Zone).",
    ),
  },
  {
    id: "exBurst",
    group: "abilities",
    name: msg("EX BURST"),
    forms: msg("ctx:forms|EX BURST"),
    definition: msg(
      "When this card goes to your Damage Zone because you received damage, you may use its EX BURST effect at once, for free. No one can respond to it.",
    ),
  },
  {
    id: "limitBreak",
    group: "abilities",
    name: msg("Limit Break"),
    forms: msg("ctx:forms|Limit Break"),
    symbol: "LB",
    definition: msg(
      "A card of your Limit Break deck (up to 8 cards, apart from your deck). Cast it by paying its cost and turning face up as many face-down cards of your LB deck as its Limit Break number. When it leaves the field, or once a Summon is resolved, it goes back face up to your LB deck.",
    ),
  },
  {
    id: "warp",
    group: "abilities",
    name: msg("Warp"),
    forms: msg("ctx:forms|Warp #, Warp"),
    definition: msg(
      "Warp X -- cost: in your Main Phase, you may pay the Warp cost instead of casting the card. It is removed from the game with X Warp counters; at the start of each of your Main Phase 1, one counter is removed, and when the last one is, the card enters the field.",
    ),
  },
  {
    id: "priming",
    group: "abilities",
    name: msg("Priming"),
    forms: msg("ctx:forms|Priming"),
    definition: msg(
      "Priming name -- cost: in your Main Phase, pay the cost to search your deck for a Character with that name and put it on top of this Character. The two cards are one Character with the power and text of the top card; damage and status stay.",
    ),
  },
  // CR 15.1: keyword actions.
  {
    id: "dull",
    group: "actions",
    name: msg("ctx:term|Dull"),
    forms: msg("ctx:forms|Dull, Dulls, Dulled"),
    symbol: "ダル",
    definition: msg(
      "Turn a card sideways. A dull Forward cannot block, and a Backup dulls to produce CP. 《ダル》 in a cost means: dull this card.",
    ),
  },
  {
    id: "activate",
    group: "actions",
    name: msg("ctx:term|Activate"),
    forms: msg("ctx:forms|Activate, Activates, Activated"),
    definition: msg("Turn a dull card upright again. Your cards activate at the start of your turn, in the Active Phase."),
  },
  {
    id: "break",
    group: "actions",
    name: msg("ctx:term|Break"),
    forms: msg("ctx:forms|Break, Breaks, Broken"),
    definition: msg(
      "Put a Character from the field into its owner's Break Zone. A Forward that has received damage equal to or greater than its power is broken. A card put into the Break Zone to pay a cost is not broken.",
    ),
  },
  {
    id: "freeze",
    group: "actions",
    name: msg("ctx:term|Freeze"),
    forms: msg("ctx:forms|Freeze, Freezes, Frozen"),
    definition: msg("A frozen Character does not activate during its controller's next Active Phase."),
  },
  {
    id: "remove",
    group: "actions",
    name: msg("ctx:term|Remove from the game"),
    forms: msg("ctx:forms|Remove it from the game, Remove them from the game, removed from the game, from the game"),
    definition: msg("Put a card out of the game, in its owner's removed cards. It stays there unless a card brings it back."),
  },
  {
    id: "search",
    group: "actions",
    name: msg("ctx:term|Search"),
    forms: msg("ctx:forms|Search, Searches"),
    definition: msg(
      "Look through your deck for the cards asked, reveal them, then shuffle your deck. You may fail to find them.",
    ),
  },
  {
    id: "discard",
    group: "actions",
    name: msg("ctx:term|Discard"),
    forms: msg("ctx:forms|Discard, Discards, Discarded"),
    definition: msg(
      "Put a card from your hand into your Break Zone. To pay a cost, you may also discard a card for 2 CP of its element.",
    ),
  },
  {
    id: "party",
    group: "actions",
    name: msg("ctx:term|Party"),
    forms: msg("ctx:forms|party, parties"),
    definition: msg(
      "Two or more Forwards that share an element may attack together. If nobody blocks, the party deals only 1 point of damage; if it is blocked, the blocker takes the total power of the party.",
    ),
  },
  // CR 5.2.1.3, 6.8, 11.7, 7: costs and zones.
  {
    id: "cp",
    group: "resources",
    name: msg("CP"),
    forms: msg("ctx:forms|CP"),
    definition: msg(
      "Crystal Points pay for cards and abilities. Discard a card from your hand for 2 CP of its element, or dull a Backup for 1 CP of its element. Light and Dark cards cannot be discarded for CP.",
    ),
  },
  {
    id: "crystal",
    group: "resources",
    name: msg("ctx:term|Crystal"),
    forms: msg("ctx:forms|Crystal, Crystals"),
    symbol: "C",
    definition: msg("A resource some cards give you, kept from turn to turn. 《C》 in a cost means: spend a Crystal."),
  },
  {
    id: "special",
    group: "resources",
    name: msg("Special ability"),
    forms: msg("ctx:forms|special ability, special abilities"),
    symbol: "S",
    definition: msg(
      "An ability with a name and the 《S》 icon. To use it, besides its cost, discard from your hand a card with the same name as its card.",
    ),
  },
  {
    id: "breakZone",
    group: "resources",
    name: msg("Break Zone"),
    forms: msg("ctx:forms|Break Zone"),
    definition: msg("Your discard pile, face up: broken Characters, resolved Summons and discarded cards go there."),
  },
  {
    id: "damageZone",
    group: "resources",
    name: msg("Damage Zone"),
    forms: msg("ctx:forms|Damage Zone"),
    definition: msg(
      "For each point of damage you receive, the top card of your deck goes there. At 7 points of damage, you lose the game.",
    ),
  },
  // CR 5.2.3: card types (only in the glossary: card texts name them everywhere).
  {
    id: "forward",
    group: "cards",
    name: msg("Forward"),
    definition: msg(
      "A Character that attacks and blocks. Damage equal to or greater than its power breaks it; damage is removed at the end of each turn.",
    ),
  },
  {
    id: "backup",
    group: "cards",
    name: msg("Backup"),
    definition: msg(
      "A Character that brings you CP: dull it for 1 CP of its element. It enters the field dull, and you can control at most 5 Backups.",
    ),
  },
  {
    id: "monster",
    group: "cards",
    name: msg("Monster"),
    definition: msg("A Character that is neither a Forward nor a Backup. Some can become Forwards for a while."),
  },
  {
    id: "summon",
    group: "cards",
    name: msg("Summon"),
    definition: msg(
      "A one-shot card: it goes on the stack, either player may respond, then its effect happens and it goes to the Break Zone.",
    ),
  },
  {
    id: "character",
    group: "cards",
    name: msg("Character"),
    definition: msg(
      "A Forward, a Backup or a Monster: a card that stays on the field. Without the generic icon, you can control only one Character with a given name.",
    ),
  },
];

export const termById = (id: string) => GLOSSARY.find((x) => x.id === id);

/** The term whose icon is this symbol of the card texts (`《S》` → special ability). */
export const termOfSymbol = (sym: string) => GLOSSARY.find((x) => x.symbol === sym);

/** The words of a term in a language (`#` kept). */
export const formsOf = (term: GlossaryTerm, lang: Lang): string[] =>
  term.forms
    ? textIn(lang, term.forms)
        .split(",")
        .map((f) => f.trim())
        .filter(Boolean)
    : [];

/** A word as a pattern: its first letter in either case (start of a sentence), `#` a number. */
function pattern(form: string): string {
  const escaped = form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/#/g, "\\d+");
  const first = form[0] as string;
  const lower = first.toLowerCase();
  const upper = first.toUpperCase();
  return lower === upper ? escaped : `[${lower}${upper}]${escaped.slice(1)}`;
}

const matchers = new Map<Lang, { re: RegExp; terms: GlossaryTerm[] }>();

/** One pattern for every word of every term, the longest first ("Break Zone" before "Break"); group i → terms[i]. */
function matcher(lang: Lang): { re: RegExp; terms: GlossaryTerm[] } {
  let m = matchers.get(lang);
  if (!m) {
    const forms = GLOSSARY.flatMap((term) => formsOf(term, lang).map((form) => ({ form, term }))).sort(
      (a, b) => b.form.length - a.form.length,
    );
    const alternatives = forms.map((f) => `(${pattern(f.form)})`).join("|");
    m = { re: new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives})(?![\\p{L}\\p{N}])`, "gu"), terms: forms.map((f) => f.term) };
    matchers.set(lang, m);
  }
  return m;
}

export type TermPiece = string | { term: GlossaryTerm; text: string };

/** A run of card text cut into plain text and glossary terms. */
export function splitTerms(text: string, lang: Lang): TermPiece[] {
  const { re, terms } = matcher(lang);
  const out: TermPiece[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const at = m.index ?? 0;
    const group = m.slice(1).findIndex((g) => g !== undefined);
    const term = terms[group];
    if (!term) continue;
    if (at > last) out.push(text.slice(last, at));
    out.push({ term, text: m[0] });
    last = at + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
