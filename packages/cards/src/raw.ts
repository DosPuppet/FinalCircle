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
  /**
   * Image file names, requested through the relay (`/ffimg/<size>/<file>`); null: none (the text frame is shown). For a
   * card the official CDN lacks, the file comes from the server's store (`imageSource`).
   */
  image: { en?: string; fr?: string } | null;
  /** An image the official CDN lacks: where `tools/missing-images.ts` fetches it (TCGplayer product id). */
  imageSource?: { tcgplayer: number };
  /** Where a card missing from the official data comes from. */
  source?: string;
  /** False while a hand-written French text is not checked against the French printing. */
  verified?: boolean;
}
