/**
 * The card groups with their data and scripts (`setRegistry.ts` lists them for the import tools): every data file and
 * every script folder is imported here.
 */
import starter25 from "../data/starter25.json";
import type { RawCard } from "./raw";
import type { CardScript } from "./script";
import { CARD_GROUPS, type CardGroup } from "./setRegistry";
import { STARTER25_SCRIPTS } from "./starter25";

export interface LoadedGroup extends CardGroup {
  data: RawCard[];
  scripts: Record<string, CardScript>;
}

const DATA: Record<string, { data: RawCard[]; scripts: Record<string, CardScript> }> = {
  starter25: { data: starter25 as RawCard[], scripts: STARTER25_SCRIPTS },
};

export const GROUPS: LoadedGroup[] = CARD_GROUPS.map((g) => {
  const loaded = DATA[g.code];
  if (!loaded) throw new Error(`card group ${g.code}: no data imported in groups.ts`);
  return { ...g, ...loaded };
});
