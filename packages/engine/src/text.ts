/**
 * Player-facing text (from Planecircle). The engine and the server write English; each client translates into its own language
 * (`client/src/translate.ts`), since an online game can seat players who read different languages.
 *
 * - A static text is a plain English string: it is its own message id in the catalogs (`<package>/locales/fr*.json`).
 * - A text with values is built by `msg(template, args)`: each `{name}` of the template becomes the marker
 *   `⟨name|value⟩`, so the reader can recover the template (the message id) and translate the values in turn.
 * - A card is cited by `cardRef(defId)` (`⟦defId⟧`, choices.ts), always as an argument of `msg`, so the template does
 *   not depend on the card.
 * - A message id may start with a context, `ctx:<context>|`, when one English text needs two translations; the context
 *   is not displayed.
 *
 * Fields stay `string`: no type, view or protocol change. Outside the interface (tools, logs, tests), `plainText` gives
 * the English text.
 */

export type TextArg = string | number;

const OPEN = "⟨";
const CLOSE = "⟩";
const SEP = "|";
const CONTEXT = /^ctx:[^|]*\|/;

/**
 * An English text with values: `msg("Exile {n} card(s)", { n: 2 })`. The first argument must be a string literal, so
 * that the catalog test (`cards/test/locales.test.ts`) finds every message id in the source. Without values, `msg` only
 * marks a literal as player-facing text and returns it unchanged.
 */
export function msg(template: string, args?: Record<string, TextArg>): string {
  if (!args) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in args ? `${OPEN}${name}${SEP}${String(args[name])}${CLOSE}` : whole,
  );
}

/** A text split into its message id (template with `{name}` placeholders) and its argument values. */
export interface ParsedText {
  id: string;
  args: Record<string, string>;
}

/**
 * Splits a text built by `msg`. Markers nest (an argument can itself be a `msg` text), so the scan counts brackets. A
 * malformed marker (no `|` or no closing bracket) is kept as text.
 */
export function parseText(text: string): ParsedText {
  if (!text.includes(OPEN)) return { id: text, args: {} };
  const args: Record<string, string> = {};
  let id = "";
  let i = 0;
  while (i < text.length) {
    const start = text.indexOf(OPEN, i);
    if (start < 0) break;
    let depth = 0;
    let end = -1;
    for (let j = start; j < text.length; j++) {
      if (text[j] === OPEN) depth++;
      else if (text[j] === CLOSE && --depth === 0) {
        end = j;
        break;
      }
    }
    const body = end < 0 ? "" : text.slice(start + 1, end);
    const sep = body.indexOf(SEP);
    if (end < 0 || sep <= 0 || !/^\w+$/.test(body.slice(0, sep))) {
      id += text.slice(i, start + 1);
      i = start + 1;
      continue;
    }
    const name = body.slice(0, sep);
    args[name] = body.slice(sep + 1);
    id += `${text.slice(i, start)}{${name}}`;
    i = end + 1;
  }
  return { id: id + text.slice(i), args };
}

/** How a reader renders a text: the translation of a message id, and the name of a cited card. */
export interface TextReader {
  /** Translation of a message id (template or static text); `undefined` when the catalog has none. */
  translate(id: string): string | undefined;
  /** Name of the card cited by `⟦defId⟧`. */
  card(defId: string): string;
}

/**
 * Renders a text for a reader: translation of the template, then of each argument (which can be a `msg` text, a card
 * reference, a translatable word or a raw value), then the card references left in the text.
 */
export function renderText(text: string, reader: TextReader): string {
  const { id, args } = parseText(text);
  const template = reader.translate(id) ?? id.replace(CONTEXT, "");
  const filled = template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = args[name];
    return value === undefined ? whole : renderText(value, reader);
  });
  return filled.replace(/⟦([^⟧]+)⟧/g, (_, defId: string) => reader.card(defId));
}

const ENGLISH: TextReader = { translate: () => undefined, card: (defId) => defId };

/** English text, without markers (tools, logs, test messages); cards are named by their definition id. */
export function plainText(text: string): string {
  return renderText(text, ENGLISH);
}
