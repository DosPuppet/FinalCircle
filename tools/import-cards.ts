/**
 * Import of the card data from Square Enix's official card browser into `packages/cards/data/<group>.json`.
 *
 * Usage:
 *   npm run import-cards -- <group>|all [--fetch]
 *   --fetch   one POST to the official card browser (every card, about 13 MB), cached as
 *             data/cache/fftcg/get-cards-<date>.json (outside Git); without it, the latest cached dump is read
 *
 * Groups are listed in `packages/cards/src/setRegistry.ts` (`CARD_GROUPS`): the cards of some decks, or a booster set.
 * Only the cards of a group are written (the repository keeps the texts of the playable pool only). A card missing from
 * the official data comes from `packages/cards/data/supplement.json`; `french-overrides.json` corrects a French text.
 * Texts are normalized and the French aligned on the English abilities (`src/fftext.ts`); the cards whose French
 * could not be aligned are reported.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import type { CardType, Element } from "@finalcircle/engine";
import { alignFrench, decodeEntities, KANJI, normalizeText } from "../packages/cards/src/fftext";
import type { RawCard } from "../packages/cards/src/raw";
import { CARD_GROUPS, type CardGroup, SET_BY_NAME, serialOf } from "../packages/cards/src/setRegistry";

const URL_CARDS = "https://fftcg.square-enix-games.com/en/get-cards";
const CACHE = "data/cache/fftcg";
const DATA = "packages/cards/data";
const DECKS = "packages/cards/decks";

/** One card of the official data (the fields we read). */
interface OfficialCard {
  code: string;
  element: string[];
  rarity: string | null;
  cost: string;
  power: string;
  category_1: string | null;
  category_2: string | null;
  multicard: string;
  ex_burst: string;
  set: string[];
  name_en: string;
  type_en: string;
  job_en: string;
  text_en: string;
  name_fr: string;
  type_fr: string;
  job_fr: string;
  text_fr: string;
  image?: string;
  images?: { full?: string[] };
}

const argv = process.argv.slice(2);
const target = argv.find((a) => !a.startsWith("--"));
if (!target) {
  console.error(`Specify a group (${CARD_GROUPS.map((g) => g.code).join(", ")}) or all.`);
  process.exit(2);
}

async function fetchDump(): Promise<void> {
  const body = {
    language: "fr",
    text: "",
    type: [],
    element: [],
    cost: [],
    rarity: [],
    power: [],
    category_1: [],
    set: [],
    multicard: "",
    ex_burst: "",
    code: "",
    special: "",
    exactmatch: 0,
  };
  const res = await fetch(URL_CARDS, {
    method: "POST",
    headers: { "content-type": "application/json", "User-Agent": "FinalCircle/0.1 (non-commercial fan project)" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${URL_CARDS}: HTTP ${res.status}`);
  mkdirSync(CACHE, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  writeFileSync(`${CACHE}/get-cards-${date}.json`, await res.text());
  console.log(`cached ${CACHE}/get-cards-${date}.json`);
}

function latestDump(): OfficialCard[] {
  const files = existsSync(CACHE) ? readdirSync(CACHE).filter((f) => /^get-cards-.*\.json$/.test(f)) : [];
  const last = files.sort().at(-1);
  if (!last) throw new Error(`no cached dump in ${CACHE}: rerun with --fetch`);
  const dump = JSON.parse(readFileSync(`${CACHE}/${last}`, "utf8")) as { cards: OfficialCard[] };
  console.log(`dump ${last}: ${dump.cards.length} entries`);
  return dump.cards;
}

/** The identity of a card listed under several codes: its oldest numbered printing (CR 5.2.5.1). */
function identityOf(codes: string[]): string {
  const numbered = codes.filter((c) => serialOf(c) !== undefined).sort((a, b) => (serialOf(a) ?? 0) - (serialOf(b) ?? 0));
  return numbered[0] ?? (codes[0] as string);
}

const fileName = (url: string | undefined) => url?.split("/").pop();

function reduce(c: OfficialCard): RawCard | null {
  if (c.type_en === "Crystal" || !c.name_en) return null;
  const codes = c.code.split("/").map((x) => x.trim());
  const id = identityOf(codes);
  const type = c.type_en as CardType;
  const text = normalizeText(c.text_en);
  const fr = alignFrench(text, normalizeText(c.text_fr));
  if (!fr.aligned) misaligned.push(id);
  const categories = [c.category_1, c.category_2]
    .filter((x): x is string => !!x)
    .flatMap((x) => decodeEntities(x).split("·"))
    .map((x) => x.trim())
    .filter(Boolean);
  let en: string | undefined;
  try {
    en = fileName((Object.values(JSON.parse(c.image ?? "{}")) as { filename?: string }[])[0]?.filename);
  } catch {
    en = undefined;
  }
  const frImage = fileName(c.images?.full?.[0]);
  return {
    id,
    codes,
    name: c.name_en.trim(),
    type,
    elements: c.element.map((k) => KANJI[k] as Element),
    cost: Number(c.cost) || 0,
    ...(type === "Forward" ? { power: Number(c.power) || 0 } : {}),
    jobs: c.job_en
      .split("/")
      .map((j) => j.trim())
      .filter(Boolean),
    categories: [...new Set(categories)],
    generic: c.multicard === "1",
    exBurst: c.ex_burst === "1",
    rarity: c.rarity ?? "",
    set: serialOf(id) ?? SET_BY_NAME[c.set[0] ?? ""]?.number ?? 0,
    printedIn: c.set,
    text,
    fr: { name: c.name_fr.trim(), type: c.type_fr.trim(), job: c.job_fr.trim(), text: fr.text },
    image: en || frImage ? { ...(en ? { en } : {}), ...(frImage?.endsWith("_fr.jpg") ? { fr: frImage } : {}) } : null,
  };
}

const misaligned: string[] = [];

function readJson<T>(path: string, fallback: T): T {
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as T) : fallback;
}

/** Card numbers of a group: the cards of its decks, or every card of its set. */
function groupCodes(g: CardGroup, byCode: Map<string, RawCard>): string[] {
  if (g.decks) {
    const codes = new Set<string>();
    for (const id of g.decks) {
      const deck = readJson<{ main: [number, string][]; lb?: [number, string][] }>(`${DECKS}/${id}.json`, { main: [] });
      for (const [, code] of [...deck.main, ...(deck.lb ?? [])]) codes.add(code);
    }
    return [...codes];
  }
  return [...new Set([...byCode.values()].filter((c) => c.set === g.set).map((c) => c.id))];
}

const bySerial = (a: RawCard, b: RawCard) =>
  a.set - b.set || a.id.localeCompare(b.id, "en", { numeric: true }) || a.name.localeCompare(b.name);

if (argv.includes("--fetch")) await fetchDump();
const byCode = new Map<string, RawCard>();
for (const c of latestDump()) {
  const raw = reduce(c);
  if (!raw) continue;
  for (const code of raw.codes) if (!byCode.has(code)) byCode.set(code, raw);
}
const supplement = readJson<RawCard[]>(`${DATA}/supplement.json`, []);
const overrides = readJson<Record<string, Partial<RawCard["fr"]>>>(`${DATA}/french-overrides.json`, {});

for (const g of CARD_GROUPS.filter((x) => target === "all" || x.code === target)) {
  const cards: RawCard[] = [];
  const missing: string[] = [];
  const fromSupplement: string[] = [];
  for (const code of groupCodes(g, byCode)) {
    const official = byCode.get(code);
    const extra = supplement.find((c) => c.codes.includes(code));
    const card = official ?? extra;
    if (!card) {
      missing.push(code);
      continue;
    }
    if (!official) fromSupplement.push(code);
    const fr = overrides[card.id];
    cards.push(fr ? { ...card, fr: { ...card.fr, ...fr } } : card);
  }
  const unique = [...new Map(cards.map((c) => [c.id, c])).values()].sort(bySerial);
  writeFileSync(`${DATA}/${g.code}.json`, `${JSON.stringify(unique, null, 1)}\n`);
  console.log(`${g.code}: ${unique.length} cards written to ${DATA}/${g.code}.json`);
  if (fromSupplement.length) console.log(`  from supplement.json: ${fromSupplement.join(", ")}`);
  const notAligned = unique.filter((c) => misaligned.includes(c.id) && !overrides[c.id]?.text).map((c) => c.id);
  if (notAligned.length) console.log(`  French not aligned on the English abilities: ${notAligned.join(", ")}`);
  if (missing.length) {
    console.error(`  missing from the official data and from supplement.json: ${missing.join(", ")}`);
    process.exitCode = 1;
  }
}
