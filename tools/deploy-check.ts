/**
 * Checks a running FinalCircle server end to end, as a player would reach it: `/healthz`, the page with its security
 * headers, a script of the built client, the web manifest and the service worker, a card image through the relay (an
 * exclusive from the server's store), then online play over the WebSocket: two players create and join a room, the game
 * starts, both leave; a third plays against the server's AI until the AI has played its turn. Without a URL, the compiled server (`npm run build` and `npm run build:server` first) is started
 * on a free port with its games in memory, and stopped at the end.
 *
 * Usage: npx tsx tools/deploy-check.ts [https://ff.mydomain.example]
 */
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { WebSocket } from "ws";
import { deckById } from "../packages/cards/src/index";
import { RULES_VERSION } from "../packages/engine/src/index";
import { PROTOCOL_VERSION, type ServerMessage } from "../packages/server/src/protocol";

const errors: string[] = [];
const fail = (why: string) => errors.push(why);

function freePort(): Promise<number> {
  return new Promise((ok) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => ok(port));
    });
  });
}

let base = (process.argv[2] ?? "").replace(/\/$/, "");
let child: ChildProcess | null = null;
if (!base) {
  if (!existsSync("packages/server/dist/main.mjs") || !existsSync("packages/client/dist/index.html")) {
    console.error("Build first: npm run build && npm run build:server");
    process.exit(2);
  }
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  child = spawn("node", ["packages/server/dist/main.mjs"], {
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", FC_DATA_DIR: "off", FC_AI_WORKERS: "1" },
    stdio: ["ignore", "ignore", "inherit"],
  });
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(`${base}/healthz`)).ok) break;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
}

try {
  // 1. Health and versions (the details only for a direct local request).
  const health = await fetch(`${base}/healthz`);
  const body = await health.text();
  if (!health.ok) fail(`/healthz answered ${health.status}`);
  else if (body.startsWith("{")) {
    const h = JSON.parse(body) as { rules?: number; protocol?: number; build?: string };
    if (h.rules !== RULES_VERSION || h.protocol !== PROTOCOL_VERSION)
      fail(`server versions (rules ${h.rules}, protocol ${h.protocol}) differ from this repository's`);
    console.log(`healthz: build ${h.build}, rules ${h.rules}, protocol ${h.protocol}`);
  } else console.log(`healthz: ${body.trim()}`);

  // 2. The page, its headers and its files.
  const page = await fetch(`${base}/`);
  const html = await page.text();
  if (!page.ok || !html.includes("<title>FinalCircle</title>")) fail(`the page is not served (${page.status})`);
  const csp = page.headers.get("content-security-policy") ?? "";
  if (!csp.includes("script-src 'self'") || !csp.includes("frame-ancestors 'none'")) fail(`unexpected CSP: ${csp}`);
  const script = /src="(\/assets\/[^"]+\.js)"/.exec(html)?.[1];
  if (!script) fail("no script in the page");
  else {
    const js = await fetch(`${base}${script}`, { headers: { "Accept-Encoding": "br, gzip" } });
    if (!js.ok || !/immutable/.test(js.headers.get("cache-control") ?? "")) fail(`${script}: ${js.status}, not cached`);
  }
  for (const path of ["/manifest.webmanifest", "/sw.js", "/icons/icon.svg"])
    if (!(await fetch(`${base}${path}`)).ok) fail(`${path} is missing`);

  // 3. A card image through the relay: an exclusive, from the server's store.
  const image = await fetch(`${base}/ffimg/thumbs/27-123S_eg.jpg`);
  if (image.status !== 200 || !(image.headers.get("content-type") ?? "").startsWith("image/"))
    fail(`/ffimg/thumbs/27-123S_eg.jpg answered ${image.status} (tools/missing-images.ts run on the server?)`);
  else console.log(`image relay: ok${image.headers.get("x-cache") ? ` (X-Cache: ${image.headers.get("x-cache")})` : ""}`);

  // 4. Online play: two players, a room, the game starts.
  const wsUrl = `${base.replace(/^http/, "ws")}/ws`;
  const version = { protocol: PROTOCOL_VERSION, rules: RULES_VERSION };
  const deck = (id: string) => {
    const d = deckById(id);
    if (!d) throw new Error(id);
    return { main: d.main, lb: d.lb };
  };
  const open = () =>
    new Promise<{ ws: WebSocket; next: (type: ServerMessage["type"]) => Promise<ServerMessage> }>((ok, ko) => {
      const ws = new WebSocket(wsUrl, { headers: { Origin: base } });
      const inbox: ServerMessage[] = [];
      const waiters: (() => void)[] = [];
      ws.on("message", (d) => {
        inbox.push(JSON.parse(String(d)) as ServerMessage);
        for (const w of waiters.splice(0)) w();
      });
      const next = async (type: ServerMessage["type"]) => {
        const end = Date.now() + 15_000;
        for (;;) {
          const i = inbox.findIndex((m) => m.type === type || m.type === "error");
          if (i >= 0) return inbox.splice(i, 1)[0] as ServerMessage;
          if (Date.now() > end) throw new Error(`no "${type}" message`);
          await new Promise<void>((r) => {
            waiters.push(r);
            setTimeout(r, 500);
          });
        }
      };
      ws.once("open", () => ok({ ws, next }));
      ws.once("error", ko);
    });
  const a = await open();
  a.ws.send(JSON.stringify({ type: "create", name: "Check A", deck: deck("starter-2025-vol1"), version }));
  const room = await a.next("room");
  if (room.type !== "room") fail(`room not created: ${JSON.stringify(room)}`);
  else {
    const b = await open();
    b.ws.send(JSON.stringify({ type: "join", code: room.room.code, name: "Check B", deck: deck("starter-2025-vol2"), version }));
    const [ua, ub] = await Promise.all([a.next("update"), b.next("update")]);
    if (ua.type !== "update" || ub.type !== "update") fail(`the game did not start: ${JSON.stringify([ua, ub])}`);
    else console.log(`online play: room ${room.room.code}, game started`);
    for (const c of [a, b]) c.ws.send(JSON.stringify({ type: "leave" }));
    await new Promise((r) => setTimeout(r, 200));
    b.ws.close();
  }
  a.ws.close();

  // 5. Against the server's AI (its worker file next to the compiled server): the human answers as simply as possible
  // until the AI has played a turn of its own.
  const c = await open();
  c.ws.send(
    JSON.stringify({ type: "create", name: "Check C", deck: deck("starter-2025-vol1"), ai: { level: "beginner" }, version }),
  );
  let aiTurn = false;
  for (let i = 0; i < 200 && !aiTurn; i++) {
    const m = await c.next("update");
    if (m.type !== "update") {
      fail(`game against the AI: ${JSON.stringify(m)}`);
      break;
    }
    const v = m.view;
    aiTurn = v.turn.active === "p2" && v.turn.number >= 2;
    const p = v.pending;
    if (aiTurn || !p || p.player !== v.viewer) continue;
    const decision =
      p.kind === "mulligan"
        ? { type: "keep" }
        : p.kind === "choice"
          ? { type: "choose", values: p.request?.suggested ?? [] }
          : p.kind === "declareAttack"
            ? { type: "endAttacks" }
            : p.kind === "declareBlock"
              ? { type: "block", blocker: null }
              : p.kind === "discard"
                ? { type: "discard", cards: v.hand.slice(0, p.count).map((o) => o.id) }
                : { type: "pass" };
    c.ws.send(JSON.stringify({ type: "decision", decision }));
  }
  if (!aiTurn) fail("the server's AI did not play its turn");
  else console.log("server AI: plays its turn");
  c.ws.send(JSON.stringify({ type: "leave" }));
  await new Promise((r) => setTimeout(r, 200));
  c.ws.close();
} catch (e) {
  fail(e instanceof Error ? e.message : String(e));
} finally {
  child?.kill();
}

for (const e of errors) console.log(e);
console.log(errors.length ? `FAILED: ${errors.length} problem(s)` : `ok: ${base} serves the game, the images and online play`);
if (errors.length) process.exit(1);
