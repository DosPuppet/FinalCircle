/** AI levels: beginner, medium, expert (from Planecircle; docs/ai.md). */
import type { Agent } from "@finalcircle/engine";
import { decide } from "./heuristic";
import { forAgent, ismctsPriority } from "./ismcts";
import { MEDIUM_PROFILE, type Profile } from "./profile";
import { mulberry32 } from "./random";

export type AiLevel = "beginner" | "medium" | "expert";

export const AI_LEVELS: readonly AiLevel[] = ["beginner", "medium", "expert"];

/** Thinking budget: in time (interface), or in iterations (tests, tournament: reproducible). */
export type AiBudget = { ms: number } | { iterations: number };

export interface AiOptions {
  seed?: number;
  budget?: AiBudget;
  /**
   * Decisions taken on the state as the seat may know it (`forAgent`): the opponent's hidden cards are redrawn. The
   * interface and the server set it.
   */
  fair?: boolean;
}

export function aiAgent(level: AiLevel, opts: AiOptions = {}): Agent {
  const rand = mulberry32(opts.seed ?? 1);
  const budget = opts.budget;
  const ms = budget && "ms" in budget ? budget.ms : null;
  let deadline = Number.POSITIVE_INFINITY;
  const profile: Profile =
    level === "beginner"
      ? { ...MEDIUM_PROFILE, rand, sloppiness: 0.4, forgetfulness: 0.2, responds: false, combat: "naive", mulligan: "loose" }
      : level === "expert"
        ? { ...MEDIUM_PROFILE, rand, outOfTime: () => Date.now() > deadline }
        : { ...MEDIUM_PROFILE, rand };
  const iterations = budget && "iterations" in budget ? budget.iterations : undefined;
  // Its own stream, so that `fair` does not change the other random draws of the level.
  const fairRand = mulberry32(((opts.seed ?? 1) * 7919 + 17) | 0);
  return (s, me) => {
    deadline = ms === null ? Number.POSITIVE_INFINITY : Date.now() + ms;
    const seen = opts.fair ? forAgent(s, me, fairRand) : s;
    const p = s.pending;
    if (level === "expert" && p?.kind === "priority" && p.player === me && (iterations ?? 1) > 0) {
      const d = ismctsPriority(seen, me, profile, {
        rand,
        ...(iterations !== undefined ? { iterations } : {}),
        ...(ms !== null ? { ms } : {}),
      });
      if (d) return d;
    }
    return decide(seen, me, profile);
  };
}
