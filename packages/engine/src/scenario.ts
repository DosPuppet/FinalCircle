/**
 * "Staged" game (tutorial and rules tests; from Planecircle): decks in order, hands, fields, Damage Zones known in
 * advance. No shuffle nor mulligan; the game starts at the given turn and phase.
 */
import { collectEvents, emit } from "./events";
import { blankState, type StepResult } from "./game";
import { bump, registerDef } from "./state";
import { advance, enterPhase, startTurn } from "./turn";
import type { CardDef, Phase, PlayerId } from "./types";
import { createObject } from "./zones";

export interface ScenarioCard {
  def: CardDef;
  dull?: boolean;
  damage?: number;
  /** Entered this turn: cannot attack or use a 《ダル》 ability without Haste (CR 10.1.2.1.1). */
  sick?: boolean;
  frozen?: boolean;
}

export interface ScenarioPlayer {
  id: PlayerId;
  name: string;
  /** Main deck in order: the first card is the top. */
  deck: CardDef[];
  hand: CardDef[];
  field?: ScenarioCard[];
  breakZone?: CardDef[];
  damage?: CardDef[];
  /** The LB deck, face down (`faceUp`: already used). */
  lb?: { def: CardDef; faceUp?: boolean }[];
  crystals?: number;
}

export interface ScenarioOptions {
  seed: number;
  players: ScenarioPlayer[];
  /** Player whose turn it is. */
  active: PlayerId;
  /** Turn number (2 by default: the active player draws 2 cards). */
  turn?: number;
  /** Phase to start in (`main1` by default; `active` plays the turn from its start). */
  phase?: Phase;
}

export function createScenario(opts: ScenarioOptions): StepResult {
  const [state, events] = collectEvents(() => {
    const s = blankState(opts);
    const turn = Math.max(1, opts.turn ?? 2);
    const other = s.playerOrder.find((p) => p !== opts.active) as PlayerId;
    // The player who started plays the odd turns.
    s.turn.startingPlayer = turn % 2 === 1 ? opts.active : other;
    for (const p of opts.players) {
      const add = (d: CardDef, zone: "deck" | "hand" | "break" | "damage") => {
        registerDef(s, d);
        return createObject(s, d.id, p.id, zone);
      };
      for (const d of p.deck) add(d, "deck");
      for (const d of p.hand) add(d, "hand");
      for (const d of p.breakZone ?? []) add(d, "break");
      for (const d of p.damage ?? []) add(d, "damage");
      for (const c of p.lb ?? []) {
        registerDef(s, c.def);
        createObject(s, c.def.id, p.id, "lb", { faceDown: !c.faceUp });
      }
      for (const c of p.field ?? []) {
        registerDef(s, c.def);
        const o = createObject(s, c.def.id, p.id, "field", { dull: !!c.dull });
        o.controlledSince = c.sick ? turn : 0;
        if (c.damage) o.damage = c.damage;
        if (c.frozen) o.frozen = true;
      }
      const pl = s.players[p.id];
      if (pl) {
        pl.crystals = p.crystals ?? 0;
        pl.mulliganed = true;
      }
    }
    bump(s);
    emit({ type: "gameStart", firstPlayer: s.turn.startingPlayer });
    s.turn.number = turn - 1;
    startTurn(s, opts.active);
    const phase = opts.phase ?? "main1";
    if (phase !== "active") enterPhase(s, phase);
    advance(s);
    return s;
  });
  return { state, events };
}
