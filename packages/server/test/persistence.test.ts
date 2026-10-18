/** Persistence of online games: a server restart no longer cuts games off (`RoomConfig.dataDir`). */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { card } from "@finalcircle/cards";
import { isGameRecord, RULES_VERSION, replayGame } from "@finalcircle/engine";
import { afterEach, describe, expect, it } from "vitest";
import type { RunningServer } from "../src/index";
import { digest } from "../src/rooms";
import { Client, duel, server } from "./helpers";

const servers: RunningServer[] = [];
const clients: Client[] = [];
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.close()));
  for (const s of servers.splice(0)) await s.close();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), "fc-rooms-"));
  dirs.push(d);
  return d;
}

/** The opening: who starts (CR 8.2.1.2), then both players keep their hand (8.2.1.4). */
async function opening(a: Client, b: Client): Promise<void> {
  for (let i = 0; i < 6; i++) {
    for (const c of [a, b]) {
      const v = c.lastView;
      const p = v?.pending;
      if (p?.player !== v?.viewer) continue;
      if (p?.kind === "mulligan") c.send({ type: "decision", decision: { type: "keep" } });
      if (p?.kind === "choice") c.send({ type: "decision", decision: { type: "choose", values: p.request?.suggested ?? [] } });
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}

async function tokenOf(c: Client): Promise<string> {
  const room = [...c.received].reverse().find((m) => m.type === "room");
  return room?.type === "room" ? room.room.token : "";
}

describe("saved games", () => {
  it("after a server restart, players resume the game with their token and finish it", async () => {
    const dataDir = tempDir();
    const first = await server({ dataDir, graceMs: 10_000 });
    servers.push(first);
    const { a, b, code } = await duel(first.port, { bots: false });
    clients.push(a, b);
    // A few decisions: who starts, then both players keep their hand.
    await opening(a, b);
    const before = { a: a.lastView, b: b.lastView };
    const [ta, tb] = [await tokenOf(a), await tokenOf(b)];
    expect(existsSync(join(dataDir, `${code}.jsonl`))).toBe(true);

    // Server shutdown (pm2 restart): the save remains.
    await Promise.all([a.close(), b.close()]);
    await first.close();
    servers.splice(servers.indexOf(first), 1);
    expect(existsSync(join(dataDir, `${code}.jsonl`))).toBe(true);

    const second = await server({ dataDir, graceMs: 10_000 });
    servers.push(second);
    expect(second.rooms.size).toBe(1);
    const a2 = await Client.connect(second.port);
    const b2 = await Client.connect(second.port);
    clients.push(a2, b2);
    a2.send({ type: "rejoin", token: ta });
    b2.send({ type: "rejoin", token: tb });
    const upA = await a2.next("update");
    const upB = await b2.next("update");
    // The resumed game is exactly the one from before (same hand, same turn).
    expect(upA.view.hand.map((c) => c.id)).toEqual(before.a?.hand.map((c) => c.id));
    expect(upB.view.hand.map((c) => c.id)).toEqual(before.b?.hand.map((c) => c.id));
    expect(upA.view.turn).toEqual(before.a?.turn);
    // No export during the game (it would reveal the decks and the seed).
    a2.send({ type: "export" });
    expect((await a2.next("error", (m) => m.code === "state")).message).toMatch(/not over/);
    // And it goes on: the bots play for a few seconds, then Alice concedes (if she is not already finished).
    a2.bot = b2.bot = true;
    a2.play(upA.view);
    b2.play(upB.view);
    await new Promise((r) => setTimeout(r, 2_000));
    a2.bot = false;
    // The bots play without pauses: the game may have ended by itself.
    if (!a2.lastView?.over) a2.send({ type: "decision", decision: { type: "concede" } });
    const end = await a2.next("update", (m) => m.view.over, 20_000);
    expect(end.view.winner).toBeTruthy();
    expect(end.view.turn.number).toBeGreaterThanOrEqual(upA.view.turn.number);
    // Export of the finished game: it replays to the same winner (decisions from before and after the restart).
    a2.send({ type: "export" });
    const { record } = await a2.next("record");
    expect(isGameRecord(record)).toBe(true);
    const replayed = replayGame(record, card);
    expect(replayed.state.over).toBe(true);
    expect(replayed.state.winner).toBe(end.view.winner);
  }, 60_000);

  /** A game in progress (who starts, both players keep their hand), then the server shutdown: the file and the tokens. */
  async function savedGame(dataDir: string): Promise<{ file: string; tokens: string[] }> {
    const first = await server({ dataDir, graceMs: 10_000 });
    const { a, b, code } = await duel(first.port, { bots: false });
    await opening(a, b);
    const tokens = [await tokenOf(a), await tokenOf(b)];
    await Promise.all([a.close(), b.close()]);
    await first.close();
    return { file: join(dataDir, `${code}.jsonl`), tokens };
  }

  it("each saved decision carries the state fingerprint; another rules version without fingerprints: interrupted game", async () => {
    const dataDir = tempDir();
    const { file, tokens } = await savedGame(dataDir);
    const [head, ...lines] = readFileSync(file, "utf8").split("\n").filter(Boolean);
    expect(JSON.parse(head as string).record.rules).toBe(RULES_VERSION);
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) expect(typeof JSON.parse(l)[2]).toBe("string");
    // Save from an earlier rules version, without fingerprints (version 0).
    const old = JSON.parse(head as string);
    delete old.record.rules;
    const oldLines = lines.map((l) => JSON.stringify(JSON.parse(l).slice(0, 2)));
    writeFileSync(file, `${[JSON.stringify(old), ...oldLines].join("\n")}\n`);

    const srv = await server({ dataDir });
    servers.push(srv);
    expect(srv.rooms.size).toBe(0);
    expect(readdirSync(dataDir)).toContain(`${file.split("/").at(-1)}.rules0`);
    const c = await Client.connect(srv.port);
    clients.push(c);
    c.send({ type: "rejoin", token: tokens[0] as string });
    expect((await c.next("error", (m) => m.code === "token")).message).toMatch(/interrupted by an engine update/);
    // The interruption survives a second restart (interrupted.json, fingerprints only).
    await srv.close();
    servers.splice(servers.indexOf(srv), 1);
    expect(readFileSync(join(dataDir, "interrupted.json"), "utf8")).not.toContain(tokens[0] as string);
    const again = await server({ dataDir });
    servers.push(again);
    const c2 = await Client.connect(again.port);
    clients.push(c2);
    c2.send({ type: "rejoin", token: tokens[1] as string });
    expect((await c2.next("error", (m) => m.code === "token")).message).toMatch(/interrupted by an engine update/);
  }, 30_000);

  it("the save contains only the token fingerprint, and is readable only by the server", async () => {
    const dataDir = tempDir();
    const { file, tokens } = await savedGame(dataDir);
    const text = readFileSync(file, "utf8");
    for (const t of tokens) {
      expect(text).not.toContain(t);
      expect(text).toContain(digest(t));
    }
    expect(statSync(file).mode & 0o777).toBe(0o600);
  }, 30_000);

  it("files set aside for more than seven days disappear", async () => {
    const dataDir = tempDir();
    const { tokens } = await savedGame(dataDir);
    const stale = join(dataDir, "OLDOLD.jsonl.bad");
    writeFileSync(stale, "x");
    const week = (Date.now() - 8 * 24 * 3_600_000) / 1000;
    utimesSync(stale, week, week);
    writeFileSync(join(dataDir, "NEWNEW.jsonl.bad"), "x");
    const srv = await server({ dataDir });
    servers.push(srv);
    expect(srv.rooms.size).toBe(1);
    expect(srv.rooms.byToken(tokens[0])).not.toBeNull();
    expect(existsSync(stale)).toBe(false);
    expect(existsSync(join(dataDir, "NEWNEW.jsonl.bad"))).toBe(true);
  }, 30_000);

  it("at most maxRooms rooms resumed, the most recent; the others are set aside", async () => {
    const dataDir = tempDir();
    const { file } = await savedGame(dataDir);
    const copy = join(dataDir, "ZZZZZZ.jsonl");
    writeFileSync(copy, readFileSync(file, "utf8").replace(/"code":"[A-Z0-9]+"/, '"code":"ZZZZZZ"'));
    const old = (Date.now() - 3_600_000) / 1000;
    utimesSync(file, old, old);
    const srv = await server({ dataDir, maxRooms: 1 });
    servers.push(srv);
    expect(srv.rooms.size).toBe(1);
    expect(existsSync(`${file}.bad`)).toBe(true);
    expect(existsSync(copy)).toBe(true);
  }, 30_000);

  it("same rules version but different fingerprint: the file is set aside (non-deterministic engine)", async () => {
    const dataDir = tempDir();
    const { file } = await savedGame(dataDir);
    const [head, ...lines] = readFileSync(file, "utf8").split("\n").filter(Boolean);
    const last = JSON.parse(lines.at(-1) as string);
    last[2] = "0";
    writeFileSync(file, `${[head, ...lines.slice(0, -1), JSON.stringify(last)].join("\n")}\n`);
    const srv = await server({ dataDir });
    servers.push(srv);
    expect(srv.rooms.size).toBe(0);
    expect(readdirSync(dataDir)).toContain(`${file.split("/").at(-1)}.bad`);
  }, 30_000);

  it("a closed room erases its save; an unreadable file is set aside without blocking startup", async () => {
    const dataDir = tempDir();
    writeFileSync(join(dataDir, "ABCDEF.jsonl"), "not JSON\n");
    const srv = await server({ dataDir, cleanupMs: 50 });
    servers.push(srv);
    expect(srv.rooms.size).toBe(0);
    expect(readdirSync(dataDir)).toContain("ABCDEF.jsonl.bad");
    const { a, b, code } = await duel(srv.port, { bots: false });
    clients.push(a, b);
    expect(existsSync(join(dataDir, `${code}.jsonl`))).toBe(true);
    a.send({ type: "leave" });
    b.send({ type: "leave" });
    await Promise.all([a.close(), b.close()]);
    for (let i = 0; i < 40 && existsSync(join(dataDir, `${code}.jsonl`)); i++) await new Promise((r) => setTimeout(r, 50));
    expect(existsSync(join(dataDir, `${code}.jsonl`))).toBe(false);
  });
});
