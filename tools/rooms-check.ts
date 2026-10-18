/**
 * Before a deployment: replays a copy of the saved online games with the repository's engine, and
 * tells how many would resume, how many would be interrupted (other rules version, different fingerprints) and how
 * many are unreadable. The original files are not touched.
 *
 * Usage: npx tsx tools/rooms-check.ts [dir]   (data/rooms by default; FC_DATA_DIR if it is set)
 */
import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RULES_VERSION } from "@finalcircle/engine";
import { DEFAULT_CONFIG, RoomManager } from "../packages/server/src/rooms";

const source = process.argv[2] ?? process.env.FC_DATA_DIR ?? join(process.cwd(), "data", "rooms");
if (!existsSync(source)) {
  console.log(`No save in ${source}: nothing to check.`);
  process.exit(0);
}
const saved = readdirSync(source).filter((f) => f.endsWith(".jsonl"));
const copy = mkdtempSync(join(tmpdir(), "fc-rooms-check-"));
try {
  for (const f of saved) cpSync(join(source, f), join(copy, f));
  // The resumption logs ("room … resumed") are of no use here.
  const log = console.log;
  const warn = console.warn;
  const error = console.error;
  console.log = console.warn = console.error = () => {};
  const rooms = new RoomManager({ ...DEFAULT_CONFIG, dataDir: copy, maxRooms: Math.max(saved.length, 1) });
  console.log = log;
  console.warn = warn;
  console.error = error;
  const after = readdirSync(copy);
  const interrupted = after.filter((f) => /\.jsonl\.rules\d+$/.test(f)).length;
  const bad = after.filter((f) => f.endsWith(".jsonl.bad")).length;
  console.log(`Engine rules: version ${RULES_VERSION}. Saved games: ${saved.length}.`);
  console.log(`  resumed: ${rooms.size}`);
  console.log(`  interrupted by the rules update: ${interrupted}`);
  console.log(`  unreadable or different (set aside): ${bad}`);
  rooms.closeAll();
  process.exitCode = interrupted + bad > 0 ? 2 : 0;
} finally {
  rmSync(copy, { recursive: true, force: true });
}
