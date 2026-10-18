/**
 * Duel rooms (from Planecircle): one game (`GameHost`), a timer per decision, disconnections with a return delay (a
 * player who does not come back concedes), a rematch, an optional AI seat. Games are saved to disk decision by decision
 * and resumed after a server restart. The server is authoritative on everything.
 */
import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { AI_LEVELS, type AiLevel } from "@finalcircle/ai";
import {
  card,
  DECKS,
  type DeckEntries,
  type DeckList,
  FORMAT_LABELS,
  FORMATS,
  type Format,
  findCard,
  validateDeck,
} from "@finalcircle/cards";
import {
  type AsyncAgent,
  type CardDef,
  createRecordedGame,
  type Decision,
  fallbackDecision,
  type GameEvent,
  GameHost,
  type GameRecord,
  type GameState,
  type GameView,
  isGameRecord,
  meaningfulActions,
  msg,
  outcomeHash,
  type PlayerId,
  RULES_VERSION,
  replayChecked,
  visibleFaces,
} from "@finalcircle/engine";
import type { AiPool } from "./aiPool";
import type { Clock, ErrorCode, MatchInfo, RoomInfo, Seat, ServerMessage } from "./protocol";

/** Connection of a player (WebSocket in production, fake client in the tests). */
export interface Peer {
  send(msg: ServerMessage): void;
}

export interface RoomConfig {
  /** Time per decision (ms). */
  decisionMs: number;
  /** Rope shown during the end of the time (ms). */
  ropeMs: number;
  /** Timeouts before a loss. */
  maxTimeouts: number;
  /** Delay to come back after a disconnection (ms). */
  graceMs: number;
  /** Removal of an empty room, or of a finished and abandoned one (ms). */
  cleanupMs: number;
  /** Closing of a room left without an opponent (ms). */
  waitingMs: number;
  /** Maximum number of open rooms on the server. */
  maxRooms: number;
  /** Most open rooms per creator IP address (an abandoned room stays open for a few minutes). */
  maxRoomsPerIp: number;
  /**
   * Save directory of the games (one file per room: header, then one decision per line). On start-up, the games in
   * progress are resumed from it: a server restart does not cut them. Absent: games in memory only.
   */
  dataDir?: string;
  /** JavaScript heap (MB) beyond which no room is created any more (before pm2 restarts the server). */
  maxHeapMb?: number;
  /** The worker pool where the AI seats think (absent: no AI seat). */
  aiPool?: AiPool;
  /** Most open rooms with an AI seat (the server CPU is shared). */
  maxAiRooms?: number;
  /** Process memory (RSS, MB, AI workers included) beyond which no room with an AI is created. */
  maxRssMb?: number;
}

export const DEFAULT_CONFIG: RoomConfig = {
  decisionMs: 60_000,
  ropeMs: 20_000,
  maxTimeouts: 3,
  graceMs: 60_000,
  cleanupMs: 5 * 60_000,
  waitingMs: 30 * 60_000,
  maxRooms: 200,
  maxRoomsPerIp: 4,
  maxHeapMb: 384,
  maxAiRooms: 12,
  maxRssMb: 640,
};

/** Digest of a secret (reconnection token, address): only the digest is written to disk. */
export const digest = (x: string): string => createHash("sha256").update(x).digest("hex");

/**
 * Key of an address for the caps: the IPv4 address, or the /64 prefix of an IPv6 address (a subscriber often gets a
 * whole /64, and changing address must not get around the caps).
 */
export function ipKey(ip: string): string {
  const v4 = /^(?:::ffff:)?(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (v4) return v4[1] as string;
  if (!ip.includes(":")) return ip;
  const [head = "", tail = ""] = ip.toLowerCase().split("%")[0]?.split("::") ?? [];
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  const full = ip.includes("::") ? [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t] : h;
  return `${full
    .slice(0, 4)
    .map((x) => x.replace(/^0+(?=.)/, ""))
    .join(":")}::/64`;
}

/** Files set aside (`.bad`, `.rules<N>`) and interrupted tokens are kept at most this long. */
const KEEP_ASIDE_MS = 7 * 24 * 3_600_000;
/** File of the tokens interrupted by a rules update (digests, date). */
const INTERRUPTED_FILE = "interrupted.json";

/** Error meant for the client (player-facing message, written with `msg`: the client translates it). */
export class ClientError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/** Game saved by another version of the engine rules, which no longer replays identically. */
export class RulesChangedError extends Error {
  constructor(readonly rules: number) {
    super(`game recorded with rules version ${rules} (engine: ${RULES_VERSION})`);
  }
}

/** First line of a room's file: the seats (digests of the reconnection tokens) and the record of the game. */
interface SavedRoom {
  code: string;
  seats: { seat: Seat; name: string; deck: DeckEntries; ai?: AiLevel; tokenHash: string }[];
  /** Digest of the creator's address key (cap per address, also counted after a resume). */
  creator?: string;
  record: GameRecord;
  match?: MatchInfo;
}

interface SeatState {
  seat: Seat;
  name: string;
  deck: DeckEntries;
  /** Seat held by the server AI (its level): no connection, no timer. */
  ai?: AiLevel;
  /** Reconnection token: known in memory, empty after a resume until the player has come back. */
  token: string;
  tokenHash: string;
  peer: Peer | null;
  timeouts: number;
  rematch: boolean;
  /** Return deadline after a disconnection (Date.now()), or null if connected. */
  graceDeadline: number | null;
  graceTimer: ReturnType<typeof setTimeout> | null;
}

/** Levels of the AI seat, in its name: `msg("AI ({level})")`, which each client shows in its language. */
const AI_LEVEL_LABELS: Record<AiLevel, string> = {
  beginner: msg("ctx:aiSeat|beginner"),
  medium: msg("ctx:aiSeat|medium"),
  expert: msg("ctx:aiSeat|expert"),
};

/** Prebuilt decks the AI can play in a format. */
function aiDecks(format: Format): DeckList[] {
  return DECKS.filter((d) => {
    const v = validateDeck(d, findCard, format);
    return v.legal && v.playable;
  });
}

/** Codes without ambiguous characters (0/O, 1/I/L). */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const MAX_DECK_LINES = 60;

export function cleanName(raw: unknown): string {
  const name = String(raw ?? "")
    // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters removed on purpose
    .replace(/[\u0000-\u001f\u007f<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 20);
  if (!name) throw new ClientError("name", msg("Choose a nickname."));
  return name;
}

/** Received deck lines: `[count, card number]`, shape checked. */
function checkLines(raw: unknown): [number, string][] {
  if (!Array.isArray(raw) || raw.length > MAX_DECK_LINES) throw new ClientError("deck", msg("Invalid deck."));
  const out: [number, string][] = [];
  for (const line of raw) {
    if (!Array.isArray(line) || line.length !== 2) throw new ClientError("deck", msg("Invalid deck."));
    const [n, code] = line as [unknown, unknown];
    if (!Number.isInteger(n) || (n as number) < 1 || (n as number) > 50 || typeof code !== "string" || code.length > 16)
      throw new ClientError("deck", msg("Invalid deck."));
    out.push([n as number, code]);
  }
  return out;
}

/** Checks the shape and the legality of a received deck: legal in the room's format and fully playable (CR 8.1). */
export function checkDeck(raw: unknown, format: Format = "standard"): DeckEntries {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new ClientError("deck", msg("Invalid deck."));
  const r = raw as { main?: unknown; lb?: unknown };
  const deck: DeckEntries = { main: checkLines(r.main), lb: r.lb === undefined ? [] : checkLines(r.lb) };
  const v = validateDeck(deck, findCard, format);
  if (!v.legal)
    throw new ClientError(
      "deck",
      v.errors[0]
        ? msg("Deck refused: {error}.", { error: v.errors[0] })
        : msg("Deck refused: illegal in {format}.", { format: FORMAT_LABELS[format] }),
    );
  if (!v.playable) throw new ClientError("deck", msg("Deck refused: it contains cards that are not playable yet."));
  return deck;
}

/** The card definitions of a deck, in the engine's order. */
function built(d: DeckEntries): { deck: CardDef[]; lb: CardDef[] } {
  const expand = (lines: [number, string][] | undefined) =>
    (lines ?? []).flatMap(([n, code]) => Array.from({ length: n }, () => card(code)));
  return { deck: expand(d.main), lb: expand(d.lb) };
}

export class Room {
  readonly seats: SeatState[] = [];
  status: RoomInfo["status"] = "waiting";
  match: MatchInfo = { wins: { p1: 0, p2: 0 }, game: 0, winner: null };
  /** Player who starts the next game (the loser of the previous one); null: random draw. */
  private nextStarter: Seat | null = null;
  private host: GameHost | null = null;
  /** Updates produced by the last action, sent with the updated timer: per player and in order (one per resolution). */
  private outbox = new Map<Seat, { view: GameView; events: GameEvent[] }[]>();
  private clock: { player: Seat; deadline: number; timer: ReturnType<typeof setTimeout> } | null = null;
  private cleanupTimer: ReturnType<typeof setTimeout> | null = null;
  /** Action queue: only one at a time changes the game. */
  private queue: Promise<void> = Promise.resolve();
  private waitingTimer: ReturnType<typeof setTimeout> | null = null;
  /** Digest of the creator's address key (cap per address). */
  creator: string | undefined;

  constructor(
    readonly code: string,
    private readonly config: RoomConfig,
    private readonly onClose: (room: Room) => void,
  ) {
    // Nobody joins: the room is closed and its creator told.
    this.waitingTimer = setTimeout(() => {
      if (this.status !== "waiting") return;
      for (const s of this.seats)
        s.peer?.send({ type: "error", code: "closed", message: msg("Room closed: no opponent joined it in time.") });
      this.close();
    }, config.waitingMs);
    this.waitingTimer.unref?.();
  }

  seatOf(token: string): SeatState | undefined {
    const h = digest(token);
    const seat = this.seats.find((s) => s.tokenHash === h);
    // After a resume, the token is known only by its digest: the one presented is the right one.
    if (seat) seat.token = token;
    return seat;
  }

  addPlayer(name: string, deck: DeckEntries, peer: Peer | null, ai?: AiLevel): SeatState {
    if (this.seats.length >= 2) throw new ClientError("full", msg("This room is full."));
    // First free seat (a player who left before the start frees theirs).
    const free: Seat = this.seats.some((s) => s.seat === "p1") ? "p2" : "p1";
    const token = randomUUID();
    const seat: SeatState = {
      seat: free,
      name,
      deck,
      ...(ai ? { ai } : {}),
      token,
      tokenHash: digest(token),
      peer,
      timeouts: 0,
      rematch: false,
      graceDeadline: null,
      graceTimer: null,
    };
    this.seats.push(seat);
    this.seats.sort((a, b) => (a.seat < b.seat ? -1 : 1));
    this.cancelCleanup();
    this.broadcastRoom();
    if (this.seats.length === 2) void this.enqueue(() => this.start());
    return seat;
  }

  // -------------------------------------------------------------------------
  // Game
  // -------------------------------------------------------------------------

  private async start(): Promise<void> {
    if (this.waitingTimer) clearTimeout(this.waitingTimer);
    this.waitingTimer = null;
    for (const s of this.seats) {
      s.timeouts = 0;
      s.rematch = false;
    }
    this.match = { ...this.match, game: this.match.game + 1, winner: null };
    // First game: a random player chooses who starts (CR 8.2.1.2); then the loser of the previous game starts.
    const { state, events, record } = createRecordedGame({
      seed: randomInt(0, 2 ** 31),
      ...(this.nextStarter ? { startingPlayer: this.nextStarter } : {}),
      players: this.seats.map((s) => ({ id: s.seat, name: s.name, ...built(s.deck) })),
    });
    this.status = "playing";
    this.saveHeader(record);
    const host = this.newHost(state, record, events);
    this.host = host;
    this.broadcastRoom();
    await this.advancing(host, () => host.run());
  }

  /**
   * Runs an action on the game, then timer and sends if the state changed, even if the action failed midway
   * (internal error): a game must never be left without a timer. A refused decision does not change the state and so
   * does not restart the timer.
   */
  async advancing(host: GameHost, fn: () => Promise<void>): Promise<void> {
    const before = host.state;
    try {
      await fn();
    } catch (e) {
      console.error(`Room ${this.code}: internal error`, e);
      throw e;
    } finally {
      if (host.state !== before || this.outbox.size) this.afterStep();
    }
  }

  get hasAi(): boolean {
    return this.seats.some((s) => s.ai);
  }

  /**
   * The AI of a seat: its decision is computed in the worker pool (the main thread serves the other rooms). A priority
   * where there is nothing to do but pass is settled here, without a worker.
   */
  private aiAgentFor(seat: Seat, level: AiLevel): AsyncAgent {
    return (state, player) => {
      const p = state.pending;
      if (p?.kind === "priority" && meaningfulActions(state, player).length === 0) return { type: "pass" };
      const pool = this.config.aiPool;
      if (!pool || !p) return fallbackDecision(state, p ?? { kind: "priority", player });
      const n = this.host?.record?.decisions.length ?? 0;
      const seed = (Number(this.host?.record?.seed ?? 0) ^ (n * 2654435761) ^ seat.charCodeAt(1)) >>> 0;
      return pool.decide({
        room: this.code,
        seat,
        level,
        seed,
        // Expert level (ISMCTS): one and a half seconds at most.
        ...(level === "expert" ? { budget: { ms: 1500 } } : {}),
        state,
      });
    };
  }

  private agents(): Partial<Record<Seat, AsyncAgent>> {
    const out: Partial<Record<Seat, AsyncAgent>> = {};
    for (const s of this.seats) if (s.ai) out[s.seat] = this.aiAgentFor(s.seat, s.ai);
    return out;
  }

  /** Host of a recorded game: each decision is appended to the room's file. */
  private newHost(state: GameState, record: GameRecord, events: GameEvent[]): GameHost {
    return new GameHost(
      state,
      {
        agents: this.agents(),
        // One update per resolution: the interface shows each effect one after the other.
        frames: true,
        onUpdate: (p, view, evts) => this.buffer(p as Seat, view, evts),
        record,
        onRecord: (p, d, after) => this.appendDecision(p, d, after),
      },
      events,
    );
  }

  // -------------------------------------------------------------------------
  // Save to disk
  // -------------------------------------------------------------------------

  private get file(): string | null {
    return this.config.dataDir ? join(this.config.dataDir, `${this.code}.jsonl`) : null;
  }

  private saveHeader(record: GameRecord): void {
    const file = this.file;
    if (!file || !this.config.dataDir) return;
    try {
      mkdirSync(this.config.dataDir, { recursive: true, mode: 0o700 });
      const saved: SavedRoom = {
        code: this.code,
        seats: this.seats.map((s) => ({
          seat: s.seat,
          name: s.name,
          deck: s.deck,
          ...(s.ai ? { ai: s.ai } : {}),
          tokenHash: s.tokenHash,
        })),
        ...(this.creator ? { creator: this.creator } : {}),
        record: { ...record, decisions: [], checkpoints: [] },
        match: this.match,
      };
      // Readable by the server account only: the save reveals the decks.
      writeFileSync(file, `${JSON.stringify(saved)}\n`, { mode: 0o600 });
    } catch (e) {
      console.error(`Room ${this.code}: save failed`, e);
    }
  }

  /** One line per decision: [player, decision, digest of the resulting state] (checked on resume). */
  private appendDecision(player: PlayerId, d: Decision, after: GameState): void {
    const file = this.file;
    if (!file) return;
    try {
      appendFileSync(file, `${JSON.stringify([player, d, outcomeHash(after)])}\n`);
    } catch (e) {
      console.error(`Room ${this.code}: save failed`, e);
    }
  }

  /**
   * Resume of a saved room (server restart): the game is replayed from its record, the players are considered
   * disconnected (ordinary return delay) and come back with their token.
   */
  static restore(
    saved: SavedRoom,
    decisions: [PlayerId, Decision][],
    checkpoints: [number, string][],
    config: RoomConfig,
    onClose: (room: Room) => void,
  ): Room {
    const record: GameRecord = { ...saved.record, decisions, checkpoints };
    const { state, divergence } = replayChecked(record, card);
    const rules = saved.record.rules ?? 0;
    if (rules !== RULES_VERSION) {
      // Another rules version: the game resumes only if each decision has its digest, and they match.
      if (divergence || checkpoints.length < decisions.length) throw new RulesChangedError(rules);
    } else if (divergence) {
      throw new Error(`replay differs from the game played (${divergence.message}): non-deterministic engine?`);
    }
    const room = new Room(saved.code, config, onClose);
    room.creator = saved.creator;
    for (const s of saved.seats) {
      room.seats.push({
        seat: s.seat,
        name: s.name,
        deck: s.deck,
        ...(s.ai ? { ai: s.ai } : {}),
        token: "",
        tokenHash: s.tokenHash,
        peer: null,
        timeouts: 0,
        rematch: false,
        graceDeadline: null,
        graceTimer: null,
      });
    }
    if (saved.match) room.match = saved.match;
    room.host = room.newHost(state, record, []);
    // Game finished before the shutdown: its win is counted by `afterStep` (change from "playing" to "over").
    room.status = "playing";
    if (room.waitingTimer) clearTimeout(room.waitingTimer);
    room.waitingTimer = null;
    for (const seat of room.seats) if (!seat.ai) room.disconnect(seat);
    room.afterStep();
    // The AI had to decide at the time of the shutdown: it resumes.
    const pending = room.host.state.pending;
    if (pending && !room.host.state.over && room.seats.find((x) => x.seat === pending.player)?.ai)
      void room.enqueue(() => room.advancing(room.host as GameHost, () => (room.host as GameHost).run()));
    return room;
  }

  private buffer(p: Seat, view: GameView, events: GameEvent[]): void {
    this.outbox.set(p, [...(this.outbox.get(p) ?? []), { view, events }]);
  }

  /** After each action: timer, sending of the views, end of the game. */
  private afterStep(): void {
    const host = this.host;
    if (!host) return;
    const s = host.state;
    if (s.over) {
      this.stopClock();
      if (this.status === "playing") {
        this.finishGame(s.winner === "draw" ? null : (s.winner as Seat | null));
        this.broadcastRoom();
      }
      this.scheduleCleanupIfIdle();
    } else if (s.pending) {
      // Each new decision gets its full time (as on MTGA); a refused decision restarts nothing. The AI has no timer.
      const who = s.pending.player as Seat;
      if (this.seats.find((x) => x.seat === who)?.ai) this.stopClock();
      else this.armClock(who);
    }
    for (const [p, frames] of this.outbox)
      for (const u of frames)
        this.sendTo(p, { type: "update", ...u, faces: visibleFaces(s, u.view, u.events), clock: this.clockInfo() });
    this.outbox.clear();
  }

  /** End of a game: its win counted; the loser will start the next one (rematch). */
  private finishGame(winner: Seat | null): void {
    const wins = { ...this.match.wins };
    if (winner) wins[winner] = (wins[winner] ?? 0) + 1;
    this.match = { ...this.match, wins, winner };
    this.nextStarter = winner ? (winner === "p1" ? "p2" : "p1") : null;
    this.status = "over";
  }

  private clockInfo(): Clock | null {
    if (!this.clock) return null;
    return {
      player: this.clock.player,
      remainingMs: Math.max(0, this.clock.deadline - Date.now()),
      totalMs: this.config.decisionMs,
      ropeMs: this.config.ropeMs,
      timeouts: Object.fromEntries(this.seats.map((s) => [s.seat, s.timeouts])) as Partial<Record<Seat, number>>,
      maxTimeouts: this.config.maxTimeouts,
    };
  }

  private armClock(player: Seat): void {
    this.stopClock();
    const timer = setTimeout(() => this.enqueue(() => this.expire(player)), this.config.decisionMs);
    timer.unref?.();
    this.clock = { player, deadline: Date.now() + this.config.decisionMs, timer };
  }

  private stopClock(): void {
    if (this.clock) clearTimeout(this.clock.timer);
    this.clock = null;
  }

  /** Time is up: default decision; loss beyond the number of timeouts allowed. */
  private async expire(player: Seat): Promise<void> {
    const host = this.host;
    const seat = this.seats.find((s) => s.seat === player);
    const p = host?.state.pending;
    if (!host || !seat || host.state.over || !p || p.player !== player) return;
    seat.timeouts += 1;
    await this.advancing(host, async () => {
      // A default decision that fails (engine error) must not leave the game stuck.
      let played = false;
      if (seat.timeouts < this.config.maxTimeouts) {
        try {
          played = (await host.submitHuman(player, fallbackDecision(host.state, p))) === null;
        } catch (e) {
          console.error(`Room ${this.code}: default decision failed`, e);
        }
      }
      if (!played && !host.state.over && host.state.pending === p) await host.submitHuman(player, { type: "concede" });
    });
  }

  /** Record of the game, only if it is over (it reveals the decks and the seed). */
  exportRecord(): GameRecord | null {
    const host = this.host;
    return host?.state.over && host.record ? structuredClone(host.record) : null;
  }

  decide(seat: SeatState, d: Decision): Promise<void> {
    return this.enqueue(async () => {
      const host = this.host;
      if (!host || this.status !== "playing") throw new ClientError("state", msg("No game in progress."));
      await this.advancing(host, async () => {
        const error = await host.submitHuman(seat.seat, d);
        // Refused decision: the state did not change, the timer goes on.
        if (error) seat.peer?.send({ type: "error", code: "rules", message: error });
      });
    });
  }

  settings(seat: SeatState, settings: Parameters<GameHost["setSettings"]>[1]): Promise<void> {
    return this.enqueue(async () => {
      const host = this.host;
      if (!host) return;
      host.setSettings(seat.seat, settings);
      if (this.status !== "playing") return;
      await this.advancing(host, () => host.run());
    });
  }

  rematch(seat: SeatState): Promise<void> {
    return this.enqueue(async () => {
      if (this.status !== "over") throw new ClientError("state", msg("The game is not over."));
      seat.rematch = true;
      this.broadcastRoom();
      // The AI seat always accepts the rematch.
      if (this.seats.length === 2 && this.seats.every((s) => s.ai || (s.rematch && s.peer))) await this.start();
    });
  }

  // -------------------------------------------------------------------------
  // Connections
  // -------------------------------------------------------------------------

  /** Reconnection: full view and updated timer. */
  reconnect(seat: SeatState, peer: Peer): void {
    seat.peer = peer;
    seat.graceDeadline = null;
    if (seat.graceTimer) clearTimeout(seat.graceTimer);
    seat.graceTimer = null;
    this.cancelCleanup();
    this.sendRoom(seat);
    if (this.host) {
      const view = this.host.view(seat.seat);
      peer.send({ type: "update", view, events: [], faces: visibleFaces(this.host.state, view, []), clock: this.clockInfo() });
    }
    this.sendOpponentStatus();
  }

  /** Connection lost: the other player is told; without a return in time, loss (or room removed). */
  disconnect(seat: SeatState): void {
    seat.peer = null;
    if (this.status === "playing") {
      seat.graceDeadline = Date.now() + this.config.graceMs;
      seat.graceTimer = setTimeout(() => this.enqueue(() => this.abandon(seat)), this.config.graceMs);
      seat.graceTimer.unref?.();
    }
    this.broadcastRoom();
    this.sendOpponentStatus();
    this.scheduleCleanupIfIdle();
  }

  /** Voluntary leave: concession if the game is in progress. */
  leave(seat: SeatState): Promise<void> {
    return this.enqueue(async () => {
      if (this.status === "waiting") {
        this.seats.splice(this.seats.indexOf(seat), 1);
        // No human left (only the AI seat remains): the room closes.
        if (!this.seats.some((s) => !s.ai)) this.close();
        else this.broadcastRoom();
        return;
      }
      seat.peer = null;
      await this.abandon(seat);
      this.broadcastRoom();
      this.scheduleCleanupIfIdle();
    });
  }

  private async abandon(seat: SeatState): Promise<void> {
    if (seat.graceTimer) clearTimeout(seat.graceTimer);
    seat.graceTimer = null;
    seat.graceDeadline = null;
    const host = this.host;
    if (!host || this.status !== "playing" || host.state.over) return;
    await this.advancing(host, async () => {
      await host.submitHuman(seat.seat, { type: "concede" });
    });
    // Against the AI, with the human gone: the room closes (the server CPU is shared).
    if (this.hasAi && !this.seats.some((s) => !s.ai && s.peer)) this.close();
  }

  /** The opponent's connection state. */
  private sendOpponentStatus(): void {
    for (const s of this.seats) {
      const other = this.seats.find((o) => o !== s);
      if (!other) continue;
      s.peer?.send({
        type: "opponent",
        connected: !!other.peer || !!other.ai,
        remainingMs: other.graceDeadline ? Math.max(0, other.graceDeadline - Date.now()) : null,
      });
    }
  }

  private scheduleCleanupIfIdle(): void {
    const idle = this.seats.every((s) => !s.peer) && this.status !== "playing";
    if (!idle || this.cleanupTimer) return;
    this.cleanupTimer = setTimeout(() => this.close(), this.config.cleanupMs);
    this.cleanupTimer.unref?.();
  }

  private cancelCleanup(): void {
    if (this.cleanupTimer) clearTimeout(this.cleanupTimer);
    this.cleanupTimer = null;
  }

  /** Final closing of the room: its save file is removed. */
  close(): void {
    this.shutdown();
    this.config.aiPool?.forget(this.code);
    const file = this.file;
    if (file) rmSync(file, { force: true });
    this.onClose(this);
  }

  /** Server shutdown: the timers stop, the save stays (the game will be resumed on restart). */
  shutdown(): void {
    this.stopClock();
    this.cancelCleanup();
    if (this.waitingTimer) clearTimeout(this.waitingTimer);
    for (const s of this.seats) if (s.graceTimer) clearTimeout(s.graceTimer);
  }

  // -------------------------------------------------------------------------
  // Sending
  // -------------------------------------------------------------------------

  private sendTo(p: Seat, message: ServerMessage): void {
    this.seats.find((s) => s.seat === p)?.peer?.send(message);
  }

  private sendRoom(seat: SeatState): void {
    seat.peer?.send({
      type: "room",
      room: {
        code: this.code,
        seat: seat.seat,
        token: seat.token,
        status: this.status,
        players: this.seats.map((s) => ({
          seat: s.seat,
          name: s.name,
          connected: !!s.peer || !!s.ai,
          rematch: s.rematch || !!s.ai,
          ...(s.ai ? { ai: s.ai } : {}),
        })),
        match: this.match,
        deck: seat.deck,
      },
    });
  }

  private broadcastRoom(): void {
    for (const s of this.seats) this.sendRoom(s);
  }

  /**
   * Runs the actions one by one: a decision, a timeout and a disconnection never overlap on the same game. Client
   * errors go up to the caller.
   */
  enqueue(fn: () => Promise<void>): Promise<void> {
    const run = this.queue.then(fn);
    this.queue = run.catch(() => {});
    return run;
  }
}

export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  /** Digests of the tokens of the players whose game was interrupted by a rules update, with their date. */
  private readonly interrupted = new Map<string, number>();

  constructor(private readonly config: RoomConfig = DEFAULT_CONFIG) {
    if (config.dataDir) this.restore(config.dataDir);
  }

  /** Rooms opened by this address (digest of its key), resumed ones included. */
  private openedBy(creator: string): number {
    let n = 0;
    for (const r of this.rooms.values()) if (r.creator === creator) n++;
    return n;
  }

  private saveInterrupted(dir: string): void {
    try {
      writeFileSync(join(dir, INTERRUPTED_FILE), JSON.stringify(Object.fromEntries(this.interrupted)), { mode: 0o600 });
    } catch (e) {
      console.error("Interrupted tokens: save failed", e);
    }
  }

  /**
   * Resumes the saved games; an unreadable file is set aside (`.bad`) without blocking the start-up. Files set aside
   * and interrupted tokens older than seven days are removed. At most `maxRooms` rooms, the most recent ones.
   */
  private restore(dir: string): void {
    if (!existsSync(dir)) return;
    const now = Date.now();
    try {
      const raw = JSON.parse(readFileSync(join(dir, INTERRUPTED_FILE), "utf8")) as Record<string, number>;
      for (const [h, at] of Object.entries(raw))
        if (typeof at === "number" && now - at < KEEP_ASIDE_MS) this.interrupted.set(h, at);
    } catch {
      // No file yet (or unreadable): no known interrupted token.
    }
    for (const name of readdirSync(dir).filter((f) => /\.jsonl\.(?:bad|rules\d+)$/.test(f))) {
      const file = join(dir, name);
      if (now - statSync(file).mtimeMs > KEEP_ASIDE_MS) rmSync(file, { force: true });
    }
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".jsonl"))
      .map((name) => ({ name, mtime: statSync(join(dir, name)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    for (const { name } of files.slice(this.config.maxRooms)) {
      console.warn(`Save ${name} not resumed (cap of ${this.config.maxRooms} rooms), set aside`);
      renameSync(join(dir, name), join(dir, `${name}.bad`));
    }
    for (const { name } of files.slice(0, this.config.maxRooms)) {
      const file = join(dir, name);
      let saved: SavedRoom | null = null;
      try {
        const [head, ...lines] = readFileSync(file, "utf8").split("\n").filter(Boolean);
        saved = JSON.parse(head ?? "null") as SavedRoom;
        const rows = lines.map((l) => JSON.parse(l) as [PlayerId, Decision, string?]);
        const decisions = rows.map(([p, d]): [PlayerId, Decision] => [p, d]);
        const checkpoints = rows.flatMap(([, , h], i): [number, string][] => (typeof h === "string" ? [[i + 1, h]] : []));
        if (!saved?.code || !Array.isArray(saved.seats) || !isGameRecord({ ...saved.record, decisions }))
          throw new Error("unknown format");
        const room = Room.restore(saved, decisions, checkpoints, this.config, (r) => this.rooms.delete(r.code));
        this.rooms.set(room.code, room);
        console.log(`Room ${room.code} resumed (${decisions.length} decisions)`);
      } catch (e) {
        if (e instanceof RulesChangedError && saved) {
          // Engine update: the game is interrupted; its players learn it when they come back.
          for (const s of saved.seats) this.interrupted.set(s.tokenHash, now);
          console.warn(`Room ${saved.code} interrupted by the rules update: ${e.message}`);
          renameSync(file, `${file}.rules${e.rules}`);
        } else {
          console.error(`Save ${name} unreadable, set aside:`, e);
          renameSync(file, `${file}.bad`);
        }
      }
    }
    this.saveInterrupted(dir);
  }

  /** Was the game of this token interrupted by an update of the engine rules? */
  wasInterrupted(token: unknown): boolean {
    return typeof token === "string" && this.interrupted.has(digest(token));
  }

  get size(): number {
    return this.rooms.size;
  }

  private newCode(): string {
    for (;;) {
      const bytes = randomBytes(6);
      const code = [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
      if (!this.rooms.has(code)) return code;
    }
  }

  create(
    name: unknown,
    deck: unknown,
    peer: Peer,
    opts: { format?: unknown; ai?: unknown; ip?: string } = {},
  ): { room: Room; seat: SeatState } {
    const n = cleanName(name);
    const format: Format = (FORMATS as unknown[]).includes(opts.format) ? (opts.format as Format) : "standard";
    const d = checkDeck(deck, format);
    if (this.rooms.size >= this.config.maxRooms) throw new ClientError("busy", msg("Server full, try again later."));
    // Memory: refuse a room rather than let pm2 restart the server (and cut all the games).
    const heapMb = process.memoryUsage().heapUsed / 1_048_576;
    if (this.config.maxHeapMb && heapMb > this.config.maxHeapMb)
      throw new ClientError("busy", msg("Server full, try again later."));
    // Creating then abandoning rooms in a loop must not take all the places of the server.
    const creator = opts.ip ? digest(ipKey(opts.ip)) : undefined;
    if (creator && this.openedBy(creator) >= this.config.maxRoomsPerIp)
      throw new ClientError("busy", msg("Too many rooms open from this address: close one before creating another."));
    const ai = this.checkAi(opts.ai, format);
    const room = new Room(this.newCode(), this.config, (r) => this.rooms.delete(r.code));
    room.creator = creator;
    if (format !== "standard") room.match = { ...room.match, format };
    this.rooms.set(room.code, room);
    const seat = room.addPlayer(n, d, peer);
    // The AI seat: filled at once, with a prebuilt deck of the format drawn at random.
    if (ai) {
      const decks = aiDecks(format);
      const deckList = decks[randomInt(0, decks.length)] as DeckList;
      room.addPlayer(msg("AI ({level})", { level: AI_LEVEL_LABELS[ai] }), { main: deckList.main, lb: deckList.lb }, null, ai);
    }
    return { room, seat };
  }

  /** The AI seat asked for on creation: a known level, an AI pool, room for a room with AI, memory, a deck. */
  private checkAi(raw: unknown, format: Format): AiLevel | null {
    const r = raw as { level?: unknown } | null | undefined;
    if (!r || typeof r !== "object") return null;
    if (!this.config.aiPool) throw new ClientError("busy", msg("The AI is not available on this server."));
    const level: AiLevel = (AI_LEVELS as readonly unknown[]).includes(r.level) ? (r.level as AiLevel) : "medium";
    let aiRooms = 0;
    for (const room of this.rooms.values()) if (room.hasAi) aiRooms++;
    const rssMb = process.memoryUsage().rss / 1_048_576;
    if (aiRooms >= (this.config.maxAiRooms ?? 12) || (this.config.maxRssMb && rssMb > this.config.maxRssMb))
      throw new ClientError("busy", msg("Too many games against the AI in progress on the server, try again later."));
    if (aiDecks(format).length === 0) throw new ClientError("deck", msg("No deck the AI can play in this format."));
    return level;
  }

  join(code: unknown, name: unknown, deck: unknown, peer: Peer): { room: Room; seat: SeatState } {
    const room = this.rooms.get(
      String(code ?? "")
        .toUpperCase()
        .trim(),
    );
    if (!room) throw new ClientError("room", msg("Room not found: check the code."));
    if (room.status !== "waiting" || room.seats.length >= 2) throw new ClientError("full", msg("This room is full."));
    // The deck must be legal in the format chosen by the room's creator.
    const d = checkDeck(deck, room.match.format ?? "standard");
    return { room, seat: room.addPlayer(cleanName(name), d, peer) };
  }

  byToken(token: unknown): { room: Room; seat: SeatState } | null {
    if (typeof token !== "string") return null;
    for (const room of this.rooms.values()) {
      const seat = room.seatOf(token);
      if (seat) return { room, seat };
    }
    return null;
  }

  /** Server shutdown: the rooms stop without erasing their save. */
  closeAll(): void {
    for (const room of [...this.rooms.values()]) room.shutdown();
    this.rooms.clear();
  }
}
