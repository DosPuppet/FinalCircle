/**
 * French catalogs of the cards package: `core` for the files at the root of `src/`, then one file per card group
 * directory (`src/<group>/` → `locales/fr/<group>.json`). Every file of `locales/fr/` is listed here
 * (`cards/test/locales.test.ts` checks it).
 */
import core from "../locales/fr/core.json";
import starter25 from "../locales/fr/starter25.json";

export const FRENCH_CATALOGS: Record<string, Record<string, string>> = {
  core,
  starter25,
};
