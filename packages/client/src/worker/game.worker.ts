/**
 * Game against the AI, entirely in the browser (from Planecircle): the engine, the autopilot and the AI run here, off
 * the interface thread.
 */
import { aiAgent } from "@finalcircle/ai";
import type { DeckEntries } from "@finalcircle/cards";
import {
  type CardDef,
  createObject,
  createRecordedGame,
  type GameEvent,
  GameHost,
  type GameRecord,
  type GameState,
  msg,
  RULES_VERSION,
  registerDef,
  replayChecked,
  visibleFaces,
} from "@finalcircle/engine";
import type { FromWorker, Sandbox, ToWorker } from "../protocol";

const HUMAN = "p1";
const AI = "p2";
/** Thinking time of the AI in the interface. */
const AI_BUDGET = { ms: 700 } as const;
let host: GameHost | null = null;
/** Decisions of the record already sent to the interface (save of the game). */
let sent = 0;
let defs: Record<string, CardDef> = {};

const post = (m: FromWorker) => (self as unknown as Worker).postMessage(m);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function card(code: string): CardDef {
  const d = defs[code];
  if (!d) throw new Error(`Unknown card: ${code}`);
  return d;
}

const build = (entries: [number, string][] | undefined) =>
  (entries ?? []).flatMap(([n, code]) => Array.from({ length: n }, () => card(code)));
const deckOf = (d: DeckEntries) => ({ deck: build(d.main), lb: build(d.lb) });

/** Sends the interface the decisions recorded since the last send (`header`: at the start of the game). */
function postProgress(header?: GameRecord): void {
  const rec = host?.record;
  if (!rec || (!header && rec.decisions.length <= sent)) return;
  post({
    type: "saved",
    ...(header ? { header: { ...structuredClone(header), decisions: [], checkpoints: [] } } : {}),
    decisions: rec.decisions.slice(sent),
    checkpoints: structuredClone(rec.checkpoints ?? []),
  });
  sent = rec.decisions.length;
}

/** Tutorial: the opponent waits during an explanation. */
let paused = false;
const resumers: (() => void)[] = [];
const gate = () => (paused ? new Promise<void>((r) => resumers.push(r)) : null);

/** Dev sandbox: cards put onto the field (controlled since the start, active) and into the hand. */
function applySandbox(s: GameState, sandbox: Sandbox): void {
  for (const [player, side] of Object.entries(sandbox)) {
    if (!s.players[player]) continue;
    for (const code of side.field ?? []) {
      const d = card(code);
      registerDef(s, d);
      createObject(s, d.id, player, "field").controlledSince = 0;
    }
    for (const code of side.hand ?? []) {
      const d = card(code);
      registerDef(s, d);
      createObject(s, d.id, player, "hand");
    }
  }
}

const DIVERGED = msg("the game no longer replays identically");
const DIVERGED_UPDATED = msg("the game no longer replays identically (the engine has been updated since)");

function hostFor(
  state: GameState,
  seed: number,
  opts: { fast?: boolean; aiLevel?: string; record?: GameRecord },
  events: GameEvent[] = [],
) {
  return new GameHost(
    state,
    {
      agents: { [AI]: aiAgent((opts.aiLevel as never) ?? "medium", { seed: seed + 1, budget: AI_BUDGET, fair: true }) },
      aiDelay: opts.fast && import.meta.env.DEV ? 0 : 900,
      sleep,
      gate,
      ...(opts.record ? { record: opts.record } : {}),
      // Local save: one fingerprint per decision, checked on resume.
      checkpointEvery: 1,
      frames: true,
      onUpdate: (_p, view, evts) => {
        post({ type: "update", view, events: evts, faces: host ? visibleFaces(host.state, view, evts) : {} });
        postProgress();
      },
    },
    events,
  );
}

self.onmessage = (e: MessageEvent<ToWorker>) => {
  handle(e.data).catch((err: unknown) => {
    console.error(err);
    post({ type: "error", message: msg("Engine error: {error}", { error: err instanceof Error ? err.message : String(err) }) });
  });
};

async function handle(m: ToWorker): Promise<void> {
  switch (m.type) {
    case "start": {
      defs = m.defs;
      paused = false;
      const me = deckOf(m.playerDeck);
      const ai = deckOf(m.aiDeck);
      const { state, events, record } = createRecordedGame({
        seed: m.seed,
        ...(m.startingPlayer ? { startingPlayer: m.startingPlayer } : {}),
        players: [
          { id: HUMAN, name: m.playerName, ...me },
          { id: AI, name: m.aiName, ...ai },
        ],
      });
      // Sandbox: the starting state is changed by hand, the game is not recorded.
      const sandboxed = !!m.sandbox && import.meta.env.DEV;
      if (sandboxed && m.sandbox) applySandbox(state, m.sandbox);
      sent = 0;
      host = hostFor(
        state,
        m.seed,
        { ...(m.fast ? { fast: true } : {}), ...(m.aiLevel ? { aiLevel: m.aiLevel } : {}), ...(sandboxed ? {} : { record }) },
        events,
      );
      if (!sandboxed) postProgress(record);
      await host.run();
      return;
    }
    case "resume": {
      defs = m.defs;
      paused = false;
      const record = structuredClone(m.record);
      let replayed: ReturnType<typeof replayChecked>;
      try {
        replayed = replayChecked(record, card);
      } catch (e) {
        post({ type: "resumeFailed", message: e instanceof Error ? e.message : String(e) });
        return;
      }
      if (replayed.divergence) {
        post({ type: "resumeFailed", message: (record.rules ?? 0) !== RULES_VERSION ? DIVERGED_UPDATED : DIVERGED });
        return;
      }
      sent = record.decisions.length;
      host = hostFor(replayed.state, record.seed, {
        ...(m.fast ? { fast: true } : {}),
        ...(m.aiLevel ? { aiLevel: m.aiLevel } : {}),
        record,
      });
      await host.run();
      return;
    }
    case "decision": {
      if (!host) return;
      const error = await host.submitHuman(HUMAN, m.decision);
      if (error) post({ type: "error", message: error });
      return;
    }
    case "export":
      post({ type: "record", record: host?.record ? structuredClone(host.record) : null });
      return;
    case "pause":
      paused = m.paused;
      if (!paused) for (const r of resumers.splice(0)) r();
      return;
    case "settings":
      if (!host) return;
      host.setSettings(HUMAN, m.settings);
      await host.run();
      return;
  }
}
