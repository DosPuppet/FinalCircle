/**
 * Synthesized sound cues (Web Audio, from Planecircle), loaded on demand by sfx.ts: the musical and magical sounds of
 * the game, while the physical ones (cards, shuffle) stay recorded samples (sounds.ts). Everything is in D, so the cues
 * sound like one family; a shared reverb and a gentle compressor glue them. Small random detuning keeps repeats alive.
 *
 * Instruments: FM bell, wooden pluck, glass, brass, pad (detuned saws), filtered noise, drum thump.
 */

export type SynthId =
  | "castFire"
  | "castIce"
  | "castWind"
  | "castEarth"
  | "castLightning"
  | "castWater"
  | "castLight"
  | "castDark"
  | "castMulti"
  | "ability"
  | "fizzle"
  | "attack"
  | "block"
  | "hit"
  | "hitHeavy"
  | "break"
  | "exBurst"
  | "lbFlip"
  | "turn"
  | "click"
  | "error"
  | "win"
  | "lose";

interface Bus {
  c: AudioContext;
  dry: AudioNode;
  wet: AudioNode;
  noise: AudioBuffer;
}

const buses = new WeakMap<AudioNode, Bus>();

/** Hall reverb from a generated impulse response (decaying stereo noise), and a compressor before the output. */
function busOf(c: AudioContext, out: AudioNode): Bus {
  const known = buses.get(out);
  if (known) return known;
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 3;
  comp.attack.value = 0.005;
  comp.release.value = 0.2;
  comp.connect(out);
  const len = Math.floor(c.sampleRate * 2.2);
  const ir = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3.2;
  }
  const verb = c.createConvolver();
  verb.buffer = ir;
  const wet = c.createGain();
  wet.gain.value = 0.55;
  wet.connect(verb).connect(comp);
  const noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
  const n = noise.getChannelData(0);
  for (let i = 0; i < n.length; i++) n[i] = Math.random() * 2 - 1;
  const bus = { c, dry: comp, wet, noise };
  buses.set(out, bus);
  return bus;
}

/** MIDI note → frequency, with a small random detune (cents) shared by a whole cue. */
let detune = 0;
const hz = (note: number) => 440 * 2 ** ((note - 69 + detune / 100) / 12);
// Notes (D-centred): D3 50, A3 57, D4 62, E4 64, F4 65, F#4 66, A4 69, B4 71, C5 72, D5 74, E5 76, F#5 78, A5 81, D6 86.

/** An output for a voice: dry, and `send` to the reverb. */
function voice(b: Bus, send: number): GainNode {
  const g = b.c.createGain();
  g.gain.value = 0;
  g.connect(b.dry);
  if (send > 0) {
    const s = b.c.createGain();
    s.gain.value = send;
    g.connect(s).connect(b.wet);
  }
  return g;
}

/** Attack then exponential decay. */
function envelope(g: GainNode, t: number, attack: number, peak: number, decay: number): void {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function osc(b: Bus, type: OscillatorType, freq: number, t: number, stop: number): OscillatorNode {
  const o = b.c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.start(t);
  o.stop(stop);
  return o;
}

/** FM bell: inharmonic `ratio` for a bell, 2 for glass, 1.41 for metal. */
function bell(
  b: Bus,
  t: number,
  note: number,
  o: { dur?: number; gain?: number; ratio?: number; index?: number; send?: number } = {},
) {
  const { dur = 1.6, gain = 0.2, ratio = 3.5, index = 2, send = 0.45 } = o;
  const f = hz(note);
  const car = osc(b, "sine", f, t, t + dur + 0.1);
  const mod = osc(b, "sine", f * ratio, t, t + dur + 0.1);
  const depth = b.c.createGain();
  depth.gain.setValueAtTime(f * index, t);
  depth.gain.exponentialRampToValueAtTime(f * 0.02, t + dur);
  mod.connect(depth).connect(car.frequency);
  const out = voice(b, send);
  envelope(out, t, 0.004, gain, dur);
  car.connect(out);
}

/** Wooden pluck (marimba): the fundamental and a short fourth harmonic. */
function pluck(b: Bus, t: number, note: number, o: { dur?: number; gain?: number; send?: number } = {}) {
  const { dur = 0.7, gain = 0.25, send = 0.25 } = o;
  const f = hz(note);
  const out = voice(b, send);
  envelope(out, t, 0.003, gain, dur);
  osc(b, "sine", f, t, t + dur + 0.1).connect(out);
  const click = voice(b, send);
  envelope(click, t, 0.002, gain * 0.35, dur * 0.18);
  osc(b, "sine", f * 4, t, t + dur * 0.2 + 0.05).connect(click);
}

/** Brass: a sawtooth through a low-pass that opens then closes. */
function brass(b: Bus, t: number, note: number, o: { dur?: number; gain?: number; send?: number } = {}) {
  const { dur = 0.6, gain = 0.12, send = 0.3 } = o;
  const f = hz(note);
  const lp = b.c.createBiquadFilter();
  lp.type = "lowpass";
  lp.Q.value = 2;
  lp.frequency.setValueAtTime(f * 1.2, t);
  lp.frequency.linearRampToValueAtTime(f * 6, t + 0.06);
  lp.frequency.exponentialRampToValueAtTime(f * 2, t + dur);
  const out = voice(b, send);
  envelope(out, t, 0.035, gain, dur);
  for (const cents of [-7, 7]) {
    const s = osc(b, "sawtooth", f, t, t + dur + 0.1);
    s.detune.value = cents;
    s.connect(lp);
  }
  lp.connect(out);
}

/** Pad: detuned saws, slow attack, closed low-pass. */
function pad(
  b: Bus,
  t: number,
  notes: number[],
  o: { dur?: number; gain?: number; attack?: number; cutoff?: number; send?: number } = {},
) {
  const { dur = 2, gain = 0.05, attack = 0.35, cutoff = 1400, send = 0.6 } = o;
  const lp = b.c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = cutoff;
  const out = voice(b, send);
  envelope(out, t, attack, gain, dur);
  lp.connect(out);
  for (const n of notes)
    for (const cents of [-9, 0, 9]) {
      const s = osc(b, "sawtooth", hz(n), t, t + attack + dur + 0.1);
      s.detune.value = cents;
      s.connect(lp);
    }
}

/** Filtered noise: whoosh, crackle, dust, impact body; `to`: the filter sweeps to this frequency. */
function noise(
  b: Bus,
  t: number,
  o: {
    dur?: number;
    gain?: number;
    type?: BiquadFilterType;
    freq?: number;
    to?: number;
    q?: number;
    send?: number;
    attack?: number;
  } = {},
) {
  const { dur = 0.3, gain = 0.2, type = "lowpass", freq = 1000, to, q = 0.8, send = 0.2, attack = 0.005 } = o;
  const src = b.c.createBufferSource();
  src.buffer = b.noise;
  src.loop = true;
  const f = b.c.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(freq, t);
  if (to) f.frequency.exponentialRampToValueAtTime(to, t + attack + dur);
  const out = voice(b, send);
  envelope(out, t, attack, gain, dur);
  src.connect(f).connect(out);
  src.start(t, Math.random() * 0.5);
  src.stop(t + attack + dur + 0.1);
}

/** Drum thump: a sine whose pitch drops. */
function thump(b: Bus, t: number, o: { from?: number; to?: number; dur?: number; gain?: number; send?: number } = {}) {
  const { from = 130, to = 45, dur = 0.35, gain = 0.6, send = 0.15 } = o;
  const s = osc(b, "sine", from, t, t + dur + 0.1);
  s.frequency.exponentialRampToValueAtTime(to, t + dur * 0.8);
  const out = voice(b, send);
  envelope(out, t, 0.003, gain, dur);
  s.connect(out);
}

/** Plays cue `id` at context time `t`, `gain` × its own level, on `out`. */
export function playSynth(c: AudioContext, out: AudioNode, id: SynthId, t: number, gain = 1): void {
  const b = busOf(c, out);
  detune = (Math.random() - 0.5) * 16;
  const g = (x: number) => x * gain;
  switch (id) {
    // Casting: a timbre per element.
    case "castLight": // bells, D major triad
      [74, 78, 81].forEach((n, i) => {
        bell(b, t + i * 0.07, n, { gain: g(0.12), index: 1.2, dur: 1.4 });
      });
      noise(b, t, { type: "highpass", freq: 6000, dur: 0.6, gain: g(0.03), send: 0.6 });
      break;
    case "castWater": // glass, a flowing descending phrase, and water
      [88, 83, 79, 76].forEach((n, i) => {
        bell(b, t + i * 0.06, n, { ratio: 2, index: 0.8, gain: g(0.08), dur: 0.9 });
      });
      noise(b, t, { type: "bandpass", freq: 900, to: 2400, q: 3, dur: 0.5, gain: g(0.05), attack: 0.08 });
      break;
    case "castDark": // low drone and a dark metal note
      pad(b, t, [38, 45], { dur: 1.1, gain: g(0.06), attack: 0.12, cutoff: 600 });
      bell(b, t, 50, { ratio: 1.41, index: 3, gain: g(0.14), dur: 1.4, send: 0.6 });
      break;
    case "castFire": // brass stab and crackle
      brass(b, t, 62, { gain: g(0.1), dur: 0.45 });
      brass(b, t, 69, { gain: g(0.08), dur: 0.45 });
      for (let i = 0; i < 6; i++)
        noise(b, t + 0.03 + Math.random() * 0.35, {
          type: "bandpass",
          freq: 2500 + Math.random() * 2500,
          q: 4,
          dur: 0.03,
          gain: g(0.1),
        });
      break;
    case "castEarth": // wooden fifths, and the ground
      [62, 69, 74].forEach((n, i) => {
        pluck(b, t + i * 0.06, n, { gain: g(0.2) });
      });
      thump(b, t, { from: 90, to: 55, gain: g(0.25), dur: 0.3 });
      break;
    case "castIce": // a cold metal chime, and frost
      bell(b, t, 81, { ratio: 2.76, index: 1.5, gain: g(0.1), dur: 1.2 });
      bell(b, t + 0.05, 88, { ratio: 2.76, index: 1, gain: g(0.06), dur: 1 });
      noise(b, t, { type: "highpass", freq: 7000, dur: 0.5, gain: g(0.04), send: 0.5 });
      break;
    case "castWind": // a gust rising and falling, and a light flute-like fifth
      noise(b, t, { type: "bandpass", freq: 400, to: 2600, q: 2.5, dur: 0.45, gain: g(0.12), attack: 0.12, send: 0.4 });
      noise(b, t + 0.35, { type: "bandpass", freq: 2600, to: 700, q: 2.5, dur: 0.4, gain: g(0.06), send: 0.4 });
      bell(b, t + 0.08, 81, { ratio: 1, index: 0.4, gain: g(0.07), dur: 0.9 });
      bell(b, t + 0.16, 88, { ratio: 1, index: 0.4, gain: g(0.05), dur: 0.9 });
      break;
    case "castLightning": // a crack of thunder, a zap down and a bright stab
      noise(b, t, { type: "highpass", freq: 2500, dur: 0.06, gain: g(0.2), send: 0.3 });
      {
        const s = osc(b, "sawtooth", 1800, t, t + 0.3);
        s.frequency.exponentialRampToValueAtTime(120, t + 0.25);
        const out = voice(b, 0.3);
        envelope(out, t, 0.002, g(0.06), 0.25);
        s.connect(out);
      }
      thump(b, t + 0.04, { from: 80, to: 35, gain: g(0.35), dur: 0.6, send: 0.5 });
      bell(b, t + 0.02, 86, { ratio: 1.41, index: 2.5, gain: g(0.06), dur: 0.5 });
      break;
    case "castMulti": // golden arpeggio
      [74, 76, 81, 86].forEach((n, i) => {
        bell(b, t + i * 0.05, n, { gain: g(0.1), index: 1.4, dur: 1.2 });
      });
      pad(b, t, [62, 69], { dur: 1, gain: g(0.025), attack: 0.2, cutoff: 2400 });
      break;
    case "ability":
      bell(b, t, 81, { gain: g(0.08), index: 1, dur: 0.6 });
      bell(b, t + 0.07, 86, { gain: g(0.06), index: 1, dur: 0.7 });
      break;
    case "fizzle": // the Summon falls apart: glass falling, and a whoosh down
      [86, 81, 77].forEach((n, i) => {
        bell(b, t + i * 0.06, n, { ratio: 2, index: 1.5, gain: g(0.08), dur: 0.5 });
      });
      noise(b, t, { type: "bandpass", freq: 3000, to: 300, q: 2, dur: 0.5, gain: g(0.12), attack: 0.02 });
      break;
    case "attack": // war drums and a low horn
      thump(b, t, { from: 110, to: 45, gain: g(0.5) });
      thump(b, t + 0.17, { from: 110, to: 45, gain: g(0.45) });
      brass(b, t + 0.05, 50, { gain: g(0.1), dur: 0.7 });
      noise(b, t, { type: "bandpass", freq: 500, to: 1800, q: 1.5, dur: 0.35, gain: g(0.07), attack: 0.1 });
      break;
    case "block": // metal clang
      bell(b, t, 57, { ratio: 1.41, index: 4, gain: g(0.18), dur: 0.7, send: 0.35 });
      thump(b, t, { from: 160, to: 70, gain: g(0.3), dur: 0.15 });
      noise(b, t, { type: "highpass", freq: 3500, dur: 0.12, gain: g(0.08) });
      break;
    case "hit":
      thump(b, t, { from: 140, to: 50, gain: g(0.55), dur: 0.25 });
      noise(b, t, { type: "lowpass", freq: 1400, dur: 0.12, gain: g(0.2) });
      break;
    case "hitHeavy":
      thump(b, t, { from: 100, to: 32, gain: g(0.8), dur: 0.5 });
      noise(b, t, { type: "lowpass", freq: 700, to: 150, dur: 0.45, gain: g(0.3) });
      break;
    case "exBurst": // the EX Burst: a sudden flash of bells over a brass stab and a drum
      brass(b, t, 62, { gain: g(0.11), dur: 0.5 });
      brass(b, t, 69, { gain: g(0.09), dur: 0.5 });
      thump(b, t, { from: 120, to: 45, gain: g(0.45), dur: 0.4 });
      [86, 90, 93].forEach((n, i) => {
        bell(b, t + 0.08 + i * 0.05, n, { gain: g(0.08), index: 1.6, dur: 1.3, send: 0.6 });
      });
      noise(b, t, { type: "highpass", freq: 5000, dur: 0.8, gain: g(0.05), send: 0.7, attack: 0.02 });
      break;
    case "lbFlip": // Limit Break cards turned face up: a low swell and a rising glass phrase
      pad(b, t, [50, 57], { dur: 0.9, gain: g(0.04), attack: 0.15, cutoff: 1200 });
      [74, 79, 83, 86].forEach((n, i) => {
        bell(b, t + 0.1 + i * 0.06, n, { ratio: 2, index: 0.9, gain: g(0.07), dur: 0.9 });
      });
      break;
    case "break": // a Forward broken: two falling minor notes, and dust
      pluck(b, t, 57, { gain: g(0.18), dur: 0.9, send: 0.5 });
      pluck(b, t + 0.16, 53, { gain: g(0.16), dur: 1.1, send: 0.5 });
      noise(b, t + 0.05, { type: "lowpass", freq: 2500, to: 200, dur: 0.9, gain: g(0.08), attack: 0.1, send: 0.4 });
      break;
    case "turn": // harp glissando up the D pentatonic, and a soft bell
      [62, 64, 69, 71, 74].forEach((n, i) => {
        pluck(b, t + i * 0.045, n, { gain: g(0.12), dur: 0.8, send: 0.4 });
      });
      bell(b, t + 0.25, 86, { gain: g(0.05), index: 0.8, dur: 1.2 });
      break;
    case "click": {
      const s = osc(b, "sine", 1800, t, t + 0.05);
      s.frequency.exponentialRampToValueAtTime(900, t + 0.02);
      const out = voice(b, 0);
      envelope(out, t, 0.001, g(0.08), 0.025);
      s.connect(out);
      break;
    }
    case "error": // two soft low notes, falling
      pluck(b, t, 64, { gain: g(0.16), dur: 0.25, send: 0.1 });
      pluck(b, t + 0.11, 60, { gain: g(0.16), dur: 0.35, send: 0.1 });
      break;
    case "win": // fanfare: horn call, then bells and a D major chord
      [62, 69, 74].forEach((n, i) => {
        brass(b, t + i * 0.18, n, { gain: g(0.1), dur: 0.5 });
      });
      [78, 81, 86].forEach((n) => {
        bell(b, t + 0.6, n, { gain: g(0.09), index: 1.2, dur: 2.4, send: 0.6 });
      });
      brass(b, t + 0.6, 74, { gain: g(0.09), dur: 1.4 });
      pad(b, t + 0.55, [50, 57, 66], { dur: 2.6, gain: g(0.05), attack: 0.3, cutoff: 2200 });
      thump(b, t + 0.6, { from: 90, to: 40, gain: g(0.4), dur: 0.5 });
      break;
    case "lose": // a slow D minor descent
      [69, 65, 62].forEach((n, i) => {
        bell(b, t + i * 0.38, n, { gain: g(0.11), index: 0.9, dur: 1.8, send: 0.7 });
      });
      pad(b, t + 0.1, [50, 53, 57], { dur: 2.8, gain: g(0.05), attack: 0.6, cutoff: 800 });
      break;
  }
}
