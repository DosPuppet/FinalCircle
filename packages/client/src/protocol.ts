/** Messages exchanged between the interface and the Web Worker that runs the game (from Planecircle). */
import type { AiLevel } from "@finalcircle/ai";
import type { DeckEntries } from "@finalcircle/cards";
import type { AutopilotSettings, CardDef, CardFace, Decision, GameEvent, GameRecord, GameView } from "@finalcircle/engine";

/** Sandbox (dev mode, interface tests): cards put onto the field and into the hand at the start, by player. */
export type Sandbox = Record<string, { field?: string[]; hand?: string[] }>;

export type ToWorker =
  | {
      type: "start";
      seed: number;
      /** Names of the human player and of the AI, in the interface language. */
      playerName: string;
      aiName: string;
      playerDeck: DeckEntries;
      aiDeck: DeckEntries;
      /** Definitions of the cards used (by card number): the worker does not bundle the card database. */
      defs: Record<string, CardDef>;
      /** Forced first player; absent: chosen in the game (CR 8.2.1.2). */
      startingPlayer?: string;
      sandbox?: Sandbox;
      /** Fast mode of the interface tests (dev): the AI plays without pauses. */
      fast?: boolean;
      aiLevel?: AiLevel;
    }
  /** Resume of a saved game (page reopened): the record is replayed, then the game goes on. */
  | { type: "resume"; record: GameRecord; defs: Record<string, CardDef>; aiLevel?: AiLevel; fast?: boolean }
  /** Tutorial: the opponent waits (explanation on screen). */
  | { type: "pause"; paused: boolean }
  | { type: "decision"; decision: Decision }
  | { type: "settings"; settings: Partial<AutopilotSettings> }
  /** Game record (export for a replay or to report a bug). */
  | { type: "export" };

export type FromWorker =
  | { type: "update"; view: GameView; events: GameEvent[]; faces: Record<string, CardFace> }
  /** Error for the player (engine text, `msg`: translated at display). */
  | { type: "error"; message: string }
  | { type: "record"; record: GameRecord | null }
  /** Save of the game: the record's header at the start, then the new decisions and the checkpoints. */
  | { type: "saved"; header?: GameRecord; decisions: GameRecord["decisions"]; checkpoints: [number, string][] }
  /** Resume impossible (the game no longer replays identically). */
  | { type: "resumeFailed"; message: string };
