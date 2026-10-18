import type { CardFace, GameEvent, GameView } from "@finalcircle/engine";
import { describe, expect, it } from "vitest";
import { elementCue, soundsFor } from "../src/audio/eventSounds";

const view = { viewer: "p1" } as GameView;
const face = (defId: string, type: CardFace["type"], elements: CardFace["elements"]) => ({ defId, type, elements }) as CardFace;
const faces = {
  fwd: face("fwd", "Forward", ["fire"]),
  sum: face("sum", "Summon", ["lightning"]),
  multi: face("multi", "Forward", ["water", "fire"]),
};
const keys = (events: GameEvent[]) => soundsFor(events, view, faces).map((c) => c.key);

describe("event sounds", () => {
  it("a Character is put onto the field, a Summon goes onto the stack, each with its element's cue", () => {
    expect(keys([{ type: "cast", player: "p1", card: "o1", defId: "fwd", from: "hand" }])).toEqual(["place", "castFire"]);
    expect(keys([{ type: "cast", player: "p2", card: "o2", defId: "sum", from: "hand", stackId: "s1" }])).toEqual([
      "cast",
      "castLightning",
    ]);
    expect(elementCue(faces.multi)).toBe("castMulti");
  });

  it("damage, breaks and player damage follow one another", () => {
    const cues = soundsFor(
      [
        { type: "damage", target: "o1", amount: 8000, battle: true },
        { type: "moved", id: "o1", newId: "o9", defId: "fwd", owner: "p2", from: "field", to: "break", broken: true },
        { type: "playerDamage", player: "p2", amount: 1, cards: ["o5"] },
      ],
      view,
      faces,
    );
    expect(cues.map((c) => c.key)).toEqual(["hitHeavy", "break", "hitHeavy"]);
    expect(cues.map((c) => c.delay)).toEqual([0, 0.22, 0.44]);
  });

  it("only the viewer's own draws and turns are heard; EX Bursts only when used", () => {
    expect(keys([{ type: "draw", player: "p2", count: 2 }])).toEqual([]);
    expect(keys([{ type: "turn", number: 2, player: "p1" }])).toEqual(["turn"]);
    expect(keys([{ type: "exBurst", player: "p1", card: "o3", defId: "fwd", used: false }])).toEqual([]);
    expect(keys([{ type: "exBurst", player: "p2", card: "o3", defId: "fwd", used: true }])).toEqual(["exBurst"]);
  });

  it("a long series of the same sound is played once, louder", () => {
    const events: GameEvent[] = Array.from({ length: 5 }, (_, i) => ({
      type: "damage",
      target: `o${i}`,
      amount: 1000,
      battle: false,
    }));
    const cues = soundsFor(events, view, faces);
    expect(cues).toEqual([{ key: "hit", delay: 0, gain: 1.3 }]);
  });
});
