/**
 * GameHost (from Planecircle): runs a game by consulting, for each pending decision, the player's AI, then the
 * autopilot, then the human. The same host runs in a Web Worker (game against the AI) or in a Node server (online game).
 */

import { type AutopilotSettings, autopilotDecision, DEFAULT_AUTOPILOT } from "./autopilot";
import { RulesError } from "./errors";
import { drawByLoop, submit } from "./game";
import { MAX_AUTOMATIC_DECISIONS } from "./limits";
import { type GameRecord, recordDecision } from "./record";
import { msg } from "./text";
import type { Decision, GameEvent, GameState, PendingDecision, PlayerId } from "./types";
import { filterEvents, type GameView, projectView } from "./view";

/** An AI: receives the full state and returns a decision (it must read only public information). */
export type Agent = (state: GameState, player: PlayerId) => Decision;
/**
 * An AI that thinks elsewhere (server: in a worker, PLAN-E E14): its decision arrives later; the host waits for it
 * before continuing.
 */
export type AsyncAgent = (state: GameState, player: PlayerId) => Decision | Promise<Decision>;

export interface HostOptions {
  agents?: Partial<Record<PlayerId, Agent | AsyncAgent>>;
  /** Called for each human player when their view changes. */
  onUpdate?: (player: PlayerId, view: GameView, events: GameEvent[]) => void;
  /** Pause between two visible actions of the AI (ms), so that the human can follow. */
  aiDelay?: number;
  sleep?: (ms: number) => Promise<void>;
  /**
   * Consulted before each decision of an AI: a promise makes it wait (the tutorial pauses the opponent
   * during an explanation), null lets it play.
   */
  gate?: () => Promise<void> | null;
  /** Record of the game (`createRecordedGame`): each applied decision is added to it. */
  record?: GameRecord;
  /** Gap between two checkpoints of the record (`CHECKPOINT_EVERY` by default). */
  checkpointEvery?: number;
  /** Called after each recorded decision (server: writing to disk). */
  onRecord?: (player: PlayerId, d: Decision, after: GameState) => void;
  /**
   * One update per stack step (item added, then resolved, countered or without a legal target), instead of a single one
   * at the end of a series of automatic decisions: the interface shows each effect one after the other.
   */
  frames?: boolean;
}

/**
 * Events that end a visible step of the game: an item arrives on the stack (the interface shows it before it resolves)
 * or leaves it (resolved, countered, without a legal target).
 */
const FRAME_EVENTS = new Set<GameEvent["type"]>([
  "cast",
  "activate",
  "trigger",
  "resolve",
  "fizzle",
  "exBurst",
  "attack",
  "block",
]);

/** Fallback decision if an AI returns an illegal decision. */
export function fallbackDecision(s: GameState, p: PendingDecision): Decision {
  const hand = s.players[p.player]?.hand ?? [];
  switch (p.kind) {
    case "mulligan":
      return { type: "keep" };
    case "discard":
      return { type: "discard", cards: hand.slice(0, p.count) };
    case "declareAttack":
      return { type: "endAttacks" };
    case "declareBlock":
      return { type: "block", blocker: null };
    case "priority":
      return { type: "pass" };
    case "choice":
      return { type: "choose", values: p.request.suggested };
  }
}

export class GameHost {
  state: GameState;
  readonly settings: Record<PlayerId, AutopilotSettings> = {};
  private readonly opts: HostOptions;
  private pendingEvents: GameEvent[] = [];
  private running = false;
  /** Time when the last visible action of the AI was shown (Date.now()). */
  private shownAt = 0;

  constructor(state: GameState, opts: HostOptions = {}, initialEvents: GameEvent[] = []) {
    this.state = state;
    this.opts = opts;
    this.pendingEvents = [...initialEvents];
    for (const p of state.playerOrder) this.settings[p] = structuredClone(DEFAULT_AUTOPILOT);
  }

  isHuman(p: PlayerId): boolean {
    return !this.opts.agents?.[p];
  }

  view(p: PlayerId): GameView {
    return projectView(this.state, p);
  }

  setSettings(p: PlayerId, settings: Partial<AutopilotSettings>): void {
    this.settings[p] = { ...(this.settings[p] ?? DEFAULT_AUTOPILOT), ...settings };
  }

  private apply(player: PlayerId, d: Decision): void {
    const { state, events } = submit(this.state, player, d);
    this.state = state;
    this.pendingEvents.push(...events);
    // "Frames" mode: a resolution is sent right away, before the following automatic decisions.
    if (this.opts.frames && events.some((e) => FRAME_EVENTS.has(e.type))) this.flush(true);
    // Only accepted decisions are recorded: the replay gives back exactly this state.
    if (this.opts.record) recordDecision(this.opts.record, player, d, state, this.opts.checkpointEvery);
    this.opts.onRecord?.(player, d, state);
  }

  /** Record of the game (null if it is not recorded: tutorial, sandbox). */
  get record(): GameRecord | null {
    return this.opts.record ?? null;
  }

  /**
   * Sends the view and the accumulated events to each human. `interim`: intermediate step (a resolution in the middle
   * of automatic decisions); its pending decision is removed, since the autopilot may already have taken it.
   */
  private flush(interim = false): void {
    const events = this.pendingEvents;
    this.pendingEvents = [];
    for (const p of this.state.playerOrder) {
      if (!this.isHuman(p)) continue;
      const view = this.view(p);
      this.opts.onUpdate?.(p, interim ? { ...view, pending: null } : view, filterEvents(events, p));
    }
  }

  /** The pending decision is a human's that the autopilot will take itself. */
  private autopilotNext(): boolean {
    const p = this.state.pending;
    if (!p || this.state.over) return false;
    if (this.opts.agents?.[p.player]) return false;
    return !!autopilotDecision(this.state, p.player, this.settings[p.player] ?? DEFAULT_AUTOPILOT);
  }

  /** Decision of a human. Returns an error message if it is illegal. */
  async submitHuman(player: PlayerId, d: Decision): Promise<string | null> {
    if (d.type !== "concede" && this.state.pending && this.state.pending.player !== player)
      return msg("It is not your decision to make");
    try {
      this.apply(player, d);
    } catch (e) {
      if (e instanceof RulesError) return e.message;
      throw e;
    }
    await this.run();
    return null;
  }

  /**
   * Gives the human time to see the last visible action of the AI: we wait for the rest of the `aiDelay` pause.
   * The AI's thinking about the next action happens during this pause (it does not lengthen the wait).
   */
  private settle(): Promise<void> | null {
    const { aiDelay, sleep } = this.opts;
    if (!aiDelay || !sleep) return null;
    const rest = this.shownAt + aiDelay - Date.now();
    // Nothing to wait for: no `await` (it would yield to the event loop for no reason).
    return rest > 0 ? sleep(rest) : null;
  }

  /** Chains the automatic decisions (AI, autopilot) until a human must choose. */
  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      // Counted per turn: a game between AIs (human eliminated) can legitimately last, a loop stays within the turn.
      let turn = this.state.turn.number;
      for (let guard = 1; ; guard++) {
        const p = this.state.pending;
        if (this.state.turn.number !== turn) {
          turn = this.state.turn.number;
          guard = 1;
        }
        if (guard > MAX_AUTOMATIC_DECISIONS && !this.state.over) {
          // Loop of automatic decisions within one turn: draw (CR 13.1), reported in the console.
          const t = this.state.turn;
          console.warn(
            `GameHost: more than ${MAX_AUTOMATIC_DECISIONS} automatic decisions in a row (turn ${t.number}, phase ${t.phase}, ` +
              `decision ${p?.kind ?? "none"} of ${p?.player ?? "?"}): draw`,
          );
          const { state, events } = drawByLoop(this.state);
          this.state = state;
          this.pendingEvents.push(...events);
          continue;
        }
        const agent = p && !this.state.over ? this.opts.agents?.[p.player] : undefined;
        const auto =
          p && !this.state.over && !agent
            ? autopilotDecision(this.state, p.player, this.settings[p.player] ?? DEFAULT_AUTOPILOT)
            : null;
        if (!p || this.state.over || (!agent && !auto)) {
          // The human's turn to decide (or end of game): the last visible action of the AI stays displayed for its
          // pause. A decision of the human may have arrived during the wait: we then start again from the current state.
          const pause = this.settle();
          if (!pause) break;
          await pause;
          continue;
        }
        const actor = p.player;
        if (agent) {
          const wait = this.opts.gate?.();
          if (wait) {
            // The human sees the game as it is during the wait.
            await this.settle();
            this.flush();
            await wait;
            // The game may have changed during the wait (decision of the human): start again from the current state.
            if (this.state.pending !== p) continue;
          }
          let d: Decision;
          try {
            const out = agent(this.state, p.player);
            if (out instanceof Promise) {
              d = await out;
              // The game may have changed during the thinking (a player conceding): start again from the current state.
              if (this.state.pending !== p) continue;
            } else d = out;
            this.apply(actor, d);
          } catch (e) {
            console.warn("Illegal AI decision, fallback:", e);
            d = fallbackDecision(this.state, p);
            this.apply(actor, d);
          }
          // Visible action: shown once the pause of the previous one has elapsed; the next one is prepared during its own.
          if (d.type !== "pass" && d.type !== "keep" && this.opts.aiDelay && this.opts.sleep) {
            const pause = this.settle();
            if (pause) await pause;
            // If the autopilot is going to decide next for a human, this decision is not shown (it would be stale).
            this.flush(this.autopilotNext());
            this.shownAt = Date.now();
          }
          continue;
        }
        if (auto) this.apply(actor, auto);
      }
    } finally {
      this.running = false;
    }
    this.flush();
  }
}
