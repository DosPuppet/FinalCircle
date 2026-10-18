/**
 * Online play protocol (WebSocket, JSON; from Planecircle). Shared types: the client imports them with `import type`.
 * The server is authoritative: it validates the decks and every decision (engine `RulesError`).
 */
import type { AiLevel } from "@finalcircle/ai";
import type { DeckEntries, Format } from "@finalcircle/cards";
import type { AutopilotSettings, CardFace, Decision, GameEvent, GameRecord, GameView } from "@finalcircle/engine";

/**
 * Protocol version: sent by the client, with `RULES_VERSION`, when it creates, joins or resumes a room. A client of
 * another version (tab left open, stale service worker) is refused and asked to reload the page. Bump it on every
 * incompatible change of the messages.
 */
export const PROTOCOL_VERSION = 1;

/** Client versions (protocol and engine rules). */
export interface ClientVersion {
  protocol: number;
  rules: number;
}

/** The two seats of a duel: the player ids in the engine. */
export type Seat = "p1" | "p2";

/** Timer of the current decision (relative durations: no dependency on the client's clock). */
export interface Clock {
  /** Player who must decide. */
  player: Seat;
  /** Time left when the message is received (ms). */
  remainingMs: number;
  /** Total duration of a decision (ms). */
  totalMs: number;
  /** Duration during which the rope is shown (ms, end of the time). */
  ropeMs: number;
  /** Timeouts already suffered per player (loss at `maxTimeouts`). */
  timeouts: Partial<Record<Seat, number>>;
  maxTimeouts: number;
}

/** One game per match (no best-of-three), a rematch on both players' request. */
export interface MatchInfo {
  /** Deck format of the room, chosen when it is created (absent: Standard). */
  format?: Format;
  /** Games won per seat since the room opened. */
  wins: Partial<Record<Seat, number>>;
  /** Number of the current game (or of the last one played). */
  game: number;
  /** Winner of the last game (null until it is decided, or a draw). */
  winner: Seat | null;
}

export interface RoomInfo {
  code: string;
  seat: Seat;
  /** Reconnection token of the recipient (kept for `rejoin`). */
  token: string;
  status: "waiting" | "playing" | "over";
  /** `ai`: seat held by the server AI (its level). */
  players: { seat: Seat; name: string; connected: boolean; rematch: boolean; ai?: AiLevel }[];
  match: MatchInfo;
  /** The recipient's deck. */
  deck: DeckEntries;
}

export type ClientMessage =
  | {
      type: "create";
      name: string;
      deck: DeckEntries;
      format?: Format;
      /** The opponent is the server AI (its level); its deck is a prebuilt one, drawn by the server. */
      ai?: { level: AiLevel };
      version?: ClientVersion;
    }
  | { type: "join"; code: string; name: string; deck: DeckEntries; version?: ClientVersion }
  | { type: "rejoin"; token: string; version?: ClientVersion }
  | { type: "leave" }
  | { type: "decision"; decision: Decision }
  | { type: "settings"; settings: Partial<AutopilotSettings> }
  | { type: "rematch" }
  /** Record of the finished game (replay, bug report); refused during the game (decks, seed). */
  | { type: "export" };

/**
 * `busy`: server full; `closed`: room closed by the server (waited too long); `version`: client of another version than
 * the server (reload the page).
 */
export type ErrorCode = "deck" | "name" | "room" | "full" | "busy" | "closed" | "token" | "rules" | "state" | "version";

export type ServerMessage =
  | { type: "room"; room: RoomInfo }
  | { type: "update"; view: GameView; events: GameEvent[]; faces: Record<string, CardFace>; clock: Clock | null }
  | { type: "opponent"; connected: boolean; remainingMs: number | null }
  | { type: "error"; code: ErrorCode; message: string }
  | { type: "record"; record: GameRecord };
