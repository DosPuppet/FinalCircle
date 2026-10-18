/**
 * English names of the cards of the data files (the French detector, `test/frenchSource.ts`, does not count an accented
 * word of an English card name as French).
 */
import { GROUPS } from "./groups";

export const CARD_NAMES: readonly string[] = [...new Set(GROUPS.flatMap((g) => g.data.map((c) => c.name)))];
