/**
 * Sets of the game, and the card groups the repository imports. The only list of sets: the import tools read it
 * without loading the cards. Release dates from set 13 on: TCGplayer listings and ffdecks (research of 2026-10-18);
 * before, approximate (only their order matters: rotating formats use the latest sets). French set names are not in
 * the official data (docs/backlog.md).
 */

export type SetKind = "booster" | "starter" | "collection" | "boss" | "promo";

export interface SetInfo {
  /** Serial number of the booster sets (the number before the dash of a card number); none for side products. */
  number?: number;
  /** Name in the official data (`set` field). */
  name: string;
  nameFr?: string;
  /** Release date (ISO). */
  released: string;
  kind: SetKind;
}

export const SET_INFO: SetInfo[] = [
  { number: 1, name: "Opus I", released: "2016-10-28", kind: "booster" },
  { number: 2, name: "Opus II", released: "2017-03-24", kind: "booster" },
  { number: 3, name: "Opus III", released: "2017-07-28", kind: "booster" },
  { number: 4, name: "Opus IV", released: "2017-11-10", kind: "booster" },
  { number: 5, name: "Opus V", released: "2018-03-23", kind: "booster" },
  { number: 6, name: "Opus VI", released: "2018-07-27", kind: "booster" },
  { number: 7, name: "Opus VII", released: "2018-11-09", kind: "booster" },
  { number: 8, name: "Opus VIII", released: "2019-03-29", kind: "booster" },
  { number: 9, name: "Opus IX", released: "2019-07-26", kind: "booster" },
  { number: 10, name: "Opus X", released: "2019-11-08", kind: "booster" },
  { number: 11, name: "Opus XI", released: "2020-04-03", kind: "booster" },
  { number: 12, name: "Opus XII", released: "2020-11-06", kind: "booster" },
  { number: 13, name: "Opus XIII", released: "2021-03-26", kind: "booster" },
  { number: 14, name: "Opus XIV", released: "2021-08-06", kind: "booster" },
  { number: 15, name: "Crystal Dominion", released: "2021-11-19", kind: "booster" },
  { number: 16, name: "Emissaries of Light", released: "2022-03-25", kind: "booster" },
  { number: 17, name: "Rebellion's Call", released: "2022-08-12", kind: "booster" },
  { number: 18, name: "Resurgence of Power", released: "2022-11-25", kind: "booster" },
  { number: 19, name: "From Nightmares", released: "2023-03-24", kind: "booster" },
  { number: 20, name: "Dawn of Heroes", released: "2023-07-28", kind: "booster" },
  { number: 21, name: "Beyond Destiny", released: "2023-11-17", kind: "booster" },
  { number: 22, name: "Hidden Hope", released: "2024-03-22", kind: "booster" },
  { number: 23, name: "Hidden Trials", released: "2024-08-02", kind: "booster" },
  { number: 24, name: "Hidden Legends", released: "2024-11-15", kind: "booster" },
  { number: 25, name: "Tears of the Planet", released: "2025-03-28", kind: "booster" },
  { number: 26, name: "Gunslinger in the Abyss", released: "2025-08-08", kind: "booster" },
  { number: 27, name: "Journey of Discovery", released: "2025-11-14", kind: "booster" },
  { number: 28, name: "Dreamlike Oceans", released: "2026-03-27", kind: "booster" },
  { number: 29, name: "Blissful Eternity", released: "2026-08-07", kind: "booster" },
  { number: 30, name: "Memories of Life", released: "2026-11-13", kind: "booster" },
  { name: "Starter Set 2025", released: "2025-10-03", kind: "starter" },
  { name: "Legacy Collection", released: "2025-02-21", kind: "collection" },
  { name: "Dissidia Collection Set", released: "2023-11-17", kind: "collection" },
  { name: "Boss Deck Chaos", released: "2021-03-26", kind: "boss" },
  { name: "Boss Deck FFVII", released: "2023-01-27", kind: "boss" },
];

export const SET_BY_NAME: Record<string, SetInfo> = Object.fromEntries(SET_INFO.map((s) => [s.name, s]));

/**
 * The booster sets of a rotating format on a date: the latest `count` booster sets released by then (L3: 3, L6: 6), by
 * serial number.
 */
export function latestBoosters(date: string, count: number): number[] {
  return SET_INFO.filter((s) => s.kind === "booster" && s.number !== undefined && s.released <= date)
    .map((s) => s.number as number)
    .sort((a, b) => b - a)
    .slice(0, count);
}

/** The serial number of a card number ("27-123S" → 27; "PR-001", "B-001", "Re-174L" → none). */
export function serialOf(code: string): number | undefined {
  const m = /^(\d+)-\d+[A-Z]$/.exec(code);
  return m ? Number(m[1]) : undefined;
}

/**
 * Card groups written to `packages/cards/data/<code>.json` by `tools/import-cards.ts`: the cards of some decks
 * (`decks`), or a whole booster set (`set`, Milestone 2). Each group has its script folder `src/<code>/`.
 */
export interface CardGroup {
  code: string;
  name: string;
  nameFr: string;
  /** The cards of these decks (`packages/cards/decks/<id>.json`, main and LB decks). */
  decks?: string[];
  /** Every card of this booster set (serial number). */
  set?: number;
}

export const CARD_GROUPS: CardGroup[] = [
  {
    code: "starter25",
    name: "Starter Set 2025",
    nameFr: "Starter Set 2025",
    decks: ["starter-2025-vol1", "starter-2025-vol2"],
  },
];
