import { describe, expect, it } from "vitest";
import {
  alignFrench,
  lbCost,
  normalizeText,
  onlyKeywords,
  paragraphs,
  parseAbilities,
  parseCost,
  printedKeywords,
} from "../src/fftext";
import { CARDS } from "../src/index";

const kinds = (code: string) => {
  const c = CARDS[code];
  if (!c) throw new Error(code);
  return parseAbilities(c.text, c.type).map((a) => a.kind);
};

describe("normalization of the official markup", () => {
  it("full-width digits, line breaks, entities", () => {
    expect(normalizeText("《１》《火》: Draw 1 card.   [[br]]   Brave")).toBe("《1》《火》: Draw 1 card.[[br]]Brave");
    expect(normalizeText("Vincent[[br]]\n    Initiative")).toBe("Vincent[[br]]Initiative");
    expect(normalizeText("DFF &middot; X")).toBe("DFF · X");
  });

  it("an EX BURST tag opened before the line break (13-072R)", () => {
    expect(normalizeText("reduced by 3.[[ex]][[br]]   EX BURST[[/]] Choose 1 Forward.")).toBe(
      "reduced by 3.[[br]][[ex]]EX BURST[[/]] Choose 1 Forward.",
    );
  });

  it("a special ability's name marked as italics (18-129C in French)", () => {
    expect(normalizeText("[[i]]Regard de tueur[[/]] 《S》《ダル》 : Choisissez 1 Avant.")).toBe(
      "[[s]]Regard de tueur[[/]] 《S》《ダル》 : Choisissez 1 Avant.",
    );
  });

  it("misplaced italics are balanced and unwrapped (11-121C)", () => {
    const t = normalizeText("If it is a [[i]]Category IV [[/]]card[[i]], draw 1 card. If not, draw 2 cards.[[br]]Next.[[/]]");
    expect(t).toBe("If it is a [[i]]Category IV [[/]]card, draw 1 card. If not, draw 2 cards.[[br]]Next.");
  });

  it("French lines broken inside an ability are joined (11-010C, 16-092C)", () => {
    const en =
      "《ダル》: Choose 1 Forward. It gains +1000 power.[[br]]《火》《1》《ダル》: Choose 1 Forward. Deal it 5000 damage.";
    const fr =
      "《ダル》 : Choisissez[[br]]1 Avant. Il gagne +1000 de force.[[br]]《火》《1》《ダル》 : Choisissez[[br]]1 Avant. Infligez-lui 5000 points de dégâts.";
    expect(alignFrench(en, fr)).toEqual({
      text: "《ダル》 : Choisissez 1 Avant. Il gagne +1000 de force.[[br]]《火》《1》《ダル》 : Choisissez 1 Avant. Infligez-lui 5000 points de dégâts.",
      aligned: true,
    });
    const noel = alignFrench(
      "When Noel enters the field, dull them.[[br]]《ダル》: Dull all the Forwards.",
      "Lorsque Noel entre sur le terrain, choisissez[[br]]jusqu'à 2 Avants.[[br]]Dullez-les.[[br]]《ダル》 : Dullez tous les Avants.",
    );
    expect(noel).toEqual({
      text: "Lorsque Noel entre sur le terrain, choisissez jusqu'à 2 Avants. Dullez-les.[[br]]《ダル》 : Dullez tous les Avants.",
      aligned: true,
    });
  });
});

describe("reading a text (the starter pool)", () => {
  it("every card of the pool is aligned and readable", () => {
    for (const c of Object.values(CARDS)) {
      expect(c.fr?.text.split("[[br]]").length, c.id).toBe(c.text.split("[[br]]").length);
      for (const a of parseAbilities(c.text, c.type)) if (a.cost) expect(parseCost(a.cost), `${c.id}: ${a.cost}`).not.toBeNull();
    }
  });

  it("kinds of abilities", () => {
    expect(kinds("11-010C")).toEqual(["action", "action"]);
    expect(kinds("18-129C")).toEqual(["action", "special"]);
    expect(kinds("21-001R")).toEqual(["castRule", "auto"]);
    expect(kinds("13-072R")).toEqual(["castRule", "summon"]);
    expect(kinds("23-119R")).toEqual(["lb", "keyword", "auto"]);
    expect(kinds("22-112R")).toEqual(["reminder", "lb", "auto"]);
    expect(kinds("20-106R")).toEqual(["auto", "field"]);
    expect(kinds("19-052C")).toEqual(["action", "action"]);
    expect(kinds("27-126S")).toEqual(["field", "action"]);
  });

  it("the quoted modes belong to their ability (20-103H, 27-125S)", () => {
    expect(paragraphs(CARDS["20-103H"]?.text ?? "")).toHaveLength(1);
    expect(kinds("27-125S")).toEqual(["auto", "auto"]);
  });

  it("EX Burst, Damage N, special ability names", () => {
    const ward = parseAbilities(CARDS["21-001R"]?.text ?? "", "Forward");
    expect(ward[1]?.exBurst).toBe(true);
    const alphinaud = parseAbilities(CARDS["20-106R"]?.text ?? "", "Forward");
    expect(alphinaud[1]?.damage).toBe(3);
    expect(alphinaud[1]?.text).toBe("Alphinaud gains +2000 power.");
    const jecht = parseAbilities(CARDS["18-129C"]?.text ?? "", "Forward");
    expect(jecht[1]?.specialName).toBe("Jecht Beam");
  });

  it("costs of action and special abilities", () => {
    expect(parseCost("《火》《1》《ダル》, put Warrior into the Break Zone")).toEqual({
      dull: true,
      putSelfIntoBreak: true,
      cp: { elements: { fire: 1 }, generic: 1 },
    });
    expect(parseCost("《水》, discard Geomancer")).toEqual({ discardSelf: true, cp: { elements: { water: 1 }, generic: 0 } });
    expect(parseCost("Remove Undead Princess in the Break Zone from the game")).toEqual({ removeSelf: true });
    expect(parseCost("《S》《ダル》")).toEqual({ special: true, dull: true });
    expect(parseCost("《0》")).toEqual({ cp: { elements: {}, generic: 0 } });
    expect(parseCost("Reveal 1 card")).toBeNull();
  });

  it("keywords and Limit Break read from the text", () => {
    expect(printedKeywords(CARDS["23-119R"]?.text ?? "", "Forward")).toEqual(["firstStrike"]);
    expect(CARDS["22-119R"]?.keywords).toEqual(["brave"]);
    expect(lbCost(CARDS["24-126H"]?.text ?? "", "Forward")).toBe(2);
    expect(CARDS["22-112R"]?.lb).toBe(1);
    expect(onlyKeywords("Brave[[br]]First Strike", "Forward")).toBe(true);
    expect(onlyKeywords("", "Backup")).toBe(true);
    expect(onlyKeywords(CARDS["22-119R"]?.text ?? "", "Forward")).toBe(false);
  });
});
