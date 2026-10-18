import { describe, expect, it } from "vitest";
import { cardRef } from "../src/choices";
import { msg, parseText, plainText, renderText, type TextReader } from "../src/text";

const FR: Record<string, string> = {
  "Exile {n} card(s) from your graveyard": "Exilez {n} carte(s) de votre cimetière",
  "Cast {card} for free?": "Lancer {card} gratuitement ?",
  "{who} chooses: {choice}": "{who} choisit : {choice}",
  "A +1/+1 counter": "Un marqueur +1/+1",
  "ctx:graveyard|Exile": "Exiler du cimetière",
};
const french: TextReader = {
  translate: (id) => FR[id],
  card: (defId) => (defId === "1-170C" ? "Fée" : defId),
};

describe("player-facing text (from Planecircle)", () => {
  it("msg without values returns the literal unchanged", () => {
    expect(msg("Draw a card")).toBe("Draw a card");
  });

  it("msg marks each value; parseText recovers the template and the values", () => {
    const text = msg("Exile {n} card(s) from your graveyard", { n: 2 });
    expect(text).toBe("Exile ⟨n|2⟩ card(s) from your graveyard");
    expect(parseText(text)).toEqual({ id: "Exile {n} card(s) from your graveyard", args: { n: "2" } });
  });

  it("a placeholder without a value stays in the template", () => {
    expect(msg("{a} and {b}", { a: 1 })).toBe("⟨a|1⟩ and {b}");
  });

  it("renders in English without a catalog, cards named by their id", () => {
    expect(plainText(msg("Cast {card} for free?", { card: cardRef("1-170C") }))).toBe("Cast 1-170C for free?");
    expect(plainText("Draw a card")).toBe("Draw a card");
  });

  it("translates the template, then each value (nested text, card, translatable word, raw value)", () => {
    expect(renderText(msg("Cast {card} for free?", { card: cardRef("1-170C") }), french)).toBe("Lancer Fée gratuitement ?");
    const nested = msg("{who} chooses: {choice}", { who: "Bob", choice: "A +1/+1 counter" });
    expect(renderText(nested, french)).toBe("Bob choisit : Un marqueur +1/+1");
    const deeper = msg("{who} chooses: {choice}", {
      who: "Bob",
      choice: msg("Exile {n} card(s) from your graveyard", { n: 3 }),
    });
    expect(parseText(deeper).args.choice).toBe("Exile ⟨n|3⟩ card(s) from your graveyard");
    expect(renderText(deeper, french)).toBe("Bob choisit : Exilez 3 carte(s) de votre cimetière");
  });

  it("an untranslated text falls back to English; a context prefix is never shown", () => {
    expect(renderText("Untranslated text", french)).toBe("Untranslated text");
    expect(renderText("ctx:graveyard|Exile", french)).toBe("Exiler du cimetière");
    expect(plainText("ctx:graveyard|Exile")).toBe("Exile");
  });

  it("keeps card references outside markers (legacy texts) and malformed markers", () => {
    expect(renderText(`Return ${cardRef("1-170C")}`, french)).toBe("Return Fée");
    expect(plainText("a ⟨broken marker")).toBe("a ⟨broken marker");
    expect(plainText("a ⟨no separator⟩ b")).toBe("a ⟨no separator⟩ b");
  });
});
