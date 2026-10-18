/**
 * Code and documentation in English (from Planecircle): no French outside the files of `data/french-baseline.json`, and the
 * baseline only shrinks. `files`: files still to translate; `allowed`: files that keep French on purpose, with the reason.
 * Update: `npx tsx tools/french-source.ts --write`; one file's French lines: `--lines <file>`.
 */
import { describe, expect, it } from "vitest";
import baseline from "../data/french-baseline.json";
import { frenchFiles, frenchLines } from "./frenchSource";

const allowed: Record<string, string> = baseline.allowed;
const listed = new Set<string>(baseline.files as string[]);

describe("English source", () => {
  const found = frenchFiles();

  it("no French outside the baseline", () => {
    const extra = Object.keys(found).filter((f) => !listed.has(f) && !(f in allowed));
    const detail = extra.map(
      (f) =>
        `${f}\n${frenchLines(f)
          .slice(0, 5)
          .map((l) => `  ${l.line}: ${l.text.trim()}`)
          .join("\n")}`,
    );
    expect(detail, "French in a file outside the baseline: translate it").toEqual([]);
  });

  it("the baseline only lists files that still contain French", () => {
    const stale = [...listed].filter((f) => !found[f]);
    expect(stale, "translated files still listed: npx tsx tools/french-source.ts --write").toEqual([]);
  });

  it("every allowed file gives a reason and is not also listed", () => {
    for (const [f, reason] of Object.entries(allowed)) {
      expect(reason.length, f).toBeGreaterThan(10);
      expect(listed.has(f), f).toBe(false);
    }
  });
});
