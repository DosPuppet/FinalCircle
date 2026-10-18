/**
 * EX Burst (CR 11.10): a card with the EX icon put into the Damage Zone by damage may apply its effect at once, after
 * all the damage (6.5.2.1), in the order the cards arrived; no one can respond. A Summon applies all its effects, a
 * Character its auto-abilities marked EX BURST (11.10.3). Usable only if its "choose" targets exist (I23).
 */
import { ask, cardRef } from "./choices";
import { continueResolution } from "./effects";
import { emit } from "./events";
import { newId } from "./state";
import { chooseOptions, legalTargets } from "./targets";
import { msg } from "./text";
import { chooserOf, rulesEvent, specsOf } from "./triggers";
import type { ChooseSpec, Effect, ExBurstEntry, GameState, Modal, ObjectId } from "./types";

/** What an EX Burst applies. */
export function exBurstOf(
  s: GameState,
  card: ObjectId,
): { choose?: ChooseSpec[]; effects: Effect[]; modal?: Modal; label: string } {
  const d = s.defs[s.objects[card]?.defId ?? ""];
  if (!d) return { effects: [], label: "" };
  if (d.type === "Summon") return { ...(d.summon ?? { effects: [] }), label: cardRef(d.id) };
  const abs = d.abilities.filter((a) => a.kind === "auto" && a.exBurst);
  return {
    choose: abs.flatMap((a) => (a.kind === "auto" ? (a.choose ?? []) : [])),
    effects: abs.flatMap((a) => (a.kind === "auto" ? a.effects : [])),
    label: abs[0]?.label ?? cardRef(d.id),
  };
}

const kindOf = (s: GameState, card: ObjectId) => (s.defs[s.objects[card]?.defId ?? ""]?.type === "Summon" ? "summon" : "ability");

/** Handles the waiting EX Bursts; returns true when a question was asked (or a resolution waits for one). */
export function processExBursts(s: GameState): boolean {
  while (s.exBursts.length) {
    const e = s.exBursts[0] as ExBurstEntry;
    const o = s.objects[e.card];
    if (o?.zone !== "damage") {
      s.exBursts.shift();
      continue;
    }
    const x = exBurstOf(s, e.card);
    const ctx = chooserOf(s, e.player, e.card, kindOf(s, e.card));
    if (e.use === undefined) {
      const usable =
        x.effects.length > 0 || x.modal
          ? x.modal
            ? x.modal.modes.some((m) => chooseOptions(s, m.choose, ctx))
            : chooseOptions(s, x.choose, ctx) !== null
          : false;
      if (!usable) {
        emit({ type: "exBurst", player: e.player, card: e.card, defId: o.defId, used: false });
        s.exBursts.shift();
        continue;
      }
      ask(
        s,
        e.player,
        {
          type: "yesNo",
          prompt: msg("Use the EX Burst of {card}?", { card: cardRef(o.defId) }),
          intent: "exBurst",
          suggested: [1],
        },
        { kind: "exBurst", card: e.card },
      );
      return true;
    }
    if (!e.use) {
      emit({ type: "exBurst", player: e.player, card: e.card, defId: o.defId, used: false });
      s.exBursts.shift();
      continue;
    }
    if (x.modal && !e.modes) {
      const available = x.modal.modes.map((m, i) => (chooseOptions(s, m.choose, ctx) ? i : -1)).filter((i) => i >= 0);
      const max = Math.min(x.modal.pick, available.length);
      ask(
        s,
        e.player,
        {
          type: "pick",
          options: available.map(String),
          min: x.modal.upTo ? 1 : max,
          max,
          prompt: msg("{ability}: select the actions", { ability: x.label }),
          intent: "mode",
          suggested: available.slice(0, max).map(String),
          labels: Object.fromEntries(available.map((i) => [String(i), x.modal?.modes[i]?.label ?? ""])),
        },
        { kind: "exBurstModes", card: e.card },
      );
      return true;
    }
    for (const spec of specsOf(x, e.modes)) {
      if (e.targets?.[spec.key]) continue;
      const legal = legalTargets(s, spec, ctx);
      const max = Math.min(spec.count, legal.length);
      if (max === 0) {
        e.targets = { ...e.targets, [spec.key]: [] };
        continue;
      }
      ask(
        s,
        e.player,
        {
          type: "pick",
          options: legal,
          min: spec.upTo ? 0 : max,
          max,
          prompt: msg("{ability}: choose", { ability: x.label }),
          intent: "target",
          suggested: legal.slice(0, max),
        },
        { kind: "exBurstTargets", card: e.card, key: spec.key },
      );
      return true;
    }
    s.exBursts.shift();
    emit({ type: "exBurst", player: e.player, card: e.card, defId: o.defId, used: true });
    const targets = e.targets ?? {};
    const effects = x.modal ? (e.modes ?? []).flatMap((m) => x.modal?.modes[m]?.effects ?? []) : x.effects;
    s.resolving = {
      item: {
        id: newId(s, "s"),
        kind: kindOf(s, e.card) === "summon" ? "summon" : "auto",
        controller: e.player,
        sourceId: e.card,
        sourceDefId: o.defId,
        targets,
        ...(e.modes ? { modes: e.modes } : {}),
      },
      effects,
      pc: 0,
      controller: e.player,
      targets,
      vars: {},
      awaiting: null,
      exBurst: true,
    };
    const chosen = Object.values(targets).flat();
    if (chosen.length) rulesEvent(s, { e: "chosen", ids: chosen, by: kindOf(s, e.card), controller: e.player });
    s.flow = "resolving";
    if (!continueResolution(s)) return true;
  }
  return false;
}

export function answerExBurst(s: GameState, card: ObjectId, use: boolean): void {
  const e = s.exBursts.find((x) => x.card === card);
  if (e) e.use = use;
}

export function answerExBurstModes(s: GameState, card: ObjectId, modes: number[]): void {
  const e = s.exBursts.find((x) => x.card === card);
  if (e) e.modes = [...modes].sort((a, b) => a - b);
}

export function answerExBurstTargets(s: GameState, card: ObjectId, key: string, ids: ObjectId[]): void {
  const e = s.exBursts.find((x) => x.card === card);
  if (e) e.targets = { ...e.targets, [key]: ids };
}
