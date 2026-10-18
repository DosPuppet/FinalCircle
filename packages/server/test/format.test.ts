/** Room format: Standard or L3, chosen at creation and imposed on whoever joins (the decks are checked by the server). */
import { plainText } from "@finalcircle/engine";
import { afterEach, describe, expect, it } from "vitest";
import type { RunningServer } from "../src/index";
import { Client, server, VOL1, VOL2 } from "./helpers";

let srv: RunningServer | null = null;
const clients: Client[] = [];
afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.close()));
  await srv?.close();
  srv = null;
});

async function two() {
  srv = await server({}, { aiWorkers: 1 });
  const a = await Client.connect(srv.port);
  const b = await Client.connect(srv.port);
  clients.push(a, b);
  return { a, b };
}

describe("room format", () => {
  it("a Standard room by default: the starter decks are legal there", async () => {
    const { a, b } = await two();
    a.send({ type: "create", name: "Alice", deck: VOL1 });
    const created = await a.next("room");
    expect(created.room.match.format).toBeUndefined();
    b.send({ type: "join", code: created.room.code, name: "Bob", deck: VOL2 });
    expect((await b.next("room", (m) => m.room.status === "playing")).room.players).toHaveLength(2);
  });

  it("in L3 (the latest three booster sets), the starter decks are refused, with the card and its set", async () => {
    const { a } = await two();
    a.send({ type: "create", name: "Alice", deck: VOL1, format: "l3" });
    const refused = await a.next("error");
    expect(refused.code).toBe("deck");
    expect(plainText(refused.message)).toMatch(/is not legal in L3/);
  });

  it("an unknown format is Standard; the AI needs a deck legal in the room's format", async () => {
    const { a, b } = await two();
    a.send({ type: "create", name: "Alice", deck: VOL1, format: "vintage" } as never);
    expect((await a.next("room")).room.match.format).toBeUndefined();
    b.send({ type: "create", name: "Bob", deck: VOL2, format: "l3", ai: { level: "beginner" } });
    expect((await b.next("error")).code).toBe("deck");
  });
});
