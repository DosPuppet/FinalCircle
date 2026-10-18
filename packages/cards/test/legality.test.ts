/** The README's list of banned and restricted cards agrees with `data/formats.json` (from Planecircle's legality test). */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import formats from "../data/formats.json";

const README = readFileSync(new URL("../../../README.md", import.meta.url), "utf8");

/** Card numbers of a README line that starts with `label`. */
function listed(label: string): string[] {
  const line = README.split("\n").find((l) => l.startsWith(label));
  return [...(line ?? "").matchAll(/\b\d+-\d{3}[A-Z]\b/g)].map((m) => m[0]).sort();
}

describe("Standard ban and restricted list", () => {
  it("the README lists exactly the banned cards of formats.json", () => {
    expect(listed("- **Banned:**")).toEqual([...formats.standard.banned].sort());
  });

  it("the README lists exactly the restricted cards of formats.json", () => {
    expect(listed("- **Restricted to 1 copy:**")).toEqual(Object.keys(formats.standard.restricted).sort());
  });
});
