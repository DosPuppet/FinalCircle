/**
 * Golden games (`tools/golden.ts`, from Planecircle): each one replays identically, checkpoints
 * included, whatever rules version recorded it. A divergence at equal version means the engine changed behavior
 * without advancing `RULES_VERSION`; after a version change, regenerate only the games that diverge: `npm run golden -- --update`.
 */
import { readdirSync, readFileSync } from "node:fs";
import { card } from "@finalcircle/cards";
import { type GameRecord, RULES_VERSION, replayChecked } from "@finalcircle/engine";
import { describe, expect, it } from "vitest";

const dir = new URL("golden/", import.meta.url);
const names = readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.slice(0, -5));

describe("golden games", () => {
  it("there are some", () => expect(names.length).toBeGreaterThanOrEqual(8));

  it.each(names.map((n) => [n]))(
    "%s replays identically",
    (name) => {
      const record = JSON.parse(readFileSync(new URL(`${name}.json`, dir), "utf8")) as GameRecord;
      expect(record.checkpoints?.length).toBeGreaterThan(5);
      expect(record.rules).toBeLessThanOrEqual(RULES_VERSION);
      const { divergence } = replayChecked(record, card);
      expect(
        divergence,
        record.rules === RULES_VERSION
          ? "The engine changed behavior: advance RULES_VERSION, then npm run golden -- --update"
          : `Game recorded at version ${record.rules} no longer replays: npm run golden -- --update`,
      ).toBeNull();
    },
    60_000,
  );
});
