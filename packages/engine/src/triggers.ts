/**
 * Auto-abilities (CR 11.8): detected at the moment of their event (`rulesEvent`), then put on the stack the next time
 * a player would get priority (11.8.7): the turn player puts all theirs in the order they choose, then the non-turn
 * player. Modes and targets are chosen as each one is put on the stack (11.8.9–10); one whose targets do not exist is
 * put on the stack and removed at once (11.8.4, I16).
 */
import { chars } from "./chars";
import { ask } from "./choices";
import { evalCondition } from "./conditions";
import { emit } from "./events";
import { cardMatches, snapshotMatches } from "./filters";
import { newId, opponentOf } from "./state";
import { type ChooserContext, chooseOptions, legalTargets } from "./targets";
import { msg } from "./text";
import type {
  AutoAbility,
  ChooseSpec,
  GameState,
  LkiSnapshot,
  ObjectId,
  PendingTrigger,
  PlayerId,
  TriggerSpec,
  Zone,
} from "./types";
import { snapshot } from "./zones";

/** Events the auto-abilities listen to (distinct from the display events, `GameEvent`). */
export type RulesEvent =
  | {
      e: "zone";
      oldId: ObjectId;
      newId: ObjectId;
      from: Zone;
      to: Zone;
      /** Characteristics when it left the field. */
      lki: LkiSnapshot | null;
      broken: boolean;
      breaker?: ObjectId;
    }
  | { e: "attack"; attackers: ObjectId[] }
  | { e: "block"; blocker: ObjectId }
  | { e: "damage"; source: ObjectId | null; target: string; toPlayer: boolean; amount: number; battle: boolean }
  /** Cards just chosen by a Summon or an ability (CR 11.3.3). */
  | { e: "chosen"; ids: ObjectId[]; by: "summon" | "ability"; controller: PlayerId }
  | { e: "phaseStart"; phase: "main1" | "attack" | "end"; player: PlayerId };

/** The auto-ability of a pending trigger or a stack item: from the card's abilities, or inline (reflexive). */
export function autoAbilityOf(s: GameState, t: { sourceDefId: string; ability?: number; inline?: AutoAbility }): AutoAbility {
  if (t.inline) return t.inline;
  const ab = s.defs[t.sourceDefId]?.abilities[t.ability ?? -1];
  if (ab?.kind !== "auto") throw new Error(`no auto-ability ${t.ability} on ${t.sourceDefId}`);
  return ab;
}

/** The auto-abilities of a card that work in its zone. */
function autoAbilities(s: GameState, id: ObjectId, zone: Zone): { ab: AutoAbility; index: number }[] {
  const o = s.objects[id];
  const d = o ? s.defs[o.defId] : undefined;
  if (!d) return [];
  const out: { ab: AutoAbility; index: number }[] = [];
  d.abilities.forEach((ab, index) => {
    if (ab.kind === "auto" && (ab.zone ?? "field") === zone) out.push({ ab, index });
  });
  return out;
}

function matches(
  s: GameState,
  spec: TriggerSpec,
  ev: RulesEvent,
  holder: ObjectId,
  controller: PlayerId,
): ObjectId | false | undefined {
  const ctx = { controller, sourceId: holder };
  switch (spec.on) {
    case "enters":
      if (ev.e !== "zone" || ev.to !== "field") return false;
      if (spec.self) return ev.newId === holder ? ev.newId : false;
      return spec.filter && cardMatches(s, ev.newId, spec.filter, ctx, chars) ? ev.newId : false;
    case "attacks":
      return ev.e === "attack" && ev.attackers.includes(holder) ? holder : false;
    case "chosen":
      return ev.e === "chosen" && ev.ids.includes(holder) && spec.by.includes(ev.by) ? holder : false;
    case "dealsDamage": {
      if (ev.e !== "damage" || ev.source !== holder || ev.amount <= 0) return false;
      if (spec.to === "opponent") return ev.toPlayer && ev.target !== controller ? undefined : false;
      return !ev.toPlayer && s.objects[ev.target] && chars(s, ev.target).type === "Forward" ? ev.target : false;
    }
    case "phaseStart":
      if (ev.e !== "phaseStart" || ev.phase !== spec.phase) return false;
      if (spec.whose === "you" && ev.player !== controller) return false;
      if (spec.whose === "opponent" && ev.player === controller) return false;
      return undefined;
    case "putIntoBreak":
      if (ev.e !== "zone" || ev.from !== "field" || ev.to !== "break" || !ev.lki) return false;
      if (spec.self) return ev.newId === holder ? ev.newId : false;
      return spec.filter && snapshotMatches(ev.lki, spec.filter, ctx) ? ev.newId : false;
    case "leaves":
      return ev.e === "zone" && ev.from === "field" && ev.newId === holder ? ev.newId : false;
  }
}

/** Records the auto-abilities this event triggers (CR 11.8.3); a conditional one only if its condition holds (11.8.13). */
export function rulesEvent(s: GameState, ev: RulesEvent): void {
  const holders: { id: ObjectId; zone: Zone; controller: PlayerId }[] = s.field.map((id) => ({
    id,
    zone: "field" as Zone,
    controller: s.objects[id]?.controller as PlayerId,
  }));
  // A card that left the field triggers its own "when … is put into the Break Zone / leaves" abilities (look back).
  if (ev.e === "zone" && ev.from === "field" && ev.lki && s.objects[ev.newId])
    holders.push({ id: ev.newId, zone: "field", controller: ev.lki.controller });
  for (const h of holders) {
    const list =
      h.id === (ev.e === "zone" ? ev.newId : "") && ev.e === "zone" && ev.from === "field"
        ? autoAbilitiesOfDef(s, h.id)
        : autoAbilities(s, h.id, h.zone);
    for (const { ab, index } of list) {
      let subject: ObjectId | false | undefined = false;
      for (const spec of ab.on) {
        subject = matches(s, spec, ev, h.id, h.controller);
        if (subject !== false) break;
      }
      if (subject === false) continue;
      if (ab.condition && !evalCondition(s, ab.condition, { controller: h.controller, sourceId: h.id })) continue;
      const defId = s.objects[h.id]?.defId as string;
      s.triggers.push({
        id: newId(s, "t"),
        controller: h.controller,
        sourceId: h.id,
        sourceDefId: defId,
        ability: index,
        event: {
          ...(subject ? { subject } : {}),
          ...(ev.e === "zone" && ev.lki ? { lki: ev.lki } : {}),
          ...(ev.e === "damage" ? { amount: ev.amount } : {}),
        },
      });
    }
  }
}

/** Every auto-ability of a card's definition (a card that just left the field, read for its leave triggers). */
function autoAbilitiesOfDef(s: GameState, id: ObjectId): { ab: AutoAbility; index: number }[] {
  const d = s.defs[s.objects[id]?.defId ?? ""];
  const out: { ab: AutoAbility; index: number }[] = [];
  d?.abilities.forEach((ab, index) => {
    if (ab.kind === "auto" && ab.on.some((x) => x.on === "putIntoBreak" || x.on === "leaves")) out.push({ ab, index });
  });
  return out;
}

/** What an ability chooses with: its controller, its source, a Summon or an ability (protections, CR 11.3.3). */
export function chooserOf(s: GameState, controller: PlayerId, sourceId: ObjectId, kind: "summon" | "ability"): ChooserContext {
  const o = s.objects[sourceId];
  const cost = o ? chars(s, sourceId).cost : (s.lki[sourceId]?.cost ?? 0);
  return { controller, sourceId, kind, sourceCost: cost };
}

/** The choose specifications of an ability for the selected modes. */
export function specsOf(
  ab: { choose?: ChooseSpec[]; modal?: AutoAbility["modal"] },
  modes: readonly number[] | undefined,
): ChooseSpec[] {
  if (ab.modal) return (modes ?? []).flatMap((m) => ab.modal?.modes[m]?.choose ?? []);
  return ab.choose ?? [];
}

const label = (s: GameState, t: PendingTrigger) => autoAbilityOf(s, t).label;

/** Asks the modes and targets still missing of a trigger; "skip" when no mode can be selected (CR 11.8.10.2). */
function prepare(s: GameState, t: PendingTrigger): "asked" | "ready" | "skip" {
  const ab = autoAbilityOf(s, t);
  const ctx = chooserOf(s, t.controller, t.sourceId, "ability");
  if (ab.modal && !t.modes) {
    const available = ab.modal.modes.map((m, i) => (chooseOptions(s, m.choose, ctx) ? i : -1)).filter((i) => i >= 0);
    if (!available.length) return "skip";
    const max = Math.min(ab.modal.pick, available.length);
    const min = ab.modal.upTo ? 1 : max;
    ask(
      s,
      t.controller,
      {
        type: "pick",
        options: available.map(String),
        min,
        max,
        prompt: msg("{ability}: select the actions", { ability: ab.label }),
        intent: "mode",
        suggested: available.slice(0, max).map(String),
        labels: Object.fromEntries(available.map((i) => [String(i), ab.modal?.modes[i]?.label ?? ""])),
        autoOk: available.length === max && min === max,
      },
      { kind: "triggerModes", trigger: t.id },
    );
    return "asked";
  }
  for (const spec of specsOf(ab, t.modes)) {
    if (t.targets?.[spec.key]) continue;
    const legal = legalTargets(s, spec, ctx);
    if (!legal.length && !spec.upTo) return "ready";
    const max = Math.min(spec.count, legal.length);
    if (max === 0) {
      t.targets = { ...t.targets, [spec.key]: [] };
      continue;
    }
    const min = spec.upTo ? 0 : max;
    ask(
      s,
      t.controller,
      {
        type: "pick",
        options: legal,
        min,
        max,
        prompt: msg("{ability}: choose", { ability: ab.label }),
        intent: "target",
        suggested: legal.slice(0, max),
        autoOk: legal.length === max && min === max,
      },
      { kind: "triggerTargets", trigger: t.id, key: spec.key },
    );
    return "asked";
  }
  return "ready";
}

/** Puts a prepared trigger on the stack; one that must choose but cannot is removed at once (CR 11.8.4). */
function place(s: GameState, t: PendingTrigger): void {
  const ab = autoAbilityOf(s, t);
  const stackId = newId(s, "s");
  const specs = specsOf(ab, t.modes);
  emit({ type: "trigger", player: t.controller, source: t.sourceId, defId: t.sourceDefId, stackId });
  if (specs.some((x) => !x.upTo && !(t.targets?.[x.key]?.length ?? 0))) {
    emit({ type: "fizzle", stackId, defId: t.sourceDefId });
    return;
  }
  const o = s.objects[t.sourceId];
  s.stack.push({
    id: stackId,
    kind: "auto",
    controller: t.controller,
    sourceId: t.sourceId,
    sourceDefId: t.sourceDefId,
    ...(t.ability !== undefined ? { ability: t.ability } : {}),
    ...(t.inline ? { inline: t.inline } : {}),
    targets: t.targets ?? {},
    ...(t.modes ? { modes: t.modes } : {}),
    event: t.event,
    ...(t.vars ? { vars: t.vars } : {}),
    ...(o ? { lki: snapshot(s, t.sourceId) } : t.event.lki ? { lki: t.event.lki } : {}),
  });
  const chosen = Object.values(t.targets ?? {}).flat();
  if (chosen.length) rulesEvent(s, { e: "chosen", ids: chosen, by: "ability", controller: t.controller });
}

/** Puts the waiting triggers on the stack (CR 11.8.7); returns true when a question was asked. */
export function putTriggersOnStack(s: GameState): boolean {
  while (s.triggers.length) {
    const tp = s.turn.active;
    const owner = s.triggers.some((t) => t.controller === tp) ? tp : opponentOf(s, tp);
    const mine = s.triggers.filter((t) => t.controller === owner);
    if (mine.length > 1 && !mine.every((t) => t.ordered)) {
      ask(
        s,
        owner,
        {
          type: "order",
          items: mine.map((t) => t.id),
          prompt: msg("Order of your auto-abilities on the stack (the last one resolves first)"),
          intent: "triggerOrder",
          suggested: mine.map((t) => t.id),
          labels: Object.fromEntries(mine.map((t) => [t.id, label(s, t)])),
          autoOk: true,
        },
        { kind: "triggerOrder", player: owner },
      );
      return true;
    }
    const t = mine[0] as PendingTrigger;
    const r = prepare(s, t);
    if (r === "asked") return true;
    s.triggers.splice(s.triggers.indexOf(t), 1);
    if (r === "ready") place(s, t);
  }
  return false;
}

export function answerTriggerOrder(s: GameState, player: PlayerId, order: string[]): void {
  const mine = order.map((id) => s.triggers.find((t) => t.id === id)).filter((t): t is PendingTrigger => !!t);
  for (const t of mine) t.ordered = true;
  s.triggers = [...mine, ...s.triggers.filter((t) => t.controller !== player)];
}

export function answerTriggerModes(s: GameState, trigger: string, modes: number[]): void {
  const t = s.triggers.find((x) => x.id === trigger);
  if (t) t.modes = [...modes].sort((a, b) => a - b);
}

export function answerTriggerTargets(s: GameState, trigger: string, key: string, ids: ObjectId[]): void {
  const t = s.triggers.find((x) => x.id === trigger);
  if (t) t.targets = { ...t.targets, [key]: ids };
}
