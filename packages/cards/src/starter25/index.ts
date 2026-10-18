/** Scripts of the Starter Set 2025 cards, by card number. */
import type { CardScript } from "../script";
import { VOL1 } from "./vol1";
import { VOL2 } from "./vol2";

export const STARTER25_SCRIPTS: Record<string, CardScript> = { ...VOL1, ...VOL2 };
