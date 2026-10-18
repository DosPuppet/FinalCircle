/**
 * Attacks and blocks (CR 10): each possible attack (one Forward, a whole party) and each possible block is simulated
 * through the Damage Resolution Step and evaluated; a naive profile follows simple rules instead.
 */
import {
  attackCandidates,
  blockCandidates,
  type Decision,
  effectivePower,
  type GameState,
  opponentOf,
  type PlayerId,
  partyGroups,
} from "@finalcircle/engine";
import { evaluate, trySubmit } from "./evaluate";
import { playOn } from "./heuristic";
import { activeForwards } from "./policy";
import type { Profile } from "./profile";

/** Until this attack is over: back to the declaration, or Main Phase 2. */
function afterAttack(s: GameState): GameState {
  const turn = s.turn.number;
  return playOn(
    s,
    (x) =>
      x.turn.number !== turn ||
      x.turn.phase !== "attack" ||
      (x.turn.step === "declaration" && !x.attack && x.pending?.kind === "declareAttack"),
    80,
  );
}

function score(s: GameState, me: PlayerId, d: Decision): number | null {
  const next = trySubmit(s, me, d);
  return next ? evaluate(afterAttack(next), me) : null;
}

export function chooseAttack(s: GameState, me: PlayerId, pr: Profile): Decision {
  const single = attackCandidates(s, me);
  if (pr.combat === "naive") {
    // Attacks with a Forward stronger than every opposing blocker, at random otherwise.
    const strongest = Math.max(0, ...activeForwards(s, opponentOf(s, me)).map((id) => effectivePower(s, id)));
    const id = single.find((x) => effectivePower(s, x) > strongest) ?? (pr.rand() < 0.3 ? single[0] : undefined);
    return id ? { type: "attack", forwards: [id] } : { type: "endAttacks" };
  }
  const end: Decision = { type: "endAttacks" };
  const base = score(s, me, end) ?? evaluate(s, me);
  let best: Decision = end;
  let bestScore = base + 0.5;
  const tries: Decision[] = [
    ...single.map((id): Decision => ({ type: "attack", forwards: [id] })),
    ...partyGroups(s, me).map((p): Decision => ({ type: "attack", forwards: p.members })),
  ];
  for (const d of tries) {
    if (pr.outOfTime()) break;
    const v = score(s, me, d);
    if (v !== null && v > bestScore) {
      bestScore = v;
      best = d;
    }
  }
  return best;
}

export function chooseBlock(s: GameState, me: PlayerId, pr: Profile): Decision {
  const blockers = blockCandidates(s, me);
  if (pr.combat === "naive") {
    const power = (s.attack?.attackers ?? []).reduce((t, id) => t + effectivePower(s, id), 0);
    const id = blockers.find((x) => effectivePower(s, x) > power);
    return { type: "block", blocker: id ?? null };
  }
  let best: Decision = { type: "block", blocker: null };
  let bestScore = score(s, me, best) ?? evaluate(s, me);
  for (const id of blockers) {
    const d: Decision = { type: "block", blocker: id };
    const v = score(s, me, d);
    if (v !== null && v > bestScore + 0.25) {
      bestScore = v;
      best = d;
    }
  }
  return best;
}
