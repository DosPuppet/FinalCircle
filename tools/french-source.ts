/**
 * Files that still contain French (code and documentation in English), against the baseline
 * `packages/cards/data/french-baseline.json` that `cards/test/english-source.test.ts` checks.
 *
 * Usage: npx tsx tools/french-source.ts [--write] [--lines <file>]
 *   (no option)   files with French, by number of French lines, and the difference with the baseline
 *   --write       rewrites the baseline's file list (the `allowed` section is kept)
 *   --lines FILE  the French lines of one file
 */
import { readFileSync, writeFileSync } from "node:fs";
import { frenchFiles, frenchLines } from "../packages/cards/test/frenchSource";

const BASELINE = new URL("../packages/cards/data/french-baseline.json", import.meta.url);
const args = process.argv.slice(2);

const at = args.indexOf("--lines");
if (at >= 0) {
  const file = args[at + 1];
  if (!file) throw new Error("--lines: file missing");
  for (const l of frenchLines(file)) console.log(`${l.line}: ${l.text}`);
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(BASELINE, "utf8")) as { allowed: Record<string, string>; files: string[] };
const found = frenchFiles();
const files = Object.keys(found)
  .filter((f) => !(f in baseline.allowed))
  .sort();
const added = files.filter((f) => !baseline.files.includes(f));
const gone = baseline.files.filter((f) => !files.includes(f));
const total = files.reduce((n, f) => n + (found[f] ?? 0), 0);
console.log(`${files.length} files with French (${total} lines); baseline ${baseline.files.length}`);
if (added.length) console.log(`new: ${added.length > 20 ? `${added.length} files` : added.join(", ")}`);
if (gone.length) console.log(`now English: ${gone.length} file(s)`);
if (args.includes("--write")) {
  writeFileSync(BASELINE, `${JSON.stringify({ allowed: baseline.allowed, files }, null, 1)}\n`);
  console.log("baseline written");
}
