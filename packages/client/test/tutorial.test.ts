/**
 * Each tutorial lesson is replayed without a browser (from Planecircle): staged game, scripted opponent, and for each
 * step the decision it expects (deduced from `allow`). Every step must finish, in order: otherwise a player following
 * the guide would be stuck. Questions of the engine that a step does not plan are answered with its suggestion, as the
 * player may do at any time.
 */
import { aiAgent } from "@finalcircle/ai";
import { card } from "@finalcircle/cards";
import { type GameEvent, GameHost, type GameView } from "@finalcircle/engine";
import { describe, expect, it } from "vitest";
import { buildScenario, YOU } from "../src/scenario";
import { LESSONS } from "../src/tutorial/lessons";
import { type Ctx, damageOf, inBreakZone, matches, onField, solve } from "../src/tutorial/runtime";

/** What the lesson texts claim about the outcome of the game. */
const OUTCOMES: Record<string, (c: Ctx) => void> = {
  cp: (c) => {
    expect(onField("18-003C")(c)).toBe(true);
    expect(onField("27-122S")(c)).toBe(true);
  },
  forwards: (c) => {
    expect(onField("27-128S")(c)).toBe(true);
    expect(damageOf(c, "opponent")).toBe(1);
  },
  battle: (c) => {
    expect(inBreakZone("22-068R", "opponent")(c)).toBe(true);
    expect(damageOf(c, "opponent")).toBe(4);
  },
  block: (c) => {
    expect(inBreakZone("12-120C", "opponent")(c)).toBe(true);
    expect(onField("27-128S")(c)).toBe(true);
    expect(damageOf(c, "you")).toBe(1);
  },
  summons: (c) => {
    expect(inBreakZone("16-092C", "opponent")(c)).toBe(true);
    expect(inBreakZone("20-103H", "opponent")(c)).toBe(true);
    expect(onField("27-122S")(c)).toBe(true);
  },
  abilities: (c) => {
    expect(inBreakZone("27-125S", "opponent")(c)).toBe(true);
    expect(inBreakZone("19-052C", "opponent")(c)).toBe(true);
    expect(damageOf(c, "opponent")).toBe(3);
  },
  exburst: (c) => {
    expect(inBreakZone("12-120C", "opponent")(c)).toBe(true);
    expect(damageOf(c, "you")).toBe(3);
  },
  limit: (c) => {
    expect(onField("22-112R")(c)).toBe(true);
    expect(inBreakZone("24-063H", "opponent")(c)).toBe(true);
  },
  game: (c) => expect(c.view.over).toBe(true),
};

async function play(lessonId: string): Promise<Ctx> {
  const lesson = LESSONS.find((l) => l.id === lessonId);
  if (!lesson) throw new Error(lessonId);
  const { state, events, opponent } = buildScenario(lesson.scenario, card, 1);
  let view: GameView | null = null;
  let last: GameEvent[] = [];
  const host = new GameHost(
    state,
    {
      agents: { p2: opponent },
      onUpdate: (_p, v, e) => {
        view = v;
        last = e;
      },
    },
    events,
  );
  await host.run();
  let hovered: string | null = null;
  const ctx = (): Ctx => ({ view: view as unknown as GameView, events: last, hovered });
  const human = aiAgent("beginner", { seed: 3 });
  for (const [i, step] of lesson.steps.entries()) {
    const where = `${lessonId}, step ${i + 1}`;
    if (step.settings) host.setSettings(YOU, step.settings);
    if (step.next) continue;
    for (let n = 0; ; n++) {
      if (n > (step.free ? 3000 : 30)) throw new Error(`${where}: the step does not finish`);
      const c = ctx();
      if (step.until?.(c)) break;
      if (c.view.over) throw new Error(`${where}: game over before the end of the step`);
      if (step.free) {
        const err = await host.submitHuman(YOU, human(host.state, YOU));
        if (err) throw new Error(`${where}: ${err}`);
        continue;
      }
      const allow = (step.allow ?? []).find((a) => solve(a, c.view));
      const intent = allow ? solve(allow, c.view) : null;
      if (!allow || !intent) {
        // A step that points at a card to look at: the player hovers it.
        const t = step.target;
        if (typeof t === "object" && hovered !== t.card) {
          hovered = t.card;
          continue;
        }
        // A question the step does not plan (a target, a split): answered with its suggestion.
        const p = c.view.pending;
        if (p?.player === c.view.viewer && (p.kind === "choice" || p.kind === "discard")) {
          const err = await host.submitHuman(
            YOU,
            p.kind === "choice"
              ? { type: "choose", values: p.request?.suggested ?? [] }
              : { type: "discard", cards: c.view.hand.slice(0, p.count).map((o) => o.id) },
          );
          if (err) throw new Error(`${where}: ${err}`);
          continue;
        }
        throw new Error(
          `${where}: nothing to do (pending decision: ${JSON.stringify(c.view.pending)}, turn ${c.view.turn.number} ${c.view.turn.phase}, hand ${c.view.hand.map((o) => o.defId)})`,
        );
      }
      // The deduced decision must pass the guidance guard.
      expect(matches(allow, intent, c.view), where).toBe(true);
      if (intent.type === "endTurn") {
        host.setSettings(YOU, { passUntilTurn: c.view.turn.number });
        await host.run();
        continue;
      }
      const err = await host.submitHuman(YOU, intent);
      if (err) throw new Error(`${where}: ${err}`);
    }
  }
  return ctx();
}

describe("tutorial", () => {
  for (const lesson of LESSONS) {
    it(`lesson "${lesson.id}": every step finishes`, async () => {
      const end = await play(lesson.id);
      OUTCOMES[lesson.id]?.(end);
    });
  }

  it("lesson ids are unique, and there are ten lessons", () => {
    expect(new Set(LESSONS.map((l) => l.id)).size).toBe(LESSONS.length);
    expect(LESSONS.length).toBe(10);
  });
});
