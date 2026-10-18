/**
 * AI against AI games with invariant checks (from Planecircle): the fuzz of the engine and the tests.
 */
import {
  type Agent,
  type CardDef,
  chars,
  createGame,
  type Decision,
  fallbackDecision,
  freshChars,
  type GameState,
  legalActions,
  type PlayerId,
  plainText,
  RulesError,
  submit,
} from "@finalcircle/engine";
import { corruptDecision } from "./chaos";
import { decisionFor } from "./options";
import { mulberry32 } from "./random";

export interface Deck {
  main: CardDef[];
  lb?: CardDef[];
}

export interface SelfPlayResult {
  state: GameState;
  decisions: [PlayerId, Decision][];
  /** Decisions of an agent refused by the engine (replaced by the fallback decision). */
  illegal: number;
  turns: number;
  caps: number;
}

/** Checks the consistency of the state (one pass over the objects); returns the violations. */
export function checkInvariants(s: GameState, cardsOf: Record<PlayerId, number>): string[] {
  const errors: string[] = [];
  const seen = new Map<string, string>();
  const place = (id: string, where: string) => {
    if (seen.has(id)) errors.push(`${id} present in ${seen.get(id)} and ${where}`);
    seen.set(id, where);
    if (!s.objects[id]) errors.push(`${id} (${where}) does not exist`);
  };
  for (const id of s.field) place(id, "field");
  for (const item of s.stack) if (item.kind === "summon") place(item.sourceId, "stack");
  const zones = { deck: "deck", hand: "hand", breakZone: "break", damage: "damage", removed: "removed", lb: "lb" } as const;
  for (const p of s.playerOrder) {
    const pl = s.players[p];
    if (!pl) continue;
    for (const [key, zone] of Object.entries(zones)) for (const id of pl[key as keyof typeof zones]) place(id, `${p}.${zone}`);
  }
  const owned: Record<string, number> = {};
  for (const id in s.objects) {
    const o = s.objects[id] as GameState["objects"][string];
    const where = seen.get(id);
    if (where === undefined) errors.push(`${id} (${o.defId}) is in no zone`);
    else if (!where.endsWith(o.zone)) errors.push(`${id}: zone ${o.zone} but stored in ${where}`);
    if (o.damage < 0 || !Number.isFinite(o.damage)) errors.push(`${id}: damage ${o.damage}`);
    if (o.zone !== "field" && (o.damage || o.dull)) errors.push(`${id}: damage or dull outside the field`);
    owned[o.owner] = (owned[o.owner] ?? 0) + 1;
  }
  for (const [p, n] of Object.entries(cardsOf))
    if ((owned[p] ?? 0) !== n) errors.push(`${p} owns ${owned[p] ?? 0} cards instead of ${n}`);
  for (const p of s.playerOrder) {
    const backups = s.field.filter((id) => s.objects[id]?.controller === p && chars(s, id).type === "Backup").length;
    if (backups > 5 && !s.pending) errors.push(`${p} controls ${backups} Backups`);
  }
  // The characteristics cache is not stale (`bump` was called wherever they may change).
  const fresh = freshChars(s);
  for (const [id, c] of fresh) {
    const cached = chars(s, id);
    if (cached.power !== c.power || cached.keywords.join() !== c.keywords.join() || cached.flags.join() !== c.flags.join())
      errors.push(`${id}: stale characteristics (cache ${cached.power}, fresh ${c.power})`);
  }
  return errors;
}

/**
 * Strict play (Planecircle's `checkOffers`): every option of `legalActions`, with its suggested payment and first
 * targets, must be accepted. Returns the refused options.
 */
export function checkOffers(s: GameState, player: PlayerId): string[] {
  const out: string[] = [];
  for (const o of legalActions(s, player)) {
    try {
      submit(s, player, decisionFor(o));
    } catch (e) {
      if (!(e instanceof RulesError)) throw e;
      out.push(`${JSON.stringify(o)}: ${plainText(e.message)}`);
    }
  }
  return out;
}

export interface PlayOptions {
  seed: number;
  decks: [Deck, Deck];
  agents: [Agent, Agent];
  maxDecisions?: number;
  /** Invariants at every decision (an error stops the game with an exception). */
  check?: boolean;
  /** Chaos: before some decisions, a corrupted variant that must be refused without changing the state. */
  chaos?: boolean;
  /** Strict fuzz: every N decisions, every offered option must be accepted. */
  offers?: number;
}

export function playGame(opts: PlayOptions): SelfPlayResult {
  const ids: [PlayerId, PlayerId] = ["p1", "p2"];
  let { state } = createGame({
    seed: opts.seed,
    players: ids.map((id, i) => ({ id, name: id, deck: opts.decks[i]?.main ?? [], lb: opts.decks[i]?.lb ?? [] })),
  });
  const cardsOf = Object.fromEntries(
    ids.map((id, i) => [id, (opts.decks[i]?.main.length ?? 0) + (opts.decks[i]?.lb?.length ?? 0)]),
  );
  const rand = mulberry32(opts.seed * 31 + 7);
  const decisions: [PlayerId, Decision][] = [];
  let illegal = 0;
  let caps = 0;
  const max = opts.maxDecisions ?? 5000;
  for (let n = 0; n < max && !state.over && state.pending; n++) {
    const p = state.pending;
    const player = p.player;
    if (opts.offers && n % opts.offers === 0) {
      const refused = checkOffers(state, player);
      if (refused.length) throw new Error(`seed ${opts.seed}, decision ${n}: options refused: ${refused.join(" | ")}`);
    }
    const agent = opts.agents[ids.indexOf(player)] as Agent;
    let d: Decision;
    try {
      d = agent(state, player);
    } catch (e) {
      if (!(e instanceof RulesError)) throw e;
      d = fallbackDecision(state, p);
    }
    if (opts.chaos && rand() < 0.2) {
      const bad = corruptDecision(state, player, d, rand);
      const before = JSON.stringify(state);
      try {
        submit(state, player, bad);
      } catch (e) {
        if (!(e instanceof RulesError)) throw new Error(`seed ${opts.seed}: chaos decision ${JSON.stringify(bad)} crashed: ${e}`);
      }
      if (JSON.stringify(state) !== before) throw new Error(`seed ${opts.seed}: a refused decision changed the state`);
    }
    let r: ReturnType<typeof submit>;
    try {
      r = submit(state, player, d);
    } catch (e) {
      if (!(e instanceof RulesError)) throw e;
      illegal++;
      d = fallbackDecision(state, p);
      r = submit(state, player, d);
    }
    caps += r.events.filter((e) => e.type === "capReached").length;
    state = r.state;
    decisions.push([player, d]);
    if (opts.check) {
      const errors = checkInvariants(state, cardsOf);
      if (errors.length) throw new Error(`seed ${opts.seed}, decision ${n}: ${errors.slice(0, 5).join("; ")}`);
    }
  }
  return { state, decisions, illegal, turns: state.turn.number, caps };
}
