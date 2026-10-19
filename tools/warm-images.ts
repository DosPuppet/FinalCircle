/**
 * Warms the image cache of a deployed site: asks once for every image of the implemented cards through its `/ffimg/`
 * relay (both sizes, the French printing then the English one, as the interface does), so that nginx keeps them and
 * players never wait for the CDN. Serial, 1.5 s apart (the relay itself asks the CDN at most once every 1.1 s); stops at
 * the first 503 (the CDN refuses for now: run it again later).
 *
 * Usage: npx tsx tools/warm-images.ts https://ff.mydomain.example [--size thumbs|full]
 */
import { readdirSync, readFileSync } from "node:fs";
import type { RawCard } from "../packages/cards/src/raw";

const base = (process.argv[2] ?? "").replace(/\/$/, "");
if (!/^https?:\/\//.test(base)) {
  console.error("Usage: npx tsx tools/warm-images.ts https://ff.mydomain.example [--size thumbs|full]");
  process.exit(2);
}
const at = process.argv.indexOf("--size");
const sizes = at >= 0 ? [process.argv[at + 1] as string] : ["thumbs", "full"];
const GAP_MS = 1500;
const DATA = new URL("../packages/cards/data/", import.meta.url);

const files = new Set<string>();
for (const f of readdirSync(DATA).filter((x) => x.endsWith(".json") && !/^(formats|french-baseline|supplement)\.json$/.test(x))) {
  const list = JSON.parse(readFileSync(new URL(f, DATA), "utf8")) as RawCard[];
  if (Array.isArray(list)) for (const c of list) for (const file of [c.image?.fr, c.image?.en]) if (file) files.add(file);
}

const counts: Record<string, number> = {};
let last = 0;
let stopped = false;
outer: for (const size of sizes)
  for (const file of files) {
    const wait = last + GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    let key: string;
    try {
      const res = await fetch(`${base}/ffimg/${size}/${file}`, { signal: AbortSignal.timeout(30_000) });
      await res.arrayBuffer();
      key = `${res.status} ${res.headers.get("x-cache") ?? "-"}`;
      if (res.status === 503) {
        console.error(`503 on ${size}/${file}: the CDN refuses for now; run the tool again later.`);
        stopped = true;
        counts[key] = (counts[key] ?? 0) + 1;
        break outer;
      }
    } catch (e) {
      key = `error ${e instanceof Error ? e.message : String(e)}`;
    }
    counts[key] = (counts[key] ?? 0) + 1;
  }
console.log(`${files.size} image files × ${sizes.length} size(s) on ${base}:`);
for (const [k, n] of Object.entries(counts).sort()) console.log(`  ${k}: ${n}`);
if (stopped) process.exitCode = 1;
