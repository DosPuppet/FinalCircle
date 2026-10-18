/** Prebuilt decks (`packages/cards/decks/*.json`), by card number. */
import type { Element } from "@finalcircle/engine";
import vol1 from "../decks/starter-2025-vol1.json";
import vol2 from "../decks/starter-2025-vol2.json";

export interface DeckList {
  id: string;
  name: string;
  description?: string;
  /** French name and description. */
  fr?: { name: string; description?: string };
  elements: Element[];
  /** Card number of the cover art. */
  cover?: string;
  main: [number, string][];
  lb: [number, string][];
  /** Card group of the prebuilt decks (`setRegistry.ts`). */
  group?: string;
  /** Where an unofficial list comes from. */
  source?: string;
  /** A prebuilt deck (not editable). */
  builtin?: boolean;
}

export const DECKS: DeckList[] = [vol1, vol2].map((d) => ({ ...(d as unknown as DeckList), builtin: true }));

export function deckById(id: string): DeckList | undefined {
  return DECKS.find((d) => d.id === id);
}
