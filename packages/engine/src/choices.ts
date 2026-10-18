/**
 * Generic choices: validation of the answers and building of the requests (from Planecircle).
 */
import { RulesError } from "./errors";
import { msg } from "./text";
import type { ChoicePurpose, ChoiceRequest, ChoiceValue, GameState, PlayerId } from "./types";

/**
 * Marker of a card in a player-facing text (prompt, label): the interface replaces it with the name of the card in its
 * language.
 */
export function cardRef(defId: string): string {
  return `⟦${defId}⟧`;
}

export function ask(s: GameState, player: PlayerId, request: ChoiceRequest, purpose: ChoicePurpose): void {
  s.pending = { kind: "choice", player, request, purpose };
}

const isInt = (v: ChoiceValue): v is number => typeof v === "number" && Number.isInteger(v);

/** Checks that an answer meets the request; throws a RulesError otherwise. */
export function validateChoice(req: ChoiceRequest, values: ChoiceValue[]): void {
  switch (req.type) {
    case "pick": {
      if (new Set(values).size !== values.length) throw new RulesError(msg("Duplicate choice"));
      if (values.some((v) => typeof v !== "string" || !req.options.includes(v)))
        throw new RulesError(msg("Choice not among the options"));
      if (values.length < req.min || values.length > req.max) {
        throw new RulesError(
          req.min === req.max
            ? msg("Choose exactly {n}", { n: req.min })
            : msg("Choose between {min} and {max}", { min: req.min, max: req.max }),
        );
      }
      return;
    }
    case "number": {
      const v = values[0];
      if (values.length !== 1 || v === undefined || !isInt(v) || v < req.min || v > req.max) {
        throw new RulesError(msg("Expected a number between {min} and {max}", { min: req.min, max: req.max }));
      }
      return;
    }
    case "order": {
      const sorted = [...values].map(String).sort();
      const expected = [...req.items].sort();
      if (sorted.length !== expected.length || sorted.some((v, i) => v !== expected[i]))
        throw new RulesError(msg("Invalid order"));
      return;
    }
    case "yesNo":
      if (values.length !== 1 || (values[0] !== 0 && values[0] !== 1)) throw new RulesError(msg("Expected a yes/no answer"));
      return;
    case "divide": {
      if (values.length !== req.among.length || values.some((v) => !isInt(v) || v < 0))
        throw new RulesError(msg("Invalid division"));
      const sum = (values as number[]).reduce((a, b) => a + b, 0);
      if (sum !== req.total) throw new RulesError(msg("Divide exactly {n}", { n: req.total }));
      if (req.step && values.some((v) => (v as number) % (req.step as number) !== 0))
        throw new RulesError(msg("Divide in steps of {n}", { n: req.step }));
      if (req.minEach && values.some((v) => (v as number) < (req.minEach as number)))
        throw new RulesError(msg("At least {n} for each", { n: req.minEach }));
      return;
    }
  }
}

/** Answer as a recipient → quantity table, for a division. */
export function divisionOf(req: Extract<ChoiceRequest, { type: "divide" }>, values: ChoiceValue[]): Record<string, number> {
  const out: Record<string, number> = {};
  req.among.forEach((id, i) => {
    out[id] = Number(values[i] ?? 0);
  });
  return out;
}
