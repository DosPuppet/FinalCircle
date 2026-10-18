/**
 * French catalogs (from Planecircle): rewrites them in their canonical form (keys sorted, one space of indentation), which the
 * catalog test (`cards/test/locales.test.ts`) requires; with `--merge`, first adds the entries of catalog fragments.
 *
 * Usage: npx tsx tools/locales.ts [--merge <dir>]
 *   A fragment is a JSON object `{ "<English>": "<French>" }` named `<target>--<anything>.json`, where the target is
 *   `engine`, `client`, `server`, `cards-core` or `cards-<set>`. An entry whose key already has another translation
 *   (in any catalog) is not merged: it is reported, and the command fails.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";

const PACKAGES = new URL("../packages/", import.meta.url);

function catalogPath(target: string): string {
  if (target === "engine" || target === "client" || target === "server") return `${target}/locales/fr.json`;
  const set = /^cards-(\w+)$/.exec(target)?.[1];
  if (!set) throw new Error(`unknown fragment target: ${target}`);
  return `cards/locales/fr/${set}.json`;
}

const files = [
  "engine/locales/fr.json",
  "client/locales/fr.json",
  "server/locales/fr.json",
  ...readdirSync(new URL("cards/locales/fr/", PACKAGES)).map((f) => `cards/locales/fr/${f}`),
];
const catalogs = new Map<string, Record<string, string>>();
for (const f of files)
  if (existsSync(new URL(f, PACKAGES))) catalogs.set(f, JSON.parse(readFileSync(new URL(f, PACKAGES), "utf8")));

const conflicts: string[] = [];
const at = process.argv.indexOf("--merge");
if (at >= 0) {
  const dir = process.argv[at + 1];
  if (!dir) throw new Error("--merge: directory missing");
  const known = new Map<string, string>();
  for (const entries of catalogs.values()) for (const [k, v] of Object.entries(entries)) known.set(k, v);
  let added = 0;
  for (const name of readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()) {
    const target = name.split("--")[0] as string;
    const path = catalogPath(target);
    const catalog = catalogs.get(path) ?? {};
    catalogs.set(path, catalog);
    const fragment = JSON.parse(readFileSync(`${dir}/${name}`, "utf8")) as Record<string, string>;
    for (const [k, v] of Object.entries(fragment)) {
      const seen = known.get(k);
      if (seen !== undefined && seen !== v) conflicts.push(`${name}: « ${k} » → « ${v} », already « ${seen} »`);
      else if (seen === undefined) {
        catalog[k] = v;
        known.set(k, v);
        added++;
      }
    }
  }
  console.log(`${added} entries merged`);
}

let changed = 0;
for (const [f, entries] of catalogs) {
  const url = new URL(f, PACKAGES);
  const before = existsSync(url) ? readFileSync(url, "utf8") : "";
  const sorted = Object.fromEntries(
    Object.keys(entries)
      .sort()
      .map((k) => [k, entries[k]]),
  );
  const after = `${JSON.stringify(sorted, null, 1)}\n`;
  if (after !== before) {
    writeFileSync(url, after);
    changed++;
  }
}
console.log(`${catalogs.size} catalogs, ${changed} rewritten`);
if (conflicts.length) {
  console.error(`${conflicts.length} conflict(s):\n${conflicts.join("\n")}`);
  process.exit(1);
}
