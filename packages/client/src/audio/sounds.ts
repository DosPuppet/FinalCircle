/**
 * Table of the sound effects (from Planecircle): stable key → recorded samples (randomly drawn variants, public/sounds/)
 * for the physical sounds (cards, shuffle: Kenney CC0 samples, see public/sounds/LICENSE-kenney.txt), or a synthesized
 * cue (synth.ts, loaded on demand) for the musical and magical ones. Changing a sound = changing one line here (or its
 * cue in synth.ts).
 */
import type { SynthId } from "./synth";

export type SoundDef =
  | {
      files: string[];
      /** Relative volume (0 to 1), before the master volume. */
      volume: number;
      /** No pitch variation (jingles). */
      steady?: boolean;
    }
  | { synth: SynthId; volume: number };

const range = (prefix: string, ids: (string | number)[]) => ids.map((i) => `${prefix}${i}.ogg`);
const synth = (id: SynthId, volume = 1): SoundDef => ({ synth: id, volume });

export const SOUNDS = {
  shuffle: { files: ["card-shuffle.ogg"], volume: 0.6 },
  draw: { files: range("card-slide-", [1, 2, 3, 5]), volume: 0.55 },
  // A Character put onto the field (it does not use the stack, CR 11.4.1).
  place: { files: range("card-place-", [1, 2, 3, 4]), volume: 0.7 },
  // A Summon or an ability: the card slides onto the stack, and a cue of its element.
  cast: { files: range("card-shove-", [1, 2, 3, 4]), volume: 0.55 },
  castFire: synth("castFire", 1.3),
  castIce: synth("castIce", 1.5),
  castWind: synth("castWind", 1.3),
  castEarth: synth("castEarth"),
  castLightning: synth("castLightning", 1.2),
  castWater: synth("castWater", 1.4),
  castLight: synth("castLight"),
  castDark: synth("castDark"),
  castMulti: synth("castMulti"),
  ability: synth("ability"),
  fizzle: synth("fizzle", 1.4),
  attack: synth("attack"),
  block: synth("block"),
  hit: synth("hit"),
  hitHeavy: synth("hitHeavy"),
  break: synth("break"),
  exBurst: synth("exBurst"),
  lbFlip: synth("lbFlip"),
  turn: synth("turn"),
  // Backups dulled for CP.
  dull: { files: range("card-shove-", [1, 2, 3, 4]), volume: 0.25 },
  click: synth("click"),
  error: synth("error"),
  win: synth("win"),
  lose: synth("lose"),
} satisfies Record<string, SoundDef>;

export type SoundKey = keyof typeof SOUNDS;

export const SOUND_FILES: string[] = [
  ...new Set(Object.values(SOUNDS as Record<string, SoundDef>).flatMap((s) => ("files" in s ? s.files : []))),
];
