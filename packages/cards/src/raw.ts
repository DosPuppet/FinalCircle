/**
 * Shape of the card data files (`packages/cards/data/<group>.json`), written by `tools/import-cards.ts` from the
 * official card browser and from `data/supplement.json` (cards missing from it).
 */
import type { CardType, Element } from "@finalcircle/engine";

export interface RawCard {
  /** Card number of the identity (the oldest printing, CR 5.2.5.1). */
  id: string;
  /** Every printed code ("Re-174L", "19-102L"). */
  codes: string[];
  name: string;
  type: CardType;
  elements: Element[];
  cost: number;
  power?: number;
  jobs: string[];
  categories: string[];
  generic: boolean;
  exBurst: boolean;
  rarity: string;
  /** Serial number of the identity (L3 legality). */
  set: number;
  /** Names of the products the card was printed in. */
  printedIn: string[];
  /** English text, normalized (`fftext.ts`). */
  text: string;
  fr: { name: string; type: string; job: string; text: string };
  /** Image file names on the official CDN; null: none (the text frame is shown). */
  image: { en?: string; fr?: string } | null;
  /** Where a card missing from the official data comes from. */
  source?: string;
  /** False while a hand-written French text is not checked against the French printing. */
  verified?: boolean;
}
