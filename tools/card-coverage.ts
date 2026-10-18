/**
 * Cards handled per group (from Planecircle's card-coverage), texts of the remaining cards, one card in detail, and
 * the gaps between a card's text and its script.
 *
 * Usage:
 *   npm run coverage -- [--group <group>|all]   cards handled per group
 *   options: --text (texts of the cards still to script), --element fire|ice|… (with --text), --card <code>,
 *            --audit (abilities of the text vs the script, handled cards)
 */
import type { AbilityDef, CardDef } from "@finalcircle/engine";
import { parseAbilities } from "../packages/cards/src/fftext";
import { GROUPS } from "../packages/cards/src/groups";
import { CARDS, findCard } from "../packages/cards/src/index";

const argv = process.argv.slice(2);
const opt = (n: string) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const groupArg = opt("group") ?? "all";
const element = opt("element");
const groups = GROUPS.filter((g) => groupArg === "all" || g.code === groupArg);
if (!groups.length) {
  console.error(`unknown group ${groupArg} (${GROUPS.map((g) => g.code).join(", ")}, all)`);
  process.exit(2);
}

const plain = (t: string) => t.replace(/\[\[br\]\]/g, "\n    ").replace(/\[\[\/?\w*\]\]/g, "");

/** The kinds of abilities a script must give for each paragraph of the text. */
function expectedKinds(c: CardDef): AbilityDef["kind"][] {
  return parseAbilities(c.text, c.type).flatMap((a): AbilityDef["kind"][] => {
    if (a.kind === "auto" || a.kind === "field") return [a.kind];
    if (a.kind === "action" || a.kind === "special") return ["action"];
    return [];
  });
}

const cardCode = opt("card");
if (cardCode) {
  const c = findCard(cardCode);
  if (!c) throw new Error(`unknown card ${cardCode}`);
  console.log(
    `${c.id} ${c.name} (${c.fr?.name}) — ${c.type} ${c.elements.join("/")} cost ${c.cost}${c.power ? ` power ${c.power}` : ""}`,
  );
  console.log(`  implemented: ${c.implemented}; keywords: ${c.keywords.join(", ") || "-"}; LB: ${c.lb ?? "-"}`);
  console.log(`  EN: ${plain(c.text)}`);
  console.log(`  FR: ${plain(c.fr?.text ?? "")}`);
  for (const a of parseAbilities(c.text, c.type))
    console.log(`  [${a.kind}${a.exBurst ? ", EX" : ""}${a.damage ? `, Damage ${a.damage}` : ""}] ${plain(a.text)}`);
  console.log(JSON.stringify({ abilities: c.abilities, summon: c.summon, castRules: c.castRules }, null, 1));
  process.exit(0);
}

let total = 0;
let handled = 0;
let gaps = 0;
for (const g of groups) {
  const cards = g.data.map((r) => CARDS[r.id]).filter((c): c is CardDef => !!c);
  const done = cards.filter((c) => c.implemented);
  const scripted = done.filter((c) => g.scripts[c.id]).length;
  total += cards.length;
  handled += done.length;
  console.log(
    `${g.code}: ${done.length} / ${cards.length} cards handled (${scripted} scripted, ${done.length - scripted} without script)`,
  );
  if (argv.includes("--text"))
    for (const c of cards.filter((x) => !x.implemented && (!element || x.elements.includes(element as never))))
      console.log(
        `\n${c.id} ${c.name} — ${c.type} ${c.elements.join("/")} ${c.cost}${c.power ? `/${c.power}` : ""}\n    ${plain(c.text)}`,
      );
  if (argv.includes("--audit"))
    for (const c of done.filter((x) => g.scripts[x.id])) {
      const want = expectedKinds(c);
      const have = c.abilities.map((a) => a.kind);
      const isSummon = c.type === "Summon";
      if (want.join() !== have.join() && !(isSummon && c.summon)) {
        gaps++;
        console.log(`  gap ${c.id} ${c.name}: text ${want.join(", ") || "-"}, script ${have.join(", ") || "-"}`);
      }
    }
}
if (groups.length > 1) console.log(`all: ${handled} / ${total} cards handled`);
if (argv.includes("--audit")) {
  console.log(`${gaps} gap(s) between texts and scripts`);
  if (gaps) process.exitCode = 1;
}
