/**
 * From an option of `legalActions` to a decision (from Planecircle's options.ts): the suggested payment, targets and
 * modes chosen at random among the legal ones (or the first ones with `rand` absent).
 */
import type { ActionOption, ChooseOption, Decision, ObjectId } from "@finalcircle/engine";

const take = (rand: (() => number) | undefined, items: readonly string[], n: number): ObjectId[] => {
  if (!rand) return items.slice(0, n);
  const copy = [...items];
  const out: ObjectId[] = [];
  while (out.length < n && copy.length) out.push(copy.splice(Math.floor(rand() * copy.length), 1)[0] as string);
  return out;
};

function targetsFor(choose: readonly ChooseOption[], rand?: () => number): Record<string, ObjectId[]> {
  const out: Record<string, ObjectId[]> = {};
  for (const c of choose) {
    const max = Math.min(c.count, c.options.length);
    const n = c.upTo ? (rand ? Math.floor(rand() * (max + 1)) : 0) : max;
    out[c.key] = take(rand, c.options, n);
  }
  return out;
}

/** The decision of an option; `pick`: which attack or blocker (deterministic order), otherwise at random. */
export function decisionFor(o: ActionOption, rand?: () => number, pick?: number): Decision {
  const index = (n: number) => (pick !== undefined ? pick % n : rand ? Math.floor(rand() * n) : 0);
  switch (o.type) {
    case "pass":
      return { type: "pass" };
    case "endAttacks":
      return { type: "endAttacks" };
    case "attack": {
      const all = [...o.single.map((id) => [id]), ...o.parties.map((p) => p.members)];
      return all.length ? { type: "attack", forwards: all[index(all.length)] as ObjectId[] } : { type: "endAttacks" };
    }
    case "block": {
      const choices: (ObjectId | null)[] = [null, ...o.blockers];
      return { type: "block", blocker: choices[index(choices.length)] ?? null };
    }
    case "cast":
    case "activate": {
      let modes: number[] | undefined;
      let targets: Record<string, ObjectId[]>;
      if (o.modal) {
        const max = Math.min(o.modal.pick, o.modal.available.length);
        const n = o.modal.upTo ? 1 + (rand ? Math.floor(rand() * max) : 0) : max;
        modes = take(rand, o.modal.available.map(String), n)
          .map(Number)
          .sort((a, b) => a - b);
        targets = targetsFor(
          modes.flatMap((m) => o.modal?.choose[m] ?? []),
          rand,
        );
      } else targets = targetsFor(o.choose, rand);
      const common = { payment: o.suggested, targets, ...(modes ? { modes } : {}) };
      if (o.type === "cast")
        return { type: "cast", card: o.card, ...common, ...(o.lb ? { lbFlip: take(rand, o.lb.options, o.lb.count) } : {}) };
      return {
        type: "activate",
        source: o.source,
        ability: o.ability,
        ...common,
        ...(o.special ? { special: take(rand, o.special.options, 1)[0] as ObjectId } : {}),
      };
    }
  }
}
