/**
 * Engine events → sound effects (pure function, tested; from Planecircle): which sound, and when. Damage, breaks and
 * player damage move one step (0.22 s) forward each, so that a series is heard one hit after the other.
 */
import type { CardFace, Element, GameEvent, GameView } from "@finalcircle/engine";
import type { SoundKey } from "./sounds";

export interface Cue {
  key: SoundKey;
  /** Seconds after the update is received. */
  delay: number;
  /** Volume multiplier (stacks of grouped sounds: a little louder). */
  gain: number;
}

const STEP = 0.22;
const MAX_DELAY = 2.2;
/** Beyond this, a series of the same sound (a Summon breaking every Forward) is played only once, louder. */
const MAX_REPEAT = 3;
/** Damage to a Forward from this amount is a heavy hit. */
const HEAVY = 7000;

const ELEMENT_CUE: Record<Element, SoundKey> = {
  fire: "castFire",
  ice: "castIce",
  wind: "castWind",
  earth: "castEarth",
  lightning: "castLightning",
  water: "castWater",
  light: "castLight",
  dark: "castDark",
};

/** The cue of a card's elements: its element, or the Multi-Element one. */
export function elementCue(face: CardFace | undefined): SoundKey {
  const els = face?.elements ?? [];
  if (els.length > 1) return "castMulti";
  return els[0] ? ELEMENT_CUE[els[0]] : "castMulti";
}

export function soundsFor(events: GameEvent[], view: GameView, faces: Record<string, CardFace>): Cue[] {
  const cues: Cue[] = [];
  let step = 0;
  const at = () => Math.min(step * STEP, MAX_DELAY);
  const add = (key: SoundKey) => cues.push({ key, delay: at(), gain: 1 });
  const addStep = (key: SoundKey) => {
    add(key);
    step += 1;
  };
  const me = view.viewer;

  for (const e of events) {
    switch (e.type) {
      case "gameStart":
        add("shuffle");
        break;
      case "mulligan":
        if (e.player === me) add("shuffle");
        break;
      case "turn":
        if (e.player === me) add("turn");
        break;
      case "draw":
        if (e.player === me) add("draw");
        break;
      case "cp":
        if (e.dulled.length) add("dull");
        break;
      case "cast": {
        const face = faces[e.defId];
        add(face?.type === "Summon" ? "cast" : "place");
        add(elementCue(face));
        break;
      }
      case "activate":
      case "trigger":
        add("ability");
        break;
      case "fizzle":
        add("fizzle");
        break;
      case "attack":
        if (e.attackers.length) add("attack");
        break;
      case "block":
        if (e.blocker) add("block");
        break;
      case "damage":
        if (e.amount > 0) addStep(e.amount >= HEAVY ? "hitHeavy" : "hit");
        break;
      case "playerDamage":
        if (e.amount > 0) addStep("hitHeavy");
        break;
      case "moved":
        if (e.from === "field" && e.to === "break" && e.broken) addStep("break");
        break;
      case "exBurst":
        if (e.used) add("exBurst");
        break;
      case "lbFlip":
        add("lbFlip");
        break;
      case "gameOver":
        add(e.winner === me ? "win" : "lose");
        break;
      default:
        break;
    }
  }
  return collapse(cues);
}

/** A series of more than MAX_REPEAT identical sounds becomes a single sound, a little louder. */
function collapse(cues: Cue[]): Cue[] {
  const counts = new Map<SoundKey, number>();
  for (const c of cues) counts.set(c.key, (counts.get(c.key) ?? 0) + 1);
  const seen = new Set<SoundKey>();
  const out: Cue[] = [];
  for (const c of cues) {
    if ((counts.get(c.key) ?? 0) <= MAX_REPEAT) out.push(c);
    else if (!seen.has(c.key)) {
      seen.add(c.key);
      out.push({ ...c, gain: 1.3 });
    }
  }
  return out;
}
