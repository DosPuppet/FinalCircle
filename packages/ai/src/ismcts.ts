/**
 * ISMCTS (Information Set Monte Carlo Tree Search) for the priority decisions of the expert level (from Planecircle).
 *
 * The AI sees neither the opponent's hand, nor their deck, nor their face-down LB cards, nor the order of the decks.
 * At each iteration, a determinization is drawn (`determinize`); one of the root options is played (UCB1, biased
 * toward what the one-move evaluation prefers), then a fast playout until the start of the AI's next turn, and the
 * position is evaluated. The tree is limited to the root.
 */
import { cloneState, type Decision, fallbackDecision, type GameState, opponentOf, type PlayerId } from "@finalcircle/engine";
import { evaluate, onlyRulesErrors, step } from "./evaluate";
import { priorityOptions } from "./heuristic";
import { fastPolicy } from "./policy";
import type { Profile } from "./profile";

export interface IsmctsConfig {
  rand: () => number;
  /** Fixed number of iterations (tests, tournament: reproducible). */
  iterations?: number;
  /** Otherwise, time budget (interface): the search stops at the deadline. */
  ms?: number;
  /** Below it, the search is not reliable enough: the heuristic decision is kept. */
  minIterations?: number;
  maxIterations?: number;
  /** Options examined at the root (passing included). */
  width?: number;
  /** Decisions per playout. */
  horizon?: number;
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

function shuffleInPlace<T>(items: T[], rand: () => number): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [items[i], items[j]] = [items[j] as T, items[i] as T];
  }
}

/** The opponent's cards that `me` has seen: on the field, in their Break Zone, Damage Zone, removed face up, face-up LB cards, Summons on the stack. */
function seenCards(s: GameState, p: PlayerId): { main: string[]; lb: string[] } {
  const pl = s.players[p];
  if (!pl) return { main: [], lb: [] };
  const ids = [
    ...s.field.filter((id) => s.objects[id]?.owner === p),
    ...pl.breakZone,
    ...pl.damage,
    ...pl.removed.filter((id) => !s.objects[id]?.faceDown),
    ...s.stack.filter((i) => i.kind === "summon" && s.objects[i.sourceId]?.owner === p).map((i) => i.sourceId),
  ];
  const defs = ids.map((id) => s.objects[id]?.defId as string).filter(Boolean);
  const lbDefs = pl.lb.filter((id) => !s.objects[id]?.faceDown).map((id) => s.objects[id]?.defId as string);
  const isLb = (defId: string) => !!s.defs[defId]?.lb;
  return { main: [...new Set(defs.filter((d) => !isLb(d)))], lb: [...new Set([...lbDefs, ...defs.filter(isLb)])] };
}

/**
 * A determinization of the state seen by `me`: the opponent's hand and main deck are drawn from the cards seen of them
 * (their main cards), their face-down LB cards from their LB cards seen; with nothing seen yet, they keep their
 * definitions (the prebuilt decks are public lists; docs/ai.md). `me`'s own deck is shuffled, the engine's randomness
 * redrawn. Object ids are kept, so a decision taken on it is valid on the real state.
 */
export function determinize(s: GameState, me: PlayerId, rand: () => number, keep: ReadonlySet<string> = new Set()): GameState {
  const d = cloneState(s);
  const opp = opponentOf(d, me);
  const pl = d.players[opp];
  const pickOf = (items: string[]) => items[Math.floor(rand() * items.length)] as string;
  if (pl) {
    const seen = seenCards(s, opp);
    for (const id of [...pl.hand, ...pl.deck]) {
      const o = d.objects[id];
      if (o && !keep.has(id) && seen.main.length >= 3) o.defId = pickOf(seen.main);
    }
    for (const id of pl.lb) {
      const o = d.objects[id];
      if (o?.faceDown && !keep.has(id) && seen.lb.length) o.defId = pickOf(seen.lb);
    }
    shuffleInPlace(pl.deck, rand);
  }
  const mine = d.players[me];
  if (mine) shuffleInPlace(mine.deck, rand);
  d.rng = Math.floor(rand() * 2 ** 31);
  d.version += 1;
  return d;
}

/** The state as the AI of seat `me` may know it: a determinization keeping the cards its pending question shows it. */
export function forAgent(s: GameState, me: PlayerId, rand: () => number): GameState {
  const keep = new Set<string>();
  const p = s.pending;
  if (p?.kind === "choice" && p.player === me) {
    const walk = (x: unknown): void => {
      if (typeof x === "string") {
        if (s.objects[x]) keep.add(x);
      } else if (Array.isArray(x)) for (const y of x) walk(y);
      else if (x && typeof x === "object") for (const y of Object.values(x)) walk(y);
    };
    walk(p.request);
  }
  return determinize(s, me, rand, keep);
}

const policy = fastPolicy();

/** A fast playout until the start of `me`'s next turn (or the end of the game, or `horizon` decisions). */
function playout(start: GameState, me: PlayerId, horizon: number): GameState {
  const d = start;
  const startTurn = d.turn.number;
  for (let i = 0; i < horizon && !d.over && d.pending; i++) {
    if (d.turn.number > startTurn && d.turn.active === me) break;
    const p = d.pending;
    try {
      step(d, p.player, policy(d, p.player), true);
    } catch (e) {
      onlyRulesErrors(e);
      try {
        step(d, p.player, fallbackDecision(d, p), true);
      } catch (e2) {
        onlyRulesErrors(e2);
        break;
      }
    }
  }
  return d;
}

export interface Candidate {
  decision: Decision;
  /** One-move evaluation: initial bias of the search. */
  prior: number;
}

const keyOf = (d: Decision) => JSON.stringify(d);

/** Chooses among `cands` by ISMCTS, or null if too few iterations fit in the allotted time. */
export function ismctsChoose(s: GameState, me: PlayerId, cands: Candidate[], cfg: IsmctsConfig): Decision | null {
  if (cands.length < 2) return cands[0]?.decision ?? null;
  const root = evaluate(s, me);
  const bestPrior = Math.max(...cands.map((c) => c.prior));
  const bias = cands.map((c) => 0.3 * sigmoid((c.prior - bestPrior) / 3));
  const n = cands.map(() => 0);
  const w = cands.map(() => 0);
  const horizon = cfg.horizon ?? 200;
  const t0 = Date.now();
  const maxIt = cfg.iterations ?? cfg.maxIterations ?? 400;
  let total = 0;
  for (let it = 0; it < maxIt * 2 && total < maxIt; it++) {
    if (cfg.iterations === undefined && Date.now() - t0 > (cfg.ms ?? 700)) break;
    let i = n.indexOf(0);
    if (i < 0) {
      let best = Number.NEGATIVE_INFINITY;
      for (let k = 0; k < cands.length; k++) {
        const nk = n[k] as number;
        const ucb = (w[k] as number) / nk + 0.7 * Math.sqrt(Math.log(total) / nk) + (bias[k] as number) / (nk + 1);
        if (ucb > best) {
          best = ucb;
          i = k;
        }
      }
    }
    let d = determinize(s, me, cfg.rand);
    try {
      d = step(d, me, (cands[i] as Candidate).decision, true);
    } catch (e) {
      onlyRulesErrors(e);
      n[i] = (n[i] as number) + 1;
      total++;
      continue;
    }
    d = playout(d, me, horizon);
    const reward = d.over ? (d.winner === me ? 1 : 0) : sigmoid((evaluate(d, me) - root) / 6);
    n[i] = (n[i] as number) + 1;
    w[i] = (w[i] as number) + reward;
    total++;
  }
  if (cfg.iterations === undefined && total < (cfg.minIterations ?? 24)) return null;
  let best = 0;
  for (let k = 1; k < cands.length; k++) {
    const better =
      (n[k] as number) > (n[best] as number) ||
      ((n[k] as number) === (n[best] as number) && (w[k] as number) > (w[best] as number));
    if (better) best = k;
  }
  return (cands[best] as Candidate).decision;
}

/** Priority decision by ISMCTS, or null: nothing to choose, or too few iterations in the allotted time. */
export function ismctsPriority(s: GameState, me: PlayerId, pr: Profile, cfg: IsmctsConfig): Decision | null {
  const found = priorityOptions(s, me, pr);
  if (!found?.options.length) return null;
  const width = cfg.width ?? 6;
  const pass: Decision = { type: "pass" };
  const seen = new Set<string>([keyOf(pass)]);
  const cands: Candidate[] = [{ decision: pass, prior: found.baseline }];
  for (const o of [...found.options].sort((a, b) => b.score - a.score)) {
    if (cands.length >= width) break;
    const k = keyOf(o.decision);
    if (seen.has(k)) continue;
    seen.add(k);
    cands.push({ decision: o.decision, prior: o.score });
  }
  return cands.length < 2 ? null : ismctsChoose(s, me, cands, cfg);
}
