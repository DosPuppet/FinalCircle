/**
 * Card texts of the official data: normalization of the markup, alignment of the French text on the English
 * abilities, and what can be read from a text (keywords, EX Burst, Limit Break, Damage N, kinds and costs of the
 * abilities). Counterpart of Planecircle's `scryfall.ts`.
 *
 * Markup: `[[br]]` separates abilities (CR 11.5.3); `[[i]]…[[/]]` italics ("Card Name X", "Job X", "Damage 3 --"),
 * `[[s]]…[[/]]` a special ability's name, `[[ex]]EX BURST[[/]]`, `[[b]]` bold; `《…》` symbols: `《火》` (CP of an
 * element), `《1》` (generic CP), `《ダル》` (Dull), `《S》` (special), `《C》` (Crystal), `《X》`, `《LB》`.
 */
import type { AbilityCost, CardType, CpCost, Element, Keyword } from "@finalcircle/engine";

/** Element of the kanji used by the official data (`element` field and CP symbols). */
export const KANJI: Record<string, Element> = {
  火: "fire",
  氷: "ice",
  風: "wind",
  土: "earth",
  雷: "lightning",
  水: "water",
  光: "light",
  闇: "dark",
};

const ENTITIES: Record<string, string> = {
  "&middot;": "·",
  "&amp;": "&",
  "&#39;": "'",
  "&#039;": "'",
  "&quot;": '"',
  "&lt;": "<",
  "&gt;": ">",
  "&nbsp;": " ",
};

export function decodeEntities(s: string): string {
  return s.replace(/&[#\w]+;/g, (e) => ENTITIES[e] ?? e);
}

const TAG = /\[\[(br|i|b|s|ex|\/)\]\]/g;
/** Italic spans are short phrases; a longer one is a misplaced tag of the data (11-121C). */
const MAX_ITALIC = 32;

/**
 * Balances the spans: a span still open at a line break is closed there, a closing tag without an opening is dropped,
 * a new opening closes the previous span; empty spans, over-long italics and italics without a letter are unwrapped.
 */
function repairTags(t: string): string {
  let out = "";
  let open: string | null = null;
  let last = 0;
  for (const m of t.matchAll(TAG)) {
    out += t.slice(last, m.index);
    last = (m.index ?? 0) + m[0].length;
    const tag = m[1] as string;
    if (tag === "br") {
      if (open) out += "[[/]]";
      open = null;
      out += "[[br]]";
    } else if (tag === "/") {
      if (open) out += "[[/]]";
      open = null;
    } else {
      if (open) out += "[[/]]";
      open = tag;
      out += `[[${tag}]]`;
    }
  }
  out += t.slice(last);
  if (open) out += "[[/]]";
  return out
    .replace(/\[\[(i|b|s)\]\]\s*\[\[\/\]\]/g, " ")
    .replace(/\[\[i\]\]([^[]*)\[\[\/\]\]/g, (whole, body: string) =>
      body.length > MAX_ITALIC || !/\p{L}/u.test(body) ? body : whole,
    );
}

/** Normalized text of the official data (English or French). */
export function normalizeText(raw: string | null | undefined): string {
  let t = decodeEntities(raw ?? "");
  t = t.replace(/<\/?p>/g, "").replace(/\r?\n/g, " ");
  // Full-width digits in symbols (《１》).
  t = t.replace(
    /《([０-９]+)》/g,
    (_, d: string) => `《${String.fromCharCode(...[...d].map((c) => c.charCodeAt(0) - 0xfee0))}》`,
  );
  t = t.replace(/\s*\[\[br\]\]\s*/g, "[[br]]");
  // An EX BURST tag opened before a line break (13-072R: "…reduced by 3.[[ex]][[br]]   EX BURST[[/]]").
  t = t.replace(/\[\[ex\]\](\[\[br\]\])\s*EX BURST\s*\[\[\/\]\]/g, "$1[[ex]]EX BURST[[/]]");
  t = t.replace(/\[\[ex\]\]\s*EX BURST\s*\[\[\/\]\]\s*/g, "[[ex]]EX BURST[[/]] ");
  // A special ability's name marked as italics (18-129C in French).
  t = t.replace(/\[\[i\]\]([^[]+?)\s*\[\[\/\]\]\s*(?=《S》)/g, "[[s]]$1[[/]] ");
  t = repairTags(t);
  t = t.replace(/^(\[\[br\]\])+|(\[\[br\]\])+$/g, "");
  return t
    .split("[[br]]")
    .map((p) => p.replace(/ {2,}/g, " ").trim())
    .join("[[br]]");
}

/** A French segment that starts an ability (and not the next sentence of the previous one). */
const FRENCH_START =
  // i18n-ignore: the French openings of the official ability texts
  /^(Lorsque|Lorsqu['’]|Si |S['’]|Au début|À la fin|Les |Le |La |L['’]|Tous |Toutes |Aucun|Vous ne pouvez|Un |Une |《|\[\[s\]\]|\[\[ex\]\]|\[\[i\]\]|\(|"|Bravoure|Booster|Initiative|Attaque Arrière)/;
/** An action ability: its cost before " : ". */
const ACTION_START = /^[^.]{0,160} : /;
const SENTENCE_END = /[.!?»"”)]$/;

/**
 * French text split like the English one, ability by ability: the French data breaks lines inside abilities (11-010C,
 * 22-068R). Returns whether the counts now agree (otherwise the import reports the card).
 */
export function alignFrench(en: string, fr: string): { text: string; aligned: boolean } {
  const want = en ? en.split("[[br]]").length : 0;
  let parts = fr ? fr.split("[[br]]") : [];
  if (parts.length === want) return { text: fr, aligned: true };
  const joined: string[] = [];
  for (const p of parts) {
    const prev = joined[joined.length - 1];
    const bare = prev?.replace(/(\[\[\/\]\])+$/, "");
    if (prev !== undefined && (!SENTENCE_END.test(bare ?? "") || /^\p{Ll}/u.test(p))) joined[joined.length - 1] = `${prev} ${p}`;
    else joined.push(p);
  }
  parts = joined;
  while (parts.length > want) {
    const i = parts.findIndex((p, k) => k > 0 && !FRENCH_START.test(p) && !ACTION_START.test(p));
    if (i < 0) break;
    parts.splice(i - 1, 2, `${parts[i - 1]} ${parts[i]}`);
  }
  return { text: parts.join("[[br]]"), aligned: parts.length === want };
}

export type ParsedKind = "reminder" | "lb" | "keyword" | "castRule" | "auto" | "action" | "special" | "field" | "summon";

/** One paragraph of a text (CR 11.5.3), as the parser reads it. */
export interface ParsedAbility {
  kind: ParsedKind;
  /** The paragraph without its EX BURST and Damage N prefixes. */
  text: string;
  exBurst?: boolean;
  /** "Damage N --" (CR 15.2.6). */
  damage?: number;
  keywords?: Keyword[];
  /** "Limit Break -- X" (CR 15.2.8.2). */
  lb?: number;
  specialName?: string;
  /** The cost of an action or special ability (before the colon). */
  cost?: string;
}

const KEYWORDS: Record<string, Keyword> = {
  Haste: "haste",
  Brave: "brave",
  "First Strike": "firstStrike",
  "Back Attack": "backAttack",
};
const KEYWORD_LINE = /^(Haste|Brave|First Strike|Back Attack)(\s*(,|and)\s*(Haste|Brave|First Strike|Back Attack))*$/;
const AUTO = /^(When|Whenever|At the beginning|At the end)\b/;
const COST_PHRASE = /《|[Pp]ut .+ into the Break Zone|[Dd]iscard |[Rr]emove |[Dd]ull /;

/**
 * The abilities of a text (CR 11.5.3): its paragraphs, except that the quoted modes of a "select N of the following
 * actions" ability, printed on lines of their own (20-103H), belong to that ability.
 */
export function paragraphs(text: string): string[] {
  const out: string[] = [];
  for (const p of text ? text.split("[[br]]") : []) {
    const prev = out.length - 1;
    if (prev >= 0 && /^["“]/.test(p.trim()) && /following actions|["”]$/.test(out[prev] as string))
      out[prev] = `${out[prev]} ${p.trim()}`;
    else out.push(p);
  }
  return out;
}

/** The abilities of an English text and their kinds. */
export function parseAbilities(text: string, type: CardType): ParsedAbility[] {
  return paragraphs(text).map((raw) => {
    let p = raw.trim();
    if (/^\(.*\)$/.test(p)) return { kind: "reminder", text: p };
    const lb = /^\[\[i\]\]Limit Break -- (\d+)\[\[\/\]\]$/.exec(p);
    if (lb) return { kind: "lb", text: p, lb: Number(lb[1]) };
    if (KEYWORD_LINE.test(p))
      return { kind: "keyword", text: p, keywords: p.split(/\s*(?:,|and)\s*/).map((k) => KEYWORDS[k] as Keyword) };
    const out: ParsedAbility = { kind: "field", text: p };
    const ex = /^\[\[ex\]\]EX BURST\[\[\/\]\]\s*/.exec(p);
    if (ex) {
      out.exBurst = true;
      p = p.slice(ex[0].length);
    }
    const dmg = /^\[\[i\]\]Damage (\d+) ?--\s*\[\[\/\]\]\s*/.exec(p);
    if (dmg) {
      out.damage = Number(dmg[1]);
      p = p.slice(dmg[0].length);
    }
    out.text = p;
    const special = /^\[\[s\]\](.+?)\[\[\/\]\]\s*(《S》.*?):\s/.exec(p);
    const action = /^((?:《[^》]+》|[^:."])+?):\s/.exec(p);
    if (special) {
      out.kind = "special";
      out.specialName = (special[1] as string).trim();
      out.cost = (special[2] as string).trim();
    } else if (AUTO.test(p)) out.kind = "auto";
    else if (action && COST_PHRASE.test(action[1] as string)) {
      out.kind = "action";
      out.cost = (action[1] as string).trim();
    } else if (/the cost required to cast|You can only pay with .+ CP to cast/.test(p)) out.kind = "castRule";
    else if (type === "Summon") out.kind = "summon";
    return out;
  });
}

/** Keywords printed as their own paragraph (CR 15.2), e.g. "First Strike" on 23-119R. */
export function printedKeywords(text: string, type: CardType): Keyword[] {
  return parseAbilities(text, type).flatMap((a) => (a.kind === "keyword" ? (a.keywords ?? []) : []));
}

/** The Limit Break cost, if the text has one (CR 15.2.8.2). */
export function lbCost(text: string, type: CardType): number | undefined {
  return parseAbilities(text, type).find((a) => a.kind === "lb")?.lb;
}

/** A text that needs no script: nothing but keywords, Limit Break and reminder text (or no text). */
export function onlyKeywords(text: string, type: CardType): boolean {
  return parseAbilities(text, type).every((a) => a.kind === "reminder" || a.kind === "lb" || a.kind === "keyword");
}

/**
 * The cost before the colon of an action or special ability (CR 11.6.2): its symbols and the costs written as text
 * ("put Warrior into the Break Zone", "discard Machinist", "remove … in the Break Zone from the game"). Null for a cost
 * the parser does not read.
 */
export function parseCost(cost: string): AbilityCost | null {
  const out: AbilityCost = {};
  const cp: CpCost = { elements: {}, generic: 0 };
  let hasCp = false;
  let rest = cost;
  for (const m of cost.matchAll(/《([^》]+)》/g)) {
    const sym = m[1] as string;
    if (sym === "ダル") out.dull = true;
    else if (sym === "S") out.special = true;
    else if (sym === "C") out.crystals = (out.crystals ?? 0) + 1;
    else if (/^\d+$/.test(sym)) {
      cp.generic += Number(sym);
      hasCp = true;
    } else if (KANJI[sym]) {
      const e = KANJI[sym] as Element;
      cp.elements[e] = (cp.elements[e] ?? 0) + 1;
      hasCp = true;
    } else return null;
  }
  rest = rest.replace(/《[^》]+》/g, "").replace(/^\[\[s\]\].*?\[\[\/\]\]/, "");
  for (const phrase of rest
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)) {
    if (/^put .+ into the Break Zone$/.test(phrase)) out.putSelfIntoBreak = true;
    else if (/^discard [^\d]+$/.test(phrase)) out.discardSelf = true;
    else if (/^Remove .+ in the Break Zone from the game$/.test(phrase)) out.removeSelf = true;
    else if (/^Put .+ into the Break Zone$/.test(phrase)) out.putSelfIntoBreak = true;
    else return null;
  }
  if (hasCp) out.cp = cp;
  return out;
}
