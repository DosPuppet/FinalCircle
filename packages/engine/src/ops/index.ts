/**
 * Registers the effect handlers of every `ops/` domain (`opRegistry.ts`). Imported once by `game.ts`, through which the
 * public API (`index.ts`), the scenarios and the test helpers go.
 */

import type { OpHandlers } from "../opRegistry";
import { registerOps } from "../opRegistry";

/** The domains of handlers; card effects arrive with the abilities (lot A5). */
const DOMAINS: OpHandlers[] = [];

for (const handlers of DOMAINS) registerOps(handlers);
