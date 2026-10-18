import { CARDS, DECKS, findCard, validateDeck } from "@finalcircle/cards";
import { describe, expect, it } from "vitest";
import { searchFilter } from "../src/decks/search";
import { deckLink, deckText, decodeDeck, parseDeck, sharedDeckData } from "../src/decks/share";

const vol1 = DECKS[0];
const all = Object.values(CARDS);
const names = (query: string) =>
  all
    .filter(searchFilter(query))
    .map((c) => c.name)
    .sort();

describe("decklists as text", () => {
  it("a prebuilt deck survives the text round trip, and stays legal", () => {
    if (!vol1) throw new Error("no prebuilt deck");
    const parsed = parseDeck(deckText({ ...vol1, name: vol1.name }));
    expect(parsed.unknown).toEqual([]);
    expect(parsed.name).toBe(vol1.name);
    expect(parsed.main).toEqual(vol1.main);
    expect(parsed.lb).toEqual(vol1.lb);
    expect(validateDeck(parsed, findCard, "standard").legal).toBe(true);
  });

  it("reads counts and card numbers written in several ways, names in both languages, and LB cards", () => {
    const parsed = parseDeck(
      // i18n-ignore: a card's French name, which the import must read
      ["Deck", "3x 27-122S", "Wuk Lamat (27-122S) x2", "1 Zack", "2 Léonora", "27-125s", "2 Noctis", "1 Nobody", ""].join("\n"),
    );
    expect(parsed.main).toEqual([
      [5, "27-122S"],
      [1, "27-123S"],
      [2, "3-143C"],
      [1, "27-125S"],
    ]);
    expect(parsed.lb).toEqual([[2, "23-125R"]]);
    expect(parsed.unknown).toEqual(["1 Nobody"]);
  });

  it("a link carries the deck, compressed in its fragment", async () => {
    if (!vol1) throw new Error("no prebuilt deck");
    const link = await deckLink(vol1, "https://example.test");
    expect(link.startsWith("https://example.test/#deck=1.")).toBe(true);
    const data = sharedDeckData(link);
    expect(data).not.toBeNull();
    const text = await decodeDeck(data as string);
    expect(parseDeck(text ?? "").main).toEqual(vol1.main);
    expect(await decodeDeck("1.notdeflate")).toBeNull();
    expect(await decodeDeck("2.abc")).toBeNull();
  });
});

describe("deck builder search", () => {
  it("free words in English or French, without accents", () => {
    expect(names("leonora")).toEqual(["Leonora"]);
    expect(names("Palom")).toContain("Palom");
    expect(names("27-123s")).toEqual(["Zack"]);
  });

  it("type, element, cost and power, in both languages", () => {
    expect(names("t:avant e:feu cost<=2").every((n) => all.find((c) => c.name === n)?.type === "Forward")).toBe(true);
    expect(all.filter(searchFilter("t:summon")).every((c) => c.type === "Summon")).toBe(true);
    expect(
      all
        .filter(searchFilter("e:lightning power>=8000"))
        .every((c) => c.elements.includes("lightning") && (c.power ?? 0) >= 8000),
    ).toBe(true);
    expect(all.filter(searchFilter("-e:fire")).some((c) => c.elements.includes("fire"))).toBe(false);
  });

  it("EX Burst, Limit Break and Multi-Element cards", () => {
    expect(all.filter(searchFilter("is:lb")).every((c) => c.lb !== undefined)).toBe(true);
    expect(all.filter(searchFilter("is:lb")).length).toBeGreaterThan(0);
    expect(all.filter(searchFilter("is:ex")).every((c) => c.exBurst)).toBe(true);
    expect(names("is:multi")).toContain("Jecht");
  });
});
