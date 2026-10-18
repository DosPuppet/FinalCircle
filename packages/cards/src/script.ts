/** What a card script gives; the rest of the definition comes from the data and the text parser (`fftext.ts`). */
import type { CardDef } from "@finalcircle/engine";

export type CardScript = Partial<Pick<CardDef, "abilities" | "summon" | "castRules" | "keywords">>;
