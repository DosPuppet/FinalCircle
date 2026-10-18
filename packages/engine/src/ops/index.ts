/**
 * Registers the effect handlers of every `ops/` domain (`opRegistry.ts`). Imported once by `game.ts`, through which the
 * public API (`index.ts`), the scenarios and the test helpers go.
 */
import { registerOps } from "../opRegistry";
import { HANDLERS as COMBAT_HANDLERS } from "./combat";
import { HANDLERS as FLOW_HANDLERS } from "./flow";
import { HANDLERS as PLAYERS_HANDLERS } from "./players";
import { HANDLERS as ZONES_HANDLERS } from "./zones";

for (const handlers of [COMBAT_HANDLERS, FLOW_HANDLERS, PLAYERS_HANDLERS, ZONES_HANDLERS]) registerOps(handlers);
