/**
 * Checks the English–French glossary of docs/rules.md against the official texts: for each pair, the share of cards
 * whose English text has the English term and whose French text has the French term. The interface uses the cards'
 * own words; a pair below 90 % deserves a look.
 *
 * Usage: npx tsx tools/fr-glossary.ts   (reads the latest dump of data/cache/fftcg/, see tools/import-cards.ts)
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";

const CACHE = "data/cache/fftcg";
/** English term (as in the English texts) → French term (as in the French texts), and the field they are in. */
const PAIRS: [string, string, "text" | "type"][] = [
  ["Forward", "Avant", "text"],
  ["Backup", "Soutien", "text"],
  ["Monster", "Monstre", "text"],
  ["Summon", "Invocation", "text"],
  ["Character", "Personnage", "text"],
  ["Haste", "Booster", "text"],
  ["Brave", "Bravoure", "text"],
  ["First Strike", "Initiative", "text"],
  ["Back Attack", "Attaque Arrière", "text"],
  ["Freeze", "Gel", "text"],
  ["Break Zone", "Break Zone", "text"],
  ["Damage Zone", "Damage Zone", "text"],
  ["Break it", "Détruisez-le", "text"],
  ["Dull it", "Dullez-le", "text"],
  ["Activate it", "Activez-le", "text"],
  ["removed from the game", "retiré", "text"],
  ["Crystal", "Cristal", "text"],
  ["Forward", "Avant", "type"],
  ["Backup", "Soutien", "type"],
  ["Summon", "Invocation", "type"],
  ["Monster", "Monstre", "type"],
];

const files = existsSync(CACHE) ? readdirSync(CACHE).filter((f) => /^get-cards-.*\.json$/.test(f)) : [];
const last = files.sort().at(-1);
if (!last) {
  console.error(`no cached dump in ${CACHE}: npm run import-cards -- all --fetch`);
  process.exit(1);
}
const cards = (JSON.parse(readFileSync(`${CACHE}/${last}`, "utf8")) as { cards: Record<string, string>[] }).cards;
for (const [en, fr, field] of PAIRS) {
  const withEn = cards.filter((c) => (c[`${field}_en`] ?? "").includes(en));
  const both = withEn.filter((c) => (c[`${field}_fr`] ?? "").toLowerCase().includes(fr.toLowerCase()));
  const share = withEn.length ? Math.round((100 * both.length) / withEn.length) : 0;
  console.log(`${share >= 90 ? "  " : "! "}${field.padEnd(4)} ${en.padEnd(24)} → ${fr.padEnd(18)} ${share}% of ${withEn.length}`);
}
