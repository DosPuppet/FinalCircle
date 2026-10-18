import { type CardDef, plainText } from "@finalcircle/engine";
import { describe, expect, it } from "vitest";
import { CARDS, DECKS, type DeckEntries, findCard, l3Sets, validateDeck } from "../src/index";

const vol1 = DECKS.find((d) => d.id === "starter-2025-vol1");
const vol2 = DECKS.find((d) => d.id === "starter-2025-vol2");

/** Definitions of cards outside the pool, for the format rules. */
function fake(id: string, extra: Partial<CardDef> = {}): CardDef {
  return {
    id,
    codes: [id],
    name: id,
    type: "Forward",
    elements: ["fire"],
    cost: 2,
    power: 5000,
    jobs: [],
    categories: [],
    generic: false,
    exBurst: false,
    rarity: "C",
    set: Number(id.split("-")[0]) || 0,
    keywords: [],
    abilities: [],
    text: "",
    implemented: true,
    ...extra,
  };
}
const extra: Record<string, CardDef> = {
  "16-051L": fake("16-051L"),
  "19-102L": fake("19-102L"),
  "23-117L": fake("23-117L", { name: "Chaos" }),
  "2-100H": fake("2-100H", { name: "Chaos" }),
  "6-100H": fake("6-100H", { name: "Feral Chaos" }),
};
const find = (code: string) => extra[code] ?? findCard(code);
const errors = (deck: DeckEntries, format: "standard" | "l3" = "standard", date?: string) =>
  validateDeck(deck, find, format, date ? { date } : {}).errors.map(plainText);

/** A legal 50-card main deck of fake cards (17 card numbers). */
const filler = (n: number): [number, string][] =>
  Array.from({ length: Math.ceil(n / 3) }, (_, i): [number, string] => [Math.min(3, n - 3 * i), `29-${100 + i}C`]);
for (const [, code] of filler(60)) extra[code] = fake(code);

describe("deck construction (CR 8.1)", () => {
  it("both starter decks are legal Standard decks", () => {
    for (const d of [vol1, vol2]) {
      expect(d, "deck file").toBeDefined();
      const v = validateDeck(d as DeckEntries, findCard);
      expect(v.errors.map(plainText), d?.id).toEqual([]);
      expect(v.mainCount).toBe(50);
    }
    expect(validateDeck(vol1 as DeckEntries, findCard).lbCount).toBe(8);
  });

  it("exactly 50 main cards, at most 8 LB cards", () => {
    expect(errors({ main: filler(49) })).toEqual(["The main deck must have exactly 50 cards (it has 49)"]);
    expect(
      errors({
        main: filler(50),
        lb: [
          [3, "22-112R"],
          [3, "22-123R"],
          [3, "23-119R"],
        ],
      }),
    ).toEqual(["The LB deck can have at most 8 cards (it has 9)"]);
  });

  it("Limit Break cards in the LB deck only, and only them (CR 8.1.3)", () => {
    const main = filler(50);
    main[0] = [2, "29-100C"];
    main.push([1, "22-112R"]);
    expect(errors({ main, lb: [[1, "27-123S"]] })).toEqual([
      "22-112R: Limit Break cards go in the LB deck only",
      "27-123S: only Limit Break cards go in the LB deck",
    ]);
  });

  it("at most 3 copies of a card number, unknown cards", () => {
    const main = filler(50).slice(1);
    main.push([4, "29-101C"]);
    main[0] = [2, "29-101C"];
    expect(errors({ main })).toContain("29-101C: at most 3 copies (the deck has 6)");
    expect(errors({ main: [...filler(49), [1, "99-999X"]] })).toEqual(["Unknown card: 99-999X"]);
  });
});

describe("formats", () => {
  it("Standard: banned, restricted, the Chaos group", () => {
    const main = filler(48);
    expect(errors({ main: [...main, [2, "16-051L"]] })).toEqual(["16-051L is banned in Standard"]);
    expect(errors({ main: [...main, [2, "19-102L"]] })).toEqual(["19-102L is restricted to 1 copy in Standard"]);
    const chaos = filler(44);
    expect(
      errors({
        main: [...chaos, [2, "23-117L"], [2, "2-100H"], [2, "6-100H"]],
      }),
    ).toEqual(["With 23-117L, at most 3 cards named Chaos / Feral Chaos in total"]);
  });

  it("L3: the latest three booster sets, by serial number", () => {
    expect(l3Sets("2026-10-18")).toEqual([29, 28, 27]);
    expect(l3Sets("2026-11-13")).toEqual([30, 29, 28]);
    expect(errors({ main: filler(50) }, "l3", "2026-10-18")).toEqual([]);
    expect(errors(vol1 as DeckEntries, "l3", "2026-10-18")).toContain("1-170C is not legal in L3 (set 1)");
  });

  it("cards the engine does not handle make the deck not playable, not illegal", () => {
    const v = validateDeck(vol1 as DeckEntries, findCard);
    expect(v.legal).toBe(true);
    expect(v.playable).toBe(Object.values(CARDS).every((c) => c.implemented));
  });
});
