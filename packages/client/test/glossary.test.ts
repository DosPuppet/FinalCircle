import { CARDS } from "@finalcircle/cards";
import { cardFace } from "@finalcircle/engine";
import { describe, expect, it } from "vitest";
import { GLOSSARY, splitTerms, termOfSymbol } from "../src/glossary/terms";
import { KEYWORD_LABEL } from "../src/i18n";
import type { Lang } from "../src/translate";

/** The terms found in a text, in order: `id:words`. */
const found = (text: string, lang: Lang) =>
  splitTerms(text, lang).flatMap((p) => (typeof p === "string" ? [] : [`${p.term.id}:${p.text}`]));

/** The term ids of a card text, without its markup (special ability names are not marked: `CardText`). */
const ids = (text: string, lang: Lang) =>
  [
    ...new Set(
      splitTerms(text.replace(/\[\[s\]\].*?\[\[\/\]\]/g, " ").replace(/\[\[[a-z/]*\]\]/g, " "), lang).flatMap((p) =>
        typeof p === "string" ? [] : [p.term.id],
      ),
    ),
  ].sort();

describe("glossary", () => {
  it("has every keyword ability of the engine, and unique ids", () => {
    const terms = new Set(GLOSSARY.map((x) => x.id));
    expect(terms.size).toBe(GLOSSARY.length);
    for (const k of Object.keys(KEYWORD_LABEL)) expect(terms.has(k)).toBe(true);
  });

  it("explains the symbols of the texts", () => {
    expect(termOfSymbol("ダル")?.id).toBe("dull");
    expect(termOfSymbol("S")?.id).toBe("special");
    expect(termOfSymbol("C")?.id).toBe("crystal");
    expect(termOfSymbol("LB")?.id).toBe("limitBreak");
    expect(termOfSymbol("火")).toBeUndefined();
  });

  it("finds the words of the English texts, the longest first, whole words only", () => {
    expect(found("Choose 1 Forward. It gains Haste and First Strike until the end of the turn.", "en")).toEqual([
      "haste:Haste",
      "firstStrike:First Strike",
    ]);
    expect(found("Break it. Put it into the Break Zone. Limit Break -- 2", "en")).toEqual([
      "break:Break",
      "breakZone:Break Zone",
      "limitBreak:Limit Break",
    ]);
    expect(found("Damage 3 -- Ryid gains Brave. Deal it 5000 damage.", "en")).toEqual(["damage:Damage 3", "brave:Brave"]);
    expect(found("Bravely, the Breakers activated nothing.", "en")).toEqual(["activate:activated"]);
    expect(found("Remove it from the game. Warp 2 -- 《火》", "en")).toEqual(["remove:Remove it from the game", "warp:Warp 2"]);
  });

  it("finds the French words of the catalog", () => {
    expect(found("Choisissez 1 Avant. Il gagne Booster et Initiative. Gelez-le.", "fr")).toEqual([
      "haste:Booster",
      "firstStrike:Initiative",
      "freeze:Gelez",
    ]);
    expect(found("Dégâts 5 -- Retirez-le du jeu. Dullez-le, puis détruisez-le.", "fr")).toEqual([
      "damage:Dégâts 5",
      "remove:Retirez-le du jeu",
      "dull:Dullez",
      "break:détruisez",
    ]);
    expect(found("Rapatriement 2 -- 《氷》《氷》 ; une équipe attaque.", "fr")).toEqual(["warp:Rapatriement 2", "party:équipe"]);
  });

  it("marks the same terms in the English and French texts of every card", () => {
    const differ: string[] = [];
    for (const def of Object.values(CARDS)) {
      const face = cardFace(def);
      if (!face.fr?.text) continue;
      const en = ids(face.text, "en");
      const fr = ids(face.fr.text, "fr");
      if (en.join() !== fr.join()) differ.push(`${def.id}: ${en.join()} / ${fr.join()}`);
    }
    expect(differ).toEqual([]);
  });
});
