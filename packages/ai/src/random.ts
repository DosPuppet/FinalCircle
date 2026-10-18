/**
 * Random AI (from Planecircle): a legal option at random, a valid answer at random. Used for fuzzing the engine.
 */
import {
  type Agent,
  type ChoiceRequest,
  type ChoiceValue,
  type Decision,
  type GameState,
  legalActions,
  type PlayerId,
} from "@finalcircle/engine";
import { decisionFor } from "./options";

export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(rand: () => number, items: readonly T[]): T | undefined {
  return items[Math.floor(rand() * items.length)];
}

export function sample<T>(rand: () => number, items: readonly T[], n: number): T[] {
  const copy = [...items];
  const out: T[] = [];
  while (out.length < n && copy.length) out.push(copy.splice(Math.floor(rand() * copy.length), 1)[0] as T);
  return out;
}

/** A valid answer to any question, at random. */
export function randomAnswer(rand: () => number, req: ChoiceRequest): ChoiceValue[] {
  switch (req.type) {
    case "pick": {
      const n = req.min + Math.floor(rand() * (req.max - req.min + 1));
      return sample(rand, req.options, n);
    }
    case "number":
      return [req.min + Math.floor(rand() * (req.max - req.min + 1))];
    case "order":
      return sample(rand, req.items, req.items.length);
    case "yesNo":
      return [rand() < 0.5 ? 1 : 0];
    case "divide": {
      // In steps (1000 for a party's damage), at random, each share at least `minEach`.
      const step = req.step ?? 1;
      const out = req.among.map(() => req.minEach ?? 0);
      let left = req.total - out.reduce((a, b) => a + b, 0);
      while (left >= step) {
        const i = Math.floor(rand() * out.length);
        out[i] = (out[i] as number) + step;
        left -= step;
      }
      if (left > 0) out[0] = (out[0] as number) + left;
      return out;
    }
  }
}

export function randomAgent(seed: number, passChance = 0.4): Agent {
  const rand = mulberry32(seed);
  return (s: GameState, me: PlayerId): Decision => {
    const p = s.pending;
    const hand = s.players[me]?.hand ?? [];
    switch (p?.kind) {
      case "mulligan":
        return rand() < 0.15 ? { type: "mulligan" } : { type: "keep" };
      case "discard":
        return { type: "discard", cards: sample(rand, hand, p.count) };
      case "choice":
        return { type: "choose", values: randomAnswer(rand, p.request) };
      case "declareAttack":
      case "declareBlock":
      case "priority": {
        const options = legalActions(s, me);
        const actions = options.filter((o) => o.type !== "pass");
        if (p.kind === "priority" && (actions.length === 0 || rand() < passChance)) return { type: "pass" };
        const o = pick(rand, p.kind === "priority" ? actions : options);
        return o ? decisionFor(o, rand) : { type: "pass" };
      }
      default:
        return { type: "pass" };
    }
  };
}
