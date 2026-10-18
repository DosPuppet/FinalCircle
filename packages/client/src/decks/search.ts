/**
 * Deck builder search (from Planecircle, FFTCG vocabulary):
 * - free words: name, job, category or text, in English or French;
 * - `t:` type (`t:forward`, `t:avant`), `e:` element (`e:fire`, `e:feu`), `j:` job, `cat:` category, `r:` rarity,
 *   `s:` set number;
 * - `cost` and `power` with `:`, `=`, `<`, `>`, `<=`, `>=` (`cost<=2`, `power>=8000`);
 * - `is:ex`, `is:lb`, `is:generic`, `is:multi`;
 * - quotes for a text of several words (`"draw 1 card"`), `-` before a term to exclude it.
 */
import type { CardDef, Element } from "@finalcircle/engine";

type Term = { negate: boolean; test: (c: CardDef) => boolean };

/** Lower case without accents (a query without accents finds an accented name). */
export function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

const ELEMENT_WORDS: Record<string, Element> = {
  fire: "fire",
  feu: "fire",
  ice: "ice",
  glace: "ice",
  wind: "wind",
  vent: "wind",
  earth: "earth",
  terre: "earth",
  lightning: "lightning",
  foudre: "lightning",
  water: "water",
  eau: "water",
  light: "light",
  lumiere: "light",
  dark: "dark",
  tenebres: "dark",
};

const TYPE_WORDS: Record<string, CardDef["type"]> = {
  forward: "Forward",
  avant: "Forward",
  backup: "Backup",
  soutien: "Backup",
  summon: "Summon",
  invocation: "Summon",
  monster: "Monster",
  monstre: "Monster",
};

const haystack = (c: CardDef) =>
  normalize([c.name, c.fr?.name, c.jobs.join(" "), c.fr?.job, c.categories.join(" "), c.text, c.fr?.text].join(" "));

const texts = (c: CardDef) => normalize([c.text, c.fr?.text].join(" "));

function compare(op: string, a: number, b: number): boolean {
  switch (op) {
    case "<":
      return a < b;
    case ">":
      return a > b;
    case "<=":
      return a <= b;
    case ">=":
      return a >= b;
    default:
      return a === b;
  }
}

/** Splits the query into terms (quotes keep the spaces). */
function tokens(query: string): string[] {
  return [...query.matchAll(/-?(?:[a-z]+(?:<=|>=|:|=|<|>))?(?:"[^"]*"|\S+)/gi)].map((m) => m[0]);
}

function term(raw: string): Term | null {
  const negate = raw.startsWith("-") && raw.length > 1;
  const t = negate ? raw.slice(1) : raw;
  const m = /^([a-z]+)(<=|>=|:|=|<|>)(.*)$/i.exec(t);
  const unquote = (v: string) => normalize(v.replace(/^"|"$/g, ""));
  if (!m) {
    const v = unquote(t);
    return v ? { negate, test: (c) => haystack(c).includes(v) } : null;
  }
  const [, key = "", op = ":", value = ""] = m;
  const v = unquote(value);
  const num = Number(v);
  switch (key.toLowerCase()) {
    case "t":
    case "type": {
      const type = TYPE_WORDS[v];
      return type ? { negate, test: (c) => c.type === type } : null;
    }
    case "e":
    case "element": {
      const els = v.split(/[,/]/).map((w) => ELEMENT_WORDS[w]);
      return els.every(Boolean) ? { negate, test: (c) => els.every((e) => c.elements.includes(e as Element)) } : null;
    }
    case "j":
    case "job":
      return { negate, test: (c) => normalize([c.jobs.join(" "), c.fr?.job].join(" ")).includes(v) };
    case "cat":
    case "category":
      return { negate, test: (c) => c.categories.some((x) => normalize(x).includes(v)) };
    case "o":
    case "text":
      return { negate, test: (c) => texts(c).includes(v) };
    case "r":
    case "rarity":
      return { negate, test: (c) => normalize(c.rarity).startsWith(v) };
    case "s":
    case "set":
      return Number.isNaN(num) ? null : { negate, test: (c) => c.set === num };
    case "cost":
    case "cp":
      return Number.isNaN(num) ? null : { negate, test: (c) => compare(op, c.cost, num) };
    case "p":
    case "power":
      return Number.isNaN(num) ? null : { negate, test: (c) => c.power !== undefined && compare(op, c.power, num) };
    case "is":
      switch (v) {
        case "ex":
          return { negate, test: (c) => c.exBurst };
        case "lb":
          return { negate, test: (c) => c.lb !== undefined };
        case "generic":
          return { negate, test: (c) => c.generic };
        case "multi":
          return { negate, test: (c) => c.elements.length > 1 };
        default:
          return null;
      }
    default:
      // Unknown key: the term is searched as is.
      return { negate, test: (c) => haystack(c).includes(normalize(t)) };
  }
}

/** Search filter: every condition must hold (those preceded by `-` excluded). */
export function searchFilter(query: string): (c: CardDef) => boolean {
  const terms = tokens(query.trim())
    .map(term)
    .filter((x): x is Term => !!x);
  return (c) => terms.every((x) => x.test(c) !== x.negate);
}
