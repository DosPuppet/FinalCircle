/**
 * Local load test of the server (from Planecircle): memory taken per room with a game in progress.
 *
 * Usage: node --expose-gc --import tsx tools/load-test.ts [--rooms 50] [--decisions 200] [--ai --workers 2]
 *
 * `--ai`: rooms of one human and the AI seat (medium level, real pool of AI workers); also measures the event-loop delay
 * of the main thread (p99), the latency of the AI's thinking and the RSS (workers included).
 *
 * The rooms are created directly in a `RoomManager` (no network), with the two starter decks; each player answers with
 * the host's fallback decision, up to `--decisions` decisions per room. Memory is measured after a forced garbage
 * collection, before and after.
 */
import { monitorEventLoopDelay } from "node:perf_hooks";
import { DECKS } from "@finalcircle/cards";
import { type Decision, fallbackDecision, type GameState } from "@finalcircle/engine";
import { AiPool } from "../packages/server/src/aiPool";
import { DEFAULT_CONFIG, type Peer, RoomManager } from "../packages/server/src/rooms";

const arg = (name: string, d: number) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? Number(process.argv[i + 1]) : d;
};
const ROOMS = arg("--rooms", 50);
const DECISIONS = arg("--decisions", 200);
const AI = process.argv.includes("--ai");
const WORKERS = arg("--workers", 2);
const gc = (globalThis as { gc?: () => void }).gc;
if (!gc) throw new Error("run with node --expose-gc");

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;
function measure(): { rss: number; heap: number; total: number } {
  gc?.();
  gc?.();
  const m = process.memoryUsage();
  return { rss: m.rss, heap: m.heapUsed, total: m.heapTotal };
}

const decks = DECKS.map((d) => ({ main: { main: d.main, lb: d.lb } }));
const silent: Peer = { send() {} };
// No saving to disk, no disturbing timers: long delays.
const pool = AI ? new AiPool(WORKERS, 60_000) : undefined;
const rooms = new RoomManager({
  ...DEFAULT_CONFIG,
  maxRooms: ROOMS + 1,
  maxRoomsPerIp: ROOMS + 1,
  decisionMs: 3_600_000,
  ...(pool ? { aiPool: pool, maxAiRooms: ROOMS + 1, maxRssMb: 1e6 } : {}),
});
const loop = monitorEventLoopDelay({ resolution: 10 });
loop.enable();

const before = measure();
const started = Date.now();
const created: { room: ReturnType<RoomManager["create"]>["room"] }[] = [];
for (let i = 0; i < ROOMS; i++) {
  const a = decks[i % decks.length];
  const b = decks[(i + 1) % decks.length];
  if (!a || !b) throw new Error("starter decks not found");
  if (AI) {
    const { room } = rooms.create(`P${i}`, a.main, silent, { ai: { level: "medium" } });
    created.push({ room });
    continue;
  }
  const { room } = rooms.create(`P${i}a`, a.main, silent);
  rooms.join(room.code, `P${i}b`, b.main, silent);
  created.push({ room });
}
// Let the games start (asynchronous action queue).
await new Promise((r) => setTimeout(r, 50));

let played = 0;
for (let k = 0; k < DECISIONS; k++) {
  for (const { room } of created) {
    const host = (room as unknown as { host: { state: GameState } | null }).host;
    const s = host?.state;
    if (!s || s.over || !s.pending) continue;
    const seat = room.seats.find((x) => x.seat === s.pending?.player);
    if (!seat || seat.ai) continue;
    const d: Decision = fallbackDecision(s, s.pending);
    await room.decide(seat, d).catch(() => {});
    played++;
  }
}
const after = measure();
const live = created.filter(({ room }) => room.status === "playing").length;
console.log(`${ROOMS} rooms, ${played} decisions in ${((Date.now() - started) / 1000).toFixed(1)} s (${live} games in progress)`);
console.log(`  RSS: ${mb(before.rss)} → ${mb(after.rss)} (${mb((after.rss - before.rss) / ROOMS)} per room)`);
console.log(`  heap: ${mb(before.heap)} → ${mb(after.heap)} (${mb((after.heap - before.heap) / ROOMS)} per room)`);
console.log(`  reserved heap: ${mb(before.total)} → ${mb(after.total)}`);
loop.disable();
console.log(`  event loop: p99 ${(loop.percentile(99) / 1e6).toFixed(1)} ms, max ${(loop.max / 1e6).toFixed(1)} ms`);
if (pool) {
  const st = pool.stats();
  console.log(`  AI: ${st.workers} workers, thinking p50 ${st.p50} ms, p95 ${st.p95} ms`);
  await pool.close();
}
rooms.closeAll();
process.exit(0);
