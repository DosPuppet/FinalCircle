/**
 * Decks as text and as links (from Planecircle). The text lists one card per line, `3 27-122S Wuk Lamat`, with a
 * `Main` and an `LB` section; the import also reads lines written by hand or by other sites: a count (`3`, `3x`,
 * `x3`) and a card number anywhere in the line, or a card name in English or French. A link carries the text
 * compressed (deflate, base64url) after `#deck=1.`; the fragment never reaches the server.
 */
import { CARDS, type DeckEntries, findCard } from "@finalcircle/cards";
import { normalize } from "./search";

const PREFIX = "#deck=";
/** Version of the link format, for a later change of encoding. */
const VERSION = "1";

const CODE = /\b((?:\d{1,2}|PR|B|C|Re)-\d{3}[A-Z]?)\b/i;

/** The decklist as text. */
export function deckText(deck: DeckEntries & { name?: string }): string {
  const line = ([n, code]: [number, string]) => `${n} ${code} ${findCard(code)?.name ?? ""}`.trimEnd();
  const parts = [
    ...(deck.name ? [`Name ${deck.name}`, ""] : []),
    "Main",
    ...deck.main.map(line),
    ...(deck.lb?.length ? ["", "LB", ...deck.lb.map(line)] : []),
  ];
  return `${parts.join("\n")}\n`;
}

export interface ParsedDeck {
  name?: string;
  main: [number, string][];
  lb: [number, string][];
  /** Lines that name no known card. */
  unknown: string[];
}

/**
 * Card number for a name (English or French, accents and case ignored). Several cards can share a name (a Zack and
 * the Limit Break Zack): the one that fits the section is preferred.
 */
function codeByName(text: string, section: "main" | "lb"): string | undefined {
  const n = normalize(text.trim());
  if (!n) return undefined;
  const named = Object.values(CARDS).filter((c) => normalize(c.name) === n || (c.fr && normalize(c.fr.name) === n));
  return (named.find((c) => (c.lb !== undefined) === (section === "lb")) ?? named[0])?.id;
}

/** Reads a decklist; LB cards go to the LB deck even when listed in the main part. */
export function parseDeck(text: string): ParsedDeck {
  const out: ParsedDeck = { main: [], lb: [], unknown: [] };
  let section: "main" | "lb" = "main";
  const add = (where: "main" | "lb", n: number, code: string) => {
    const list = out[where];
    const at = list.find((e) => e[1] === code);
    if (at) at[0] += n;
    else list.push([n, code]);
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("//")) continue;
    const name = /^name\s+(.+)$/i.exec(line);
    if (name) {
      out.name = name[1]?.trim();
      continue;
    }
    if (/^(main( deck)?|deck|deck principal)\s*:?$/i.test(line)) {
      section = "main";
      continue;
    }
    if (/^(lb( deck)?|limit break|deck lb)\s*:?$/i.test(line)) {
      section = "lb";
      continue;
    }
    const count = /^(\d+)\s*x?\s+/i.exec(line) ?? /\s+x\s*(\d+)$/i.exec(line);
    const n = count ? Number(count[1]) : 1;
    const rest = count ? line.replace(count[0], " ").trim() : line;
    const code = CODE.exec(rest)?.[1];
    const id =
      (code && findCard(code.toUpperCase().replace(/^RE-/, "Re-"))?.id) ?? codeByName(rest.replace(/\(.*\)$/, ""), section);
    if (!id || n <= 0) {
      out.unknown.push(line);
      continue;
    }
    add(CARDS[id]?.lb !== undefined ? "lb" : section, n, id);
  }
  return out;
}

async function through(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

const toBase64Url = (bytes: Uint8Array) =>
  btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(""))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const fromBase64Url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (ch) => ch.charCodeAt(0));

/** A link that carries the deck, on this site (`origin`). */
export async function deckLink(deck: DeckEntries & { name?: string }, origin: string = location.origin): Promise<string> {
  const packed = await through(new TextEncoder().encode(deckText(deck)), new CompressionStream("deflate-raw"));
  return `${origin}/${PREFIX}${VERSION}.${toBase64Url(packed)}`;
}

/** The deck data of a link or of its fragment (`#deck=…`), or null. */
export function sharedDeckData(urlOrHash: string): string | null {
  const i = urlOrHash.indexOf(PREFIX);
  return i < 0 ? null : urlOrHash.slice(i + PREFIX.length) || null;
}

/** The decklist (text, to import) of a link's data; null if it is not a deck link of a known version or is damaged. */
export async function decodeDeck(data: string): Promise<string | null> {
  const [version, payload] = data.split(".", 2);
  if (version !== VERSION || !payload) return null;
  try {
    return new TextDecoder().decode(await through(fromBase64Url(payload), new DecompressionStream("deflate-raw")));
  } catch {
    return null;
  }
}
