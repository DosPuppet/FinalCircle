/**
 * The player's decks, kept in the browser (localStorage; from Planecircle), next to the prebuilt decks. A deck is its
 * card numbers and counts (main deck and LB deck); its elements are those of its cards.
 */
import { CARDS, DECKS, type DeckList, deckById, findCard } from "@finalcircle/cards";
import type { Element } from "@finalcircle/engine";
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { type Lang, t, textLang } from "../translate";

/** Tolerant storage: private browsing or blocked storage must not break anything. */
const safeStorage: StateStorage = {
  getItem: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      // storage unavailable: the decks stay in memory for the session
    }
  },
  removeItem: (k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      // same
    }
  },
};

const ELEMENT_ORDER: Element[] = ["fire", "ice", "wind", "earth", "lightning", "water", "light", "dark"];

/** The elements of a deck's cards, most frequent first (main deck). */
export function deckElements(main: [number, string][]): Element[] {
  const count = new Map<Element, number>();
  for (const [n, code] of main) for (const e of findCard(code)?.elements ?? []) count.set(e, (count.get(e) ?? 0) + n);
  return ELEMENT_ORDER.filter((e) => count.has(e)).sort((a, b) => (count.get(b) ?? 0) - (count.get(a) ?? 0));
}

interface DeckStore {
  decks: DeckList[];
  save(deck: DeckList): void;
  remove(id: string): void;
  /** Creates an editable copy (of a prebuilt deck or not); returns its id. */
  duplicate(deck: DeckList, name?: string): string;
  create(name?: string): string;
}

const newId = () => `deck-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;

export const useDecks = create<DeckStore>()(
  persist(
    (set, get) => ({
      decks: [],
      save(deck) {
        const d: DeckList = { ...deck, builtin: false, elements: deckElements(deck.main) };
        delete d.fr;
        delete d.source;
        const others = get().decks.filter((x) => x.id !== d.id);
        set({ decks: [...others, d].sort((a, b) => a.name.localeCompare(b.name)) });
      },
      remove(id) {
        set({ decks: get().decks.filter((d) => d.id !== id) });
      },
      duplicate(deck, name) {
        const id = newId();
        get().save({
          ...deck,
          id,
          name: name ?? t("{name} (copy)", { name: deckName(deck, textLang()) }),
          builtin: false,
          main: deck.main.map(([n, c]) => [n, c]),
          lb: deck.lb.map(([n, c]) => [n, c]),
        });
        return id;
      },
      create(name = t("New deck")) {
        const id = newId();
        get().save({ id, name, elements: [], main: [], lb: [] });
        return id;
      },
    }),
    { name: "finalcircle.decks", version: 1, storage: createJSONStorage(() => safeStorage) },
  ),
);

/** A deck's name in a language: prebuilt decks carry their French name in `fr`; the player's decks have one name. */
export function deckName(deck: DeckList, lang: Lang): string {
  return (lang === "fr" && deck.fr?.name) || deck.name;
}

/** A deck's description in a language (see `deckName`). */
export function deckDescription(deck: DeckList, lang: Lang): string | undefined {
  return (lang === "fr" && deck.fr?.description) || deck.description;
}

/** Prebuilt decks, then the player's decks. */
export function useAllDecks(): DeckList[] {
  const mine = useDecks((s) => s.decks);
  return [...DECKS, ...mine];
}

/** A deck by its id, prebuilt or the player's. */
export function findDeck(id: string): DeckList | undefined {
  return deckById(id) ?? useDecks.getState().decks.find((d) => d.id === id);
}

/** The card shown for a deck: its cover, otherwise its most frequent card of the highest cost. */
export function deckCover(deck: DeckList): string | undefined {
  if (deck.cover) return deck.cover;
  const best = [...deck.main].sort((a, b) => b[0] - a[0] || (CARDS[b[1]]?.cost ?? 0) - (CARDS[a[1]]?.cost ?? 0))[0];
  return best?.[1];
}
