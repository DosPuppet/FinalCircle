/**
 * The AI seat held by the server (from Planecircle): the AI thinks in the worker pool, plays its decisions (recorded
 * like the others), has no timer; the room closes when the human leaves; a resume after a restart replays its
 * decisions without rerunning it, then it carries on.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { plainText } from "@finalcircle/engine";
import { afterEach, describe, expect, it } from "vitest";
import type { RunningServer } from "../src/index";
import { Client, server, VOL1 } from "./helpers";

let srv: RunningServer | null = null;
const clients: Client[] = [];
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.close()));
  await srv?.close();
  srv = null;
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
async function human(port: number): Promise<Client> {
  const c = await Client.connect(port);
  clients.push(c);
  return c;
}

describe("AI seat", () => {
  it("a duel against the server AI: the game starts at once and the AI plays (decisions recorded)", async () => {
    srv = await server({}, { aiWorkers: 1 });
    const a = await human(srv.port);
    a.bot = true;
    a.send({ type: "create", name: "Alice", deck: VOL1, ai: { level: "beginner" } });
    const room = await a.next("room", (m) => m.room.status === "playing", 10_000);
    expect(room.room.players.map((p) => p.ai ?? null)).toEqual([null, "beginner"]);
    expect(plainText(room.room.players[1]?.name ?? "")).toBe("AI (beginner)");
    // The AI keeps its hand and plays: its field fills up.
    const later = await a.next("update", (u) => u.view.field.some((o) => o.controller === "p2"), 40_000);
    expect(plainText(later.view.players.p2?.name ?? "")).toBe("AI (beginner)");
  }, 60_000);

  it("when the human leaves, the room closes; without workers, no AI seat", async () => {
    srv = await server({}, { aiWorkers: 1 });
    const a = await human(srv.port);
    a.send({ type: "create", name: "Alice", deck: VOL1, ai: { level: "medium" } });
    await a.next("update", () => true, 15_000);
    expect(srv.rooms.size).toBe(1);
    a.send({ type: "leave" });
    for (let i = 0; i < 50 && srv.rooms.size > 0; i++) await new Promise((r) => setTimeout(r, 100));
    expect(srv.rooms.size).toBe(0);
    const none = await server({});
    const b = await Client.connect(none.port);
    b.send({ type: "create", name: "Bob", deck: VOL1, ai: { level: "medium" } });
    expect((await b.next("error")).code).toBe("busy");
    await b.close();
    await none.close();
  }, 30_000);

  it("resume after a restart: the AI's decisions are replayed, then it carries on", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "fc-rooms-"));
    dirs.push(dataDir);
    const first = await server({ dataDir, graceMs: 20_000 }, { aiWorkers: 1 });
    const a = await Client.connect(first.port);
    a.bot = true;
    a.send({ type: "create", name: "Alice", deck: VOL1, ai: { level: "beginner" } });
    const created = await a.next("room", (m) => m.room.status === "playing", 10_000);
    await a.next("update", (u) => u.view.turn.number >= 3, 40_000);
    a.bot = false;
    await new Promise((r) => setTimeout(r, 300));
    const lines = readFileSync(join(dataDir, `${created.room.code}.jsonl`), "utf8")
      .split("\n")
      .filter(Boolean);
    expect(lines.slice(1).filter((l) => JSON.parse(l)[0] === "p2").length).toBeGreaterThan(0);
    await a.close();
    await first.close();
    srv = await server({ dataDir, graceMs: 20_000 }, { aiWorkers: 1 });
    expect(srv.rooms.size).toBe(1);
    const back = await human(srv.port);
    back.send({ type: "rejoin", token: created.room.token });
    const up = await back.next("update");
    expect(plainText(up.view.players.p2?.name ?? "")).toBe("AI (beginner)");
    back.bot = true;
    back.play(up.view);
    const turn = up.view.turn.number;
    await back.next("update", (u) => u.view.turn.number > turn + 1 || u.view.over, 40_000);
  }, 120_000);
});
