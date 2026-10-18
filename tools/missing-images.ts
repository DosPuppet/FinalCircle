/**
 * Images the official CDN lacks (the Starter Set 2025 exclusives 27-122S…27-129S, absent from Square Enix's card
 * browser): fetched once from TCGplayer's product images (`imageSource` of the card data) into the server's store,
 * outside Git, where the image relay serves them before the CDN (`/ffimg/<full|thumbs>/<code>_eg.jpg`). English only:
 * the French interface falls back to it. One request at a time, at least 1.5 s apart; files already there are kept.
 *
 * Usage: npx tsx tools/missing-images.ts [--dir data/images] [--force]
 *   On the server: the same command (or copy `data/images` there); `FC_IMAGES_DIR` tells the server where it is.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { RawCard } from "../packages/cards/src/raw";

const at = process.argv.indexOf("--dir");
const DIR = at >= 0 ? (process.argv[at + 1] as string) : process.env.FC_IMAGES_DIR || join(process.cwd(), "data", "images");
const FORCE = process.argv.includes("--force");
const GAP_MS = 1500;
const DATA = new URL("../packages/cards/data/", import.meta.url);

/** TCGplayer's image of a product: a 200 px wide thumbnail and the large scan. */
const SIZES: Record<"thumbs" | "full", (id: number) => string> = {
  thumbs: (id) => `https://tcgplayer-cdn.tcgplayer.com/product/${id}_200w.jpg`,
  full: (id) => `https://tcgplayer-cdn.tcgplayer.com/product/${id}_in_1000x1000.jpg`,
};

const cards = new Map<string, RawCard>();
for (const f of readdirSync(DATA).filter((x) => x.endsWith(".json") && !/^(formats|french-baseline)\.json$/.test(x))) {
  const list = JSON.parse(readFileSync(new URL(f, DATA), "utf8")) as RawCard[];
  if (Array.isArray(list)) for (const c of list) if (c.imageSource && c.image?.en) cards.set(c.id, c);
}

let last = 0;
let fetched = 0;
let kept = 0;
const failed: string[] = [];
for (const c of cards.values()) {
  for (const [size, url] of Object.entries(SIZES) as [keyof typeof SIZES, (id: number) => string][]) {
    const file = join(DIR, size, c.image?.en as string);
    if (existsSync(file) && !FORCE) {
      kept++;
      continue;
    }
    const wait = last + GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    const source = url(c.imageSource?.tcgplayer as number);
    try {
      const res = await fetch(source, {
        headers: { "User-Agent": "FinalCircle/0.1 (non-commercial fan project)" },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok || !(res.headers.get("content-type") ?? "").startsWith("image/")) throw new Error(`HTTP ${res.status}`);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      fetched++;
    } catch (e) {
      failed.push(`${c.id} ${size}: ${e instanceof Error ? e.message : String(e)} (${source})`);
    }
  }
}
console.log(`${cards.size} cards without an official image: ${fetched} files fetched, ${kept} already there, in ${DIR}`);
for (const f of failed) console.error(`  failed: ${f}`);
if (failed.length) process.exitCode = 1;
