/** Messages exchanged between the interface and the Web Worker that runs the game (from Planecircle). */
import type { AiLevel, ScriptAction } from "@finalcircle/ai";
import type { DeckEntries } from "@finalcircle/cards";
import type { AutopilotSettings, CardDef, CardFace, Decision, GameEvent, GameRecord, GameView, Phase } from "@finalcircle/engine";

/** Sandbox (dev mode, interface tests): cards put onto the field and into the hand at the start, by player. */
export type Sandbox = Record<string, { field?: string[]; hand?: string[] }>;

/** One side of a staged game (tutorial): its cards by card number. */
export interface ScenarioSide {
  name?: string;
  /** Main deck in order: the first card is the top. */
  deck: string[];
  hand: string[];
  field?: (string | { card: string; dull?: boolean; sick?: boolean; damage?: number })[];
  breakZone?: string[];
  damage?: string[];
  /** LB deck, face down. */
  lb?: string[];
}

/** Staged game (tutorial): a known starting position and a scripted opponent (or an AI of the given level). */
export interface ScenarioSpec {
  you: ScenarioSide;
  opponent: ScenarioSide;
  active: "you" | "opponent";
  turn?: number;
  phase?: Phase;
  opponentPlays: ScriptAction[] | AiLevel;
}

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
      /** Tutorial: a staged game instead of shuffled decks (the decks are then empty); not recorded. */
      scenario?: ScenarioSpec;
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
