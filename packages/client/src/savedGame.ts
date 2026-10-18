/**
 * Save of the local game in progress (against the AI; from Planecircle), to resume it exactly where it was when the page is reopened:
 * the game record (seed, decks, decisions) is enough, the engine being deterministic; the worker replays it and then
 * takes over. The tutorial and the sandbox are not recorded, hence not saved.
 */
import type { AiLevel } from "@finalcircle/ai";
import { type GameRecord, isGameRecord } from "@finalcircle/engine";
import type { LogLine } from "./i18n";

export interface SavedLocalGame {
  version: 1;
  record: GameRecord;
  aiLevel?: AiLevel;
  /** Game log at the time of the save. */
  log?: LogLine[];
  savedAt: string;
}

const KEY = "finalcircle.localGame";

export function loadSavedGame(): SavedLocalGame | null {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<SavedLocalGame> | null;
    if (raw?.version !== 1 || !isGameRecord(raw.record)) return null;
    return {
      version: 1,
      record: raw.record,
      ...(raw.aiLevel ? { aiLevel: raw.aiLevel } : {}),
      log: Array.isArray(raw.log) ? raw.log : [],
      savedAt: raw.savedAt ?? "",
    };
  } catch {
    return null;
  }
}

export function storeSavedGame(game: SavedLocalGame): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(game));
  } catch {
    // storage full or unavailable: the game cannot be resumed
  }
}

export function clearSavedGame(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // storage unavailable
  }
}

/**
 * Record kept up to date from the worker's messages (`saved`): the header once, then the new decisions. Writes are
 * grouped (at most one every `delayMs`), and `flush` writes at once (page closed).
 */
export class SaveWriter {
  private record: GameRecord | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly meta: () => Omit<SavedLocalGame, "version" | "record" | "savedAt">,
    private readonly write: (g: SavedLocalGame) => void = storeSavedGame,
    private readonly delayMs = 400,
  ) {}

  /** Resume: the replayed record becomes the starting point. */
  start(record: GameRecord): void {
    this.record = structuredClone(record);
  }

  apply(msg: { header?: GameRecord; decisions: GameRecord["decisions"]; checkpoints: [number, string][] }): void {
    if (msg.header) this.record = { ...structuredClone(msg.header), decisions: [], checkpoints: [] };
    if (!this.record) return;
    this.record.decisions.push(...msg.decisions);
    this.record.checkpoints = msg.checkpoints;
    if (!this.timer) this.timer = setTimeout(() => this.flush(), this.delayMs);
  }

  flush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.record) this.write({ version: 1, record: this.record, ...this.meta(), savedAt: new Date().toISOString() });
  }

  /** Save abandoned (game left): no more writes. */
  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.record = null;
  }
}
