/**
 * Scripted opponent (tutorial; from Planecircle): it plays the planned actions, cards designated by their card number,
 * with the payment the engine suggests, then does the bare minimum (pass, no attack, no block, suggested answers). The
 * script is serializable data, sent as is to the game worker.
 */
import {
  type ActionOption,
  type Agent,
  attackCandidates,
  blockCandidates,
  type ChooseOption,
  type Decision,
  fallbackDecision,
  type GameState,
  legalActions,
  type ObjectId,
  type Phase,
  type PlayerId,
} from "@finalcircle/engine";

/** When a Summon or an ability is used: the phase (Main Phase 1 of its own turn by default), or in response. */
interface Timing {
  phase?: Phase;
  /** In response to a Summon or an ability of the player (the stack is not empty). */
  respond?: boolean;
}

export type ScriptAction =
  /** `targets`: card numbers, in the order of the choices (the first legal one of each); `modes`: indexes. */
  | ({ turn: number; do: "cast"; card: string; targets?: string[]; modes?: number[] } & Timing)
  | ({ turn: number; do: "activate"; card: string; ability?: number; targets?: string[]; modes?: number[] } & Timing)
  /** One Forward, or a party. */
  | { turn: number; do: "attack"; with: string[] }
  /** The Forward that blocks, or none. */
  | { turn: number; do: "block"; blocker: string | null };

const defOf = (s: GameState, id: ObjectId): string | undefined => s.objects[id]?.defId;

/** Is the planned action to be done now (right moment in the turn)? */
function timely(s: GameState, me: PlayerId, a: ScriptAction): boolean {
  if (a.do !== "cast" && a.do !== "activate") return false;
  if (a.respond) return s.stack.length > 0;
  if (s.stack.length) return false;
  if (a.phase) return s.turn.phase === a.phase;
  return s.turn.active === me && s.turn.phase === "main1";
}

/** The targets of each choice: the wanted card numbers first, otherwise the first legal ones. */
function pickTargets(choose: ChooseOption[], wanted: string[], s: GameState): Record<string, ObjectId[]> {
  const out: Record<string, ObjectId[]> = {};
  const queue = [...wanted];
  for (const c of choose) {
    const want = queue.shift();
    const found = want ? c.options.find((id) => defOf(s, id) === want) : undefined;
    const n = Math.min(c.count, c.options.length);
    out[c.key] = found ? [found] : c.upTo ? [] : c.options.slice(0, n);
  }
  return out;
}

function priorityDecision(s: GameState, a: ScriptAction, actions: ActionOption[]): Decision | null {
  if (a.do !== "cast" && a.do !== "activate") return null;
  const option = actions.find(
    (o): o is Extract<ActionOption, { type: "cast" | "activate" }> =>
      (a.do === "cast" && o.type === "cast" && defOf(s, o.card) === a.card) ||
      (a.do === "activate" &&
        o.type === "activate" &&
        defOf(s, o.source) === a.card &&
        (a.ability === undefined || o.ability === a.ability)),
  );
  if (!option) return null;
  const modes = option.modal ? (a.modes ?? option.modal.available.slice(0, option.modal.pick)) : undefined;
  const choose = option.modal && modes ? modes.flatMap((m) => option.modal?.choose[m] ?? []) : option.choose;
  const common = {
    payment: option.suggested,
    targets: pickTargets(choose, a.targets ?? [], s),
    ...(modes ? { modes: [...modes].sort((x, y) => x - y) } : {}),
  };
  if (option.type === "cast")
    return {
      type: "cast",
      card: option.card,
      ...common,
      ...(option.lb ? { lbFlip: option.lb.options.slice(0, option.lb.count) } : {}),
    };
  return {
    type: "activate",
    source: option.source,
    ability: option.ability,
    ...common,
    ...(option.special ? { special: option.special.options[0] as ObjectId } : {}),
  };
}

/** `fallback`: what the opponent does outside the script (by default: pass, no attack, no block, suggested answers). */
export function scriptedAgent(script: ScriptAction[], fallback?: Agent): Agent {
  const done = new Set<number>();
  /** Next action of the current turn among those of some kinds, in the order of the script. */
  const next = (s: GameState, kinds: ScriptAction["do"][]) => {
    const i = script.findIndex((a, k) => !done.has(k) && a.turn === s.turn.number && kinds.includes(a.do));
    return i < 0 ? null : { i, a: script[i] as ScriptAction };
  };
  const base: Agent = fallback ?? ((s) => fallbackDecision(s, s.pending as NonNullable<GameState["pending"]>));

  return (s, me) => {
    const p = s.pending;
    if (!p) return { type: "pass" };
    if (p.kind === "priority") {
      const n = next(s, ["cast", "activate"]);
      if (n && timely(s, me, n.a)) {
        const d = priorityDecision(s, n.a, legalActions(s, me));
        if (d) {
          done.add(n.i);
          return d;
        }
      }
      return fallback ? fallback(s, me) : { type: "pass" };
    }
    if (p.kind === "declareAttack") {
      const n = next(s, ["attack"]);
      if (n?.a.do === "attack") {
        done.add(n.i);
        const candidates = attackCandidates(s, me);
        const forwards: ObjectId[] = [];
        for (const code of n.a.with) {
          const id = candidates.find((c) => !forwards.includes(c) && defOf(s, c) === code);
          if (id) forwards.push(id);
        }
        if (forwards.length) return { type: "attack", forwards };
      }
      return fallback ? fallback(s, me) : { type: "endAttacks" };
    }
    if (p.kind === "declareBlock") {
      const n = next(s, ["block"]);
      if (n?.a.do === "block") {
        done.add(n.i);
        const code = n.a.blocker;
        const blocker = code ? blockCandidates(s, me).find((id) => defOf(s, id) === code) : undefined;
        return { type: "block", blocker: blocker ?? null };
      }
      return fallback ? fallback(s, me) : { type: "block", blocker: null };
    }
    return base(s, me);
  };
}
