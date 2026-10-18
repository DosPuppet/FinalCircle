import { findCard } from "@finalcircle/cards";
import { RULES_VERSION } from "@finalcircle/engine";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { type RunningServer, startServer } from "../src/index";
import { checkDeck, ipKey } from "../src/rooms";
import { Client, duel, server, VERSION, VOL1 } from "./helpers";

let srv: RunningServer | null = null;
const clients: Client[] = [];
afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.close()));
  await srv?.close();
  srv = null;
});
async function start(config = {}, opts: Parameters<typeof server>[1] = {}) {
  srv = await server(config, opts);
  return srv.port;
}
async function pair(port: number, bots = true) {
  const d = await duel(port, { bots });
  clients.push(d.a, d.b);
  return d;
}

/** Definition ids cited in a message. */
function defIds(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const v of value) defIds(v, out);
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (/defId$/i.test(k) && typeof v === "string") out.add(v);
      else defIds(v, out);
    }
  }
  return out;
}

describe("rooms", () => {
  it("creation, code, second player joining and game start", async () => {
    const port = await start();
    const { a, b, code } = await pair(port, false);
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    const ua = a.received.find((m) => m.type === "update");
    const ub = b.received.find((m) => m.type === "update");
    expect(ua && ua.type === "update" && ua.view.viewer).toBe("p1");
    expect(ub && ub.type === "update" && ub.view.viewer).toBe("p2");
    const room = [...b.received].reverse().find((m) => m.type === "room");
    expect(room && room.type === "room" && room.room.players.map((p) => p.name)).toEqual(["Alice", "Bob"]);
    expect(room && room.type === "room" && room.room.status).toBe("playing");
  });

  it("rejects an illegal deck, an unknown code and a third player", async () => {
    const port = await start();
    const c = await Client.connect(port);
    clients.push(c);
    c.send({ type: "create", name: "Eve", deck: { main: [[40, "27-122S"]] } });
    expect((await c.next("error")).code).toBe("deck");
    c.send({ type: "create", name: "Eve", deck: { main: [[50, "99-999X"]] } });
    expect((await c.next("error")).code).toBe("deck");
    c.send({ type: "create", name: "Eve", deck: [[50, "27-122S"]] } as never);
    expect((await c.next("error")).code).toBe("deck");
    c.send({ type: "join", code: "ZZZZZZ", name: "Eve", deck: VOL1 });
    expect((await c.next("error")).code).toBe("room");
    c.send({ type: "create", name: "   ", deck: VOL1 });
    expect((await c.next("error")).code).toBe("name");
    const { code } = await pair(port, false);
    c.send({ type: "join", code, name: "Eve", deck: VOL1 });
    expect((await c.next("error")).code).toBe("full");
  });

  it("rejects a client of another version (protocol or rules): it must reload the page", async () => {
    const port = await start();
    const c = await Client.connect(port);
    clients.push(c);
    c.send({ type: "create", name: "Eve", deck: VOL1 }, true);
    expect((await c.next("error")).code).toBe("version");
    c.send({ type: "create", name: "Eve", deck: VOL1, version: { protocol: VERSION.protocol, rules: VERSION.rules - 1 } });
    expect((await c.next("error")).code).toBe("version");
    c.send({ type: "rejoin", token: "x", version: { protocol: VERSION.protocol + 1, rules: VERSION.rules } });
    expect((await c.next("error")).code).toBe("version");
  });

  it("accepts a prebuilt deck as is, not 40 cards nor 4 copies of a card (CR 8.1.1)", () => {
    expect(checkDeck(VOL1)).toEqual(VOL1);
    expect(() => checkDeck({ main: [[40, "27-122S"]] })).toThrow(/exactly 50 cards/);
    const four = { main: [[4, "27-122S"], ...VOL1.main.slice(1)] as [number, string][], lb: VOL1.lb };
    expect(() => checkDeck(four)).toThrow();
  });

  it("an out-of-turn or illegal decision is rejected without breaking the game", async () => {
    const port = await start();
    const { a, b } = await pair(port, false);
    // The game opens on a question: a random player chooses who starts (CR 8.2.1.2).
    const va = a.lastView;
    const vb = b.lastView;
    const deciding = va?.pending?.player === "p1" ? a : b;
    const waiting = deciding === a ? b : a;
    waiting.send({ type: "decision", decision: { type: "keep" } });
    expect((await waiting.next("error")).code).toBe("rules");
    deciding.send({ type: "decision", decision: { type: "cast", card: "nothing" } });
    expect((await deciding.next("error")).code).toBe("rules");
    const request = (deciding === a ? va : vb)?.pending;
    const values = request?.kind === "choice" ? (request.request?.suggested ?? []) : [];
    deciding.send({ type: "decision", decision: { type: "choose", values } });
    await deciding.next("update");
  });

  it("a malformed decision is rejected cleanly", async () => {
    const port = await start();
    const { a } = await pair(port, false);
    for (const decision of [null, "keep", [], { type: "unknown" }]) {
      a.send({ type: "decision", decision } as never);
      expect((await a.next("error")).message).toBe("Invalid decision.");
    }
  });

  it("malformed settings do not freeze the game", async () => {
    const port = await start();
    const { a, b } = await pair(port, false);
    for (const c of [a, b]) c.send({ type: "settings", settings: { stops: null, passUntilTurn: "x" } } as never);
    a.bot = b.bot = true;
    a.play(a.lastView as NonNullable<typeof a.lastView>);
    b.play(b.lastView as NonNullable<typeof b.lastView>);
    const later = await a.next("update", (m) => m.view.turn.number >= 3, 30_000);
    expect(later.clock).not.toBeNull();
  }, 40_000);
});

describe("complete game", () => {
  it("two bots that see only their own view play to the end", async () => {
    const port = await start();
    const { a, b } = await pair(port);
    const end = await a.next("update", (m) => m.view.over, 90_000);
    expect(end.view.winner).toMatch(/^p[12]$/);
    await b.next("update", (m) => m.view.over);
    // Hidden information: one player's opening hand never shows up on the other side (disjoint decks).
    const openA = a.received.find((m) => m.type === "update" && m.view.hand.length > 0);
    const handA = new Set(openA && openA.type === "update" ? openA.view.hand.map((c) => c.defId) : []);
    expect(handA.size).toBeGreaterThan(0);
    const openB = b.received.find((m) => m.type === "update" && m.view.hand.length > 0);
    const seenByB = defIds(openB);
    for (const d of handA) expect(seenByB.has(d)).toBe(false);
    // Faces: no card of the opposing decklist before it has been seen.
    const facesB = openB?.type === "update" ? Object.keys(openB.faces) : [];
    const vol1 = new Set(VOL1.main.map(([, code]) => findCard(code)?.id));
    expect(facesB.filter((d) => vol1.has(d))).toEqual([]);
  }, 120_000);

  it("leaving a game in progress counts as a forfeit", async () => {
    const port = await start();
    const { a, b } = await pair(port, false);
    a.send({ type: "leave" });
    const end = await b.next("update", (m) => m.view.over);
    expect(end.view.winner).toBe("p2");
  });

  it("rematch: a new game in the same room when both players ask for it", async () => {
    const port = await start();
    const { a, b } = await pair(port, false);
    a.send({ type: "decision", decision: { type: "concede" } });
    await a.next("update", (m) => m.view.over);
    await b.next("update", (m) => m.view.over);
    a.send({ type: "rematch" });
    expect((await b.next("room", (m) => m.room.players.some((p) => p.rematch))).room.status).toBe("over");
    b.send({ type: "rematch" });
    const fresh = await a.next("update", (m) => !m.view.over);
    expect(fresh.view.players.p1?.damage).toHaveLength(0);
    const room = await b.next("room", (m) => m.room.status === "playing");
    expect(room.room.players.every((p) => !p.rematch)).toBe(true);
  });
});

describe("timer and disconnections", () => {
  it("time out: default decision, then loss after 3 expirations", async () => {
    const port = await start({ decisionMs: 120, maxTimeouts: 3 });
    const { a, b } = await pair(port, false);
    b.bot = true; // only Bob plays; Alice never answers
    b.play(b.lastView as NonNullable<typeof b.lastView>);
    const end = await a.next("update", (m) => m.view.over, 30_000);
    expect(end.view.winner).toBe("p2");
    expect(end.view.players.p1?.lost).toBe(true);
    const clocked = a.received.filter((m) => m.type === "update" && m.clock?.player === "p1");
    expect(clocked.length).toBeGreaterThan(0);
  });

  it("reconnection with the token: view restored, the game goes on", async () => {
    const port = await start({ graceMs: 5_000 });
    const { a, b } = await pair(port, false);
    const bRoom = b.received.find((m) => m.type === "room");
    const token = bRoom?.type === "room" ? bRoom.room.token : "";
    await b.close();
    const off = await a.next("opponent", (m) => !m.connected);
    expect(off.remainingMs).toBeGreaterThan(0);
    const b2 = await Client.connect(port);
    clients.push(b2);
    b2.send({ type: "rejoin", token });
    const room = await b2.next("room");
    expect(room.room.seat).toBe("p2");
    const up = await b2.next("update");
    expect(up.view.viewer).toBe("p2");
    expect((await a.next("opponent", (m) => m.connected)).connected).toBe(true);
    // An unknown token is refused.
    const c = await Client.connect(port);
    clients.push(c);
    c.send({ type: "rejoin", token: "wrong" });
    expect((await c.next("error")).code).toBe("token");
  });

  it("with no return within the delay, the disconnected player loses", async () => {
    const port = await start({ graceMs: 150 });
    const { a, b } = await pair(port, false);
    await b.close();
    const end = await a.next("update", (m) => m.view.over, 5_000);
    expect(end.view.winner).toBe("p1");
  });
});

describe("Internet exposure", () => {
  it('/healthz: details in JSON for a direct local request, "ok" only through nginx', async () => {
    const port = await start();
    await pair(port, false);
    const res = await fetch(`http://127.0.0.1:${port}/healthz`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; rooms: number; rules: number; memory: { heapUsedMb: number } };
    expect(body).toMatchObject({ ok: true, rooms: 1, rules: RULES_VERSION, images: { breaker: false } });
    expect(body.memory.heapUsedMb).toBeGreaterThan(0);
    const proxied = await fetch(`http://127.0.0.1:${port}/healthz`, { headers: { "X-Real-IP": "203.0.113.9" } });
    expect(await proxied.text()).toBe("ok\n");
  });

  it("address key of the ceilings: IPv4, or /64 prefix in IPv6", () => {
    expect(ipKey("203.0.113.9")).toBe("203.0.113.9");
    expect(ipKey("::ffff:203.0.113.9")).toBe("203.0.113.9");
    expect(ipKey("2001:db8:1:2:aaaa::1")).toBe("2001:db8:1:2::/64");
    expect(ipKey("2001:0db8:0001:0002:bbbb:cccc:dddd:eeee")).toBe("2001:db8:1:2::/64");
    expect(ipKey("2001:db8::1")).toBe("2001:db8:0:0::/64");
  });

  it("refuses new rooms beyond the limit", async () => {
    const port = await start({ maxRooms: 1 });
    const a = await Client.connect(port);
    const b = await Client.connect(port);
    clients.push(a, b);
    a.send({ type: "create", name: "A", deck: VOL1 });
    await a.next("room");
    b.send({ type: "create", name: "B", deck: VOL1 });
    expect((await b.next("error")).code).toBe("busy");
  });

  it("refuses new rooms when the heap exceeds maxHeapMb (before pm2 restarts the server)", async () => {
    const port = await start({ maxHeapMb: 1 });
    const a = await Client.connect(port);
    clients.push(a);
    a.send({ type: "create", name: "A", deck: VOL1 });
    expect((await a.next("error")).code).toBe("busy");
  });

  it("limits simultaneous connections per address (nginx: X-Real-IP, otherwise the last of X-Forwarded-For)", async () => {
    const port = await start({}, { maxPerIp: 2 });
    // The client fills the start of X-Forwarded-For as it likes; nginx appends the real address at the end.
    let spoof = 0;
    const open = (ip: string) =>
      new Promise<{ ws: WebSocket; code: number | null }>((ok) => {
        spoof++;
        const headers = spoof % 2 ? { "X-Forwarded-For": `192.168.9.${spoof}, ${ip}` } : { "X-Real-IP": ip };
        const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers });
        let settled = false;
        ws.once("close", (code) => {
          if (!settled) ok({ ws, code });
          settled = true;
        });
        ws.once("open", () =>
          setTimeout(() => {
            if (!settled) ok({ ws, code: null });
            settled = true;
          }, 150),
        );
      });
    const conns = [await open("10.0.0.1"), await open("10.0.0.1"), await open("10.0.0.1"), await open("10.0.0.2")];
    expect(conns.map((c) => c.code)).toEqual([null, null, 1013, null]);
    for (const c of conns) c.ws.terminate();
  });

  it("accepts the WebSocket only from the same host or an allowed origin", async () => {
    const port = await start({});
    const tryOrigin = (origin: string) =>
      new Promise<boolean>((ok) => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { Origin: origin } });
        ws.once("open", () => {
          ws.terminate();
          ok(true);
        });
        ws.once("error", () => ok(false));
      });
    expect(await tryOrigin(`http://127.0.0.1:${port}`)).toBe(true);
    expect(await tryOrigin("https://malicious-site.example")).toBe(false);
    const other = await startServer({ port: 0, host: "127.0.0.1", aiWorkers: 0, allowedOrigins: ["https://ff.example.org"] });
    const ok = await new Promise<boolean>((done) => {
      const ws = new WebSocket(`ws://127.0.0.1:${other.port}/ws`, { headers: { Origin: "https://ff.example.org" } });
      ws.once("open", () => {
        ws.terminate();
        done(true);
      });
      ws.once("error", () => done(false));
    });
    await other.close();
    expect(ok).toBe(true);
  });

  it("caps open rooms per address (rooms abandoned in a loop)", async () => {
    const port = await start({ maxRoomsPerIp: 2 });
    for (let i = 0; i < 2; i++) {
      const c = await Client.connect(port);
      clients.push(c);
      c.send({ type: "create", name: `J${i}`, deck: VOL1 });
      await c.next("room");
      await c.close();
    }
    const c = await Client.connect(port);
    clients.push(c);
    c.send({ type: "create", name: "J2", deck: VOL1 });
    expect((await c.next("error")).code).toBe("busy");
  });

  it("a connection that no longer answers pings is closed (normal return delay)", async () => {
    const port = await start({ graceMs: 10_000 }, { pingMs: 100 });
    const a = await Client.connect(port);
    clients.push(a);
    a.send({ type: "create", name: "Alice", deck: VOL1 });
    const { room } = await a.next("room");
    // "Dead" client: it does not answer pings.
    const dead = new WebSocket(`ws://127.0.0.1:${port}/ws`, { autoPong: false });
    await new Promise((ok) => dead.once("open", ok));
    dead.send(JSON.stringify({ type: "join", code: room.code, name: "Bob", deck: VOL1, version: VERSION }));
    const off = await a.next("opponent", (m) => !m.connected, 3_000);
    expect(off.remainingMs).toBeGreaterThan(0);
    dead.terminate();
  });

  it("rate-limits messages, then closes a connection that persists", async () => {
    const port = await start({}, { rate: { perSecond: 1, burst: 5 } });
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise((ok) => ws.once("open", ok));
    const errors: string[] = [];
    ws.on("message", (data) => errors.push(JSON.parse(String(data)).code));
    const closed = new Promise<number>((ok) => ws.once("close", ok));
    for (let i = 0; i < 400; i++) ws.send(JSON.stringify({ type: "decision", decision: { type: "pass" } }));
    expect(await closed).toBe(1008);
    // 5 messages handled ("no game"), then a single rate warning.
    expect(errors.filter((c) => c === "state")).toHaveLength(5);
    expect(errors.filter((c) => c === "busy")).toHaveLength(1);
  });

  it("a room left without an opponent is closed", async () => {
    const port = await start({ waitingMs: 150 });
    const a = await Client.connect(port);
    clients.push(a);
    a.send({ type: "create", name: "Alice", deck: VOL1 });
    await a.next("room");
    expect((await a.next("error", () => true, 3_000)).code).toBe("closed");
    expect(srv?.rooms.size).toBe(0);
  });
});
