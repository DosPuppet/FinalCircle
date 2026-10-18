/**
 * Detects French in the repository's code and documents (code and documentation in English; from Planecircle). Used by
 * `english-source.test.ts` and `tools/french-source.ts`.
 *
 * A line is French when it has two French function words, or one with an accented French word or a verb in "-ez"; a
 * lone accented word counts too, unless it belongs to an English card name. Data that is French on purpose (catalogs,
 * official card data, `french-overrides.json`, `fr`, `nameFr` and `frText` fields) is out of scope.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { CARD_NAMES } from "../src/names";

export const ROOT = new URL("../../../", import.meta.url);

const STOPWORDS = new Set(
  (
    "le la les des du un une est sont vous votre vos nous pour avec dans qui que pas sur aux au ce cette ces ses leur " +
    "leurs il elle ne et à où été être peut plus sans mais ou chaque carte cartes avant avants soutien joueur adversaire"
  ).split(" "),
);
const ACCENTED = /[éèêàùçœâîôûëïüÉÈÊÀÂÎÔÛ]/;
/** Words that are French even alone (no English word or card name is spelled so). */
const STRONG = new Set(
  "vous votre vos avec dans chaque adversaire adversaires joueur joueurs cartes quand alors puis sinon déjà aucun aucune lorsque jusqu".split(
    " ",
  ),
);
const FRENCH_DATA = /\b(fr|nameFr|frText)\s*:\s*[{"'`]/;
/** A `fr:` / `frText:` key whose value the formatter put on the next line. */
const FRENCH_DATA_KEY = /\b(fr|nameFr|frText)\s*:\s*$/;

/** Files in scope: tracked sources, styles, scripts, documents, and the data files written by hand. */
const SCOPE = /\.(ts|tsx|js|mjs|cjs|css|html|md|ya?ml|sh|txt)$/;
const HAND_DATA = [
  /^packages\/cards\/decks\/[^/]+\.json$/,
  /^packages\/cards\/data\/(debt-baseline|audit-baseline|formats|supplement-notes)\.json$/,
];
const EXCLUDED = [/^packages\/[^/]+\/locales\//, /^packages\/client\/public\/sounds\//];

let englishNameWords: Set<string> | undefined;

/** Accented words of English card names: not French. */
function nameWords(): Set<string> {
  if (!englishNameWords) {
    englishNameWords = new Set();
    for (const name of CARD_NAMES)
      for (const w of name.split(/[^\p{L}'’-]+/u)) if (ACCENTED.test(w)) englishNameWords.add(w.toLowerCase());
  }
  return englishNameWords;
}

/** Whether one line of text is French. */
export function isFrenchLine(line: string): boolean {
  const words = line.toLowerCase().split(/[^\p{L}'’-]+/u);
  const stop = new Set<string>();
  let accented = false;
  let ez = false;
  for (const raw of words) {
    const w = raw.replace(/^[ldjnstcqu]['’]/, "");
    if (STOPWORDS.has(w)) stop.add(w);
    if (ACCENTED.test(w) && !nameWords().has(raw)) accented = true;
    if (/^\p{L}{3,}ez$/u.test(w)) ez = true;
  }
  if (stop.size >= 2) return true;
  if (words.some((w) => STRONG.has(w.replace(/^[ldjnstcqu]['’]/, "")))) return true;
  if (stop.size === 1 && (accented || ez)) return true;
  return accented;
}

export function trackedFiles(): string[] {
  return execSync("git ls-files --cached --others --exclude-standard", { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter((f) => f && (SCOPE.test(f) || HAND_DATA.some((r) => r.test(f))) && !EXCLUDED.some((r) => r.test(f)));
}

/** French lines of a file (1-based line numbers). */
export function frenchLines(file: string): { line: number; text: string }[] {
  let text: string;
  try {
    text = readFileSync(new URL(file, ROOT), "utf8");
  } catch {
    return []; // deleted in the working tree
  }
  // French data on purpose: the `fr` fields of a JSON file (deck names), `fr:`, `nameFr:` and `frText:` in code.
  if (file.endsWith(".json"))
    text = JSON.stringify(
      JSON.parse(text, (k, v) => (k === "fr" ? undefined : v)),
      null,
      2,
    );
  // A data value can sit on the lines after its key, joined by "+".
  const lines = text.split("\n");
  const out: { line: number; text: string }[] = [];
  let data = false;
  for (const [i, t] of lines.entries()) {
    const previous = lines[i - 1] ?? "";
    data = FRENCH_DATA.test(t) || FRENCH_DATA_KEY.test(t) || FRENCH_DATA_KEY.test(previous) || (data && /\+\s*$/.test(previous));
    // `i18n-ignore` in a comment: French kept on purpose on this line (or the next one, for a comment on its own line).
    const ignored = t.includes("i18n-ignore") || /^\s*\/\/.*i18n-ignore/.test(previous);
    if (!data && !ignored && isFrenchLine(t)) out.push({ line: i + 1, text: t });
  }
  return out;
}

/** Files that still contain French, with their number of French lines. */
export function frenchFiles(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of trackedFiles()) {
    const n = frenchLines(f).length;
    if (n) out[f] = n;
  }
  return out;
}
