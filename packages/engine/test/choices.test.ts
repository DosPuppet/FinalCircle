import { describe, expect, it } from "vitest";
import { divisionOf, validateChoice } from "../src/choices";
import { RulesError } from "../src/errors";
import type { ChoiceRequest } from "../src/types";

const base = { prompt: "", intent: "other" as const, suggested: [] };

describe("generic choices", () => {
  it("pick: options, bounds, no duplicates", () => {
    const req: ChoiceRequest = { ...base, type: "pick", options: ["o1", "o2", "o3"], min: 1, max: 2 };
    expect(() => validateChoice(req, ["o1"])).not.toThrow();
    expect(() => validateChoice(req, ["o1", "o3"])).not.toThrow();
    expect(() => validateChoice(req, [])).toThrow(RulesError);
    expect(() => validateChoice(req, ["o1", "o2", "o3"])).toThrow(RulesError);
    expect(() => validateChoice(req, ["o1", "o1"])).toThrow(RulesError);
    expect(() => validateChoice(req, ["o9"])).toThrow(RulesError);
  });

  it("number, order and yes/no", () => {
    expect(() => validateChoice({ ...base, type: "number", min: 0, max: 3 }, [3])).not.toThrow();
    expect(() => validateChoice({ ...base, type: "number", min: 0, max: 3 }, [4])).toThrow(RulesError);
    expect(() => validateChoice({ ...base, type: "number", min: 0, max: 3 }, [1.5])).toThrow(RulesError);
    expect(() => validateChoice({ ...base, type: "order", items: ["a", "b"] }, ["b", "a"])).not.toThrow();
    expect(() => validateChoice({ ...base, type: "order", items: ["a", "b"] }, ["a"])).toThrow(RulesError);
    expect(() => validateChoice({ ...base, type: "yesNo" }, [1])).not.toThrow();
    expect(() => validateChoice({ ...base, type: "yesNo" }, [2])).toThrow(RulesError);
  });

  it("divide: the party's damage split by 1000 (CR 10.1.4.2.1)", () => {
    const req: ChoiceRequest = { ...base, type: "divide", among: ["o1", "o2"], total: 7000, step: 1000 };
    expect(() => validateChoice(req, [3000, 4000])).not.toThrow();
    expect(() => validateChoice(req, [7000, 0])).not.toThrow();
    expect(() => validateChoice(req, [3500, 3500])).toThrow(RulesError);
    expect(() => validateChoice(req, [3000, 3000])).toThrow(RulesError);
    expect(divisionOf(req as Extract<ChoiceRequest, { type: "divide" }>, [3000, 4000])).toEqual({ o1: 3000, o2: 4000 });
  });
});
