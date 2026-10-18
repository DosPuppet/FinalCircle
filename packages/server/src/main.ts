/**
 * Server start-up (from Planecircle): `npm run server`.
 * Variables: PORT (8788), HOST (0.0.0.0; 127.0.0.1 behind nginx), FC_DECISION_MS, FC_GRACE_MS (durations of the timer
 * and of the return delay), FC_MAX_ROOMS (most open rooms, 200), FC_DATA_DIR (save of the games in progress,
 * `data/rooms` by default; "off" to keep the games in memory only), FC_ORIGINS (origins allowed for the WebSocket besides
 * the same host, comma-separated), FC_MAX_ROOMS_PER_IP (4), FC_MAX_HEAP_MB (heap beyond which no room is created, 384),
 * FC_AI_WORKERS (workers of the AI seats, at most 2 by default; 0: no online AI), FC_MAX_AI_ROOMS (most open rooms with
 * an AI, 12), FC_MAX_RSS_MB (process memory beyond which no room with an AI is created, 640), FC_IMAGE_CACHE (disk cache
 * of the card images, outside Git; none by default: nginx caches them in production).
 */
import { networkInterfaces } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createImageRelay, startServer } from "./index";

const num = (v: string | undefined) => (v && Number.isFinite(Number(v)) ? Number(v) : undefined);
const staticDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "client", "dist");

const host = process.env.HOST || "0.0.0.0";
const server = await startServer({
  port: num(process.env.PORT) ?? 8788,
  host,
  staticDir,
  images: createImageRelay(process.env.FC_IMAGE_CACHE ? { cacheDir: process.env.FC_IMAGE_CACHE } : {}),
  ...(num(process.env.FC_AI_WORKERS) !== undefined ? { aiWorkers: num(process.env.FC_AI_WORKERS) } : {}),
  allowedOrigins: (process.env.FC_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
  config: {
    ...(num(process.env.FC_MAX_ROOMS_PER_IP) ? { maxRoomsPerIp: num(process.env.FC_MAX_ROOMS_PER_IP) } : {}),
    ...(num(process.env.FC_DECISION_MS) ? { decisionMs: num(process.env.FC_DECISION_MS) } : {}),
    ...(num(process.env.FC_GRACE_MS) ? { graceMs: num(process.env.FC_GRACE_MS) } : {}),
    ...(num(process.env.FC_MAX_ROOMS) ? { maxRooms: num(process.env.FC_MAX_ROOMS) } : {}),
    ...(num(process.env.FC_MAX_HEAP_MB) ? { maxHeapMb: num(process.env.FC_MAX_HEAP_MB) } : {}),
    ...(num(process.env.FC_MAX_AI_ROOMS) ? { maxAiRooms: num(process.env.FC_MAX_AI_ROOMS) } : {}),
    ...(num(process.env.FC_MAX_RSS_MB) ? { maxRssMb: num(process.env.FC_MAX_RSS_MB) } : {}),
    // Saved games: resumed after a restart (pm2 restart, update).
    ...(process.env.FC_DATA_DIR === "off" ? {} : { dataDir: process.env.FC_DATA_DIR || join(process.cwd(), "data", "rooms") }),
  },
});

// Local network addresses, only if the server listens on all interfaces.
const lan = (host === "0.0.0.0" ? Object.values(networkInterfaces()) : [])
  .flat()
  .filter((a) => a && a.family === "IPv4" && !a.internal)
  .map((a) => `http://${a?.address}:${server.port}`);
console.log(`FinalCircle — server online on port ${server.port}`);
console.log(
  `  local: http://${host === "0.0.0.0" ? "localhost" : host}:${server.port}${lan.length ? `\n  network: ${lan.join(", ")}` : ""}`,
);
console.log(`  (client served from packages/client/dist: run "npm run build" after a change)`);

const stop = () => server.close().then(() => process.exit(0));
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
