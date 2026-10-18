/**
 * Casting cards and using abilities (CR 11.3, 11.4, 11.6, 11.7), resolving the stack (11.11).
 */
import { chars, hasFlag, hasKeyword } from "./chars";
import { evalCondition, staticAmount } from "./conditions";
import { baseCost, checkPayment, cpSources } from "./cp";
import { contextOf, continueResolution, evalCond, setOnResolved } from "./effects";
import { RulesError } from "./errors";
import { emit } from "./events";
import { bump, newId, obj } from "./state";
import { type ChooserContext, canChoose, targetsValid } from "./targets";
import { msg } from "./text";
import { chooserOf, rulesEvent, specsOf } from "./triggers";
import type {
  ActionAbility,
  AutoAbility,
  CardDef,
  ChooseSpec,
  CpCost,
  Decision,
  Effect,
  Element,
  GameState,
  Modal,
  ObjectId,
  Payment,
  PlayerId,
  Resolution,
  StackItem,
} from "./types";
import { fieldOf, moveObject, snapshot } from "./zones";

export const isMain = (s: GameState) => s.turn.phase === "main1" || s.turn.phase === "main2";
/** Summons and abilities: Main and Attack Phases only (CR 9.3.1.6–7). */
export const summonTiming = (s: GameState) => isMain(s) || s.turn.phase === "attack";

/** The cost to cast a card (CR 11.2.2, 11.3.5, 11.4.4): its base cost after reductions, and "pay only with…". */
export function castCost(s: GameState, player: PlayerId, d: CardDef, cardId: ObjectId): { cp: CpCost; onlyFrom?: Element[] } {
  let cost = d.cost;
  const reduce = d.castRules?.reduce;
  if (reduce && evalCondition(s, reduce.condition, { controller: player, sourceId: cardId }))
    cost -= staticAmount(s, reduce.by, { controller: player, sourceId: cardId });
  return { cp: baseCost(Math.max(0, cost), d.elements), ...(d.castRules?.payOnly ? { onlyFrom: d.castRules.payOnly } : {}) };
}

/** Pays the CP of a payment (CR 11.2.2.2): discards the cards, dulls the Backups; checked first. */
export function payCp(
  s: GameState,
  player: PlayerId,
  cost: CpCost,
  pay: Payment | undefined,
  exclude: ObjectId[],
  onlyFrom?: Element[],
): void {
  const payment = pay ?? {};
  checkPayment(cost, cpSources(s, player, exclude), payment, onlyFrom);
  const discarded: ObjectId[] = [];
  const dulled: ObjectId[] = [];
  for (const d of payment.dull ?? []) {
    obj(s, d.backup).dull = true;
    dulled.push(d.backup);
  }
  for (const d of payment.discard ?? []) discarded.push(moveObject(s, d.card, "break"));
  if (discarded.length || dulled.length) {
    bump(s);
    emit({ type: "cp", player, discarded, dulled });
  }
}

/** Whether a Character could join this player's field (CR 7.7.3–5): name, five Backups, one Light or Dark Character. */
export function fieldAllows(s: GameState, player: PlayerId, d: CardDef): boolean {
  const mine = fieldOf(s, player);
  if (!d.generic && mine.some((id) => !chars(s, id).generic && chars(s, id).names.includes(d.name))) return false;
  if (d.type === "Backup" && mine.filter((id) => chars(s, id).type === "Backup").length >= 5) return false;
  const lightDark = (els: readonly Element[]) => els.some((e) => e === "light" || e === "dark");
  if (lightDark(d.elements) && mine.some((id) => lightDark(chars(s, id).elements))) return false;
  return true;
}

/** Whether a card can be cast now by this player, as far as timing goes (CR 9.3.1.5–6, 11.4.1, 15.2.5). */
export function castTimingOk(s: GameState, player: PlayerId, cardId: ObjectId): boolean {
  if (s.flow !== "priority" || s.priority.holder !== player) return false;
  const d = s.defs[obj(s, cardId).defId] as CardDef;
  if (d.type === "Summon") return summonTiming(s);
  if (d.keywords.includes("backAttack")) return summonTiming(s);
  return isMain(s) && s.turn.active === player && s.stack.length === 0;
}

const SUMMON_CHOOSER = (s: GameState, player: PlayerId, cardId: ObjectId): ChooserContext => ({
  ...chooserOf(s, player, cardId, "summon"),
  sourceCost: s.defs[obj(s, cardId).defId]?.cost ?? 0,
});

/** Modes of a modal Summon or ability: a valid selection (CR 11.3.4). */
export function modesValid(modal: Modal | undefined, modes: number[] | undefined): boolean {
  if (!modal) return !modes || modes.length === 0;
  const m = modes ?? [];
  if (new Set(m).size !== m.length || m.some((x) => !Number.isInteger(x) || x < 0 || x >= modal.modes.length)) return false;
  return m.length <= modal.pick && m.length >= (modal.upTo ? 1 : Math.min(modal.pick, modal.modes.length));
}

/** Casts a card from the hand or the LB deck (CR 11.3, 11.4, 15.2.8.3). */
export function castCard(s: GameState, player: PlayerId, d: Extract<Decision, { type: "cast" }>): void {
  const o = s.objects[d.card];
  if (!o || o.owner !== player || (o.zone !== "hand" && o.zone !== "lb")) throw new RulesError(msg("This card cannot be cast"));
  const def = s.defs[o.defId] as CardDef;
  const from = o.zone as "hand" | "lb";
  if (from === "lb" && (!def.lb || !o.faceDown)) throw new RulesError(msg("Only a face-down Limit Break card can be cast"));
  if (from === "hand" && def.lb) throw new RulesError(msg("This card cannot be cast"));
  if (!castTimingOk(s, player, d.card)) throw new RulesError(msg("This card cannot be cast now"));
  if (def.type !== "Summon" && !fieldAllows(s, player, def)) throw new RulesError(msg("Your field cannot take this Character"));
  // CR 15.2.8.3.2 (I5): the LB cost turns face up other face-down LB cards.
  const flips = d.lbFlip ?? [];
  if (from === "lb") {
    const pl = s.players[player];
    const ok =
      flips.length === def.lb &&
      new Set(flips).size === flips.length &&
      flips.every((id) => id !== d.card && pl?.lb.includes(id) && s.objects[id]?.faceDown);
    if (!ok) throw new RulesError(msg("Turn face up {n} other face-down LB card(s)", { n: def.lb ?? 0 }));
  } else if (flips.length) throw new RulesError(msg("Only a Limit Break card has an LB cost"));
  const summon = def.type === "Summon" ? def.summon : undefined;
  if (summon) {
    if (!modesValid(summon.modal, d.modes)) throw new RulesError(msg("Invalid selection of actions"));
    if (!targetsValid(s, specsOf(summon, d.modes), d.targets, SUMMON_CHOOSER(s, player, d.card)))
      throw new RulesError(msg("Invalid targets"));
  } else if (d.targets && Object.keys(d.targets).length) throw new RulesError(msg("Invalid targets"));
  const { cp, onlyFrom } = castCost(s, player, def, d.card);
  payCp(s, player, cp, d.payment, [d.card], onlyFrom);
  if (flips.length) {
    for (const id of flips) obj(s, id).faceDown = false;
    bump(s);
    emit({ type: "lbFlip", player, cards: flips });
  }
  if (def.type !== "Summon") {
    // CR 11.4: a special action, without the stack; the turn player gets priority (11.4.7).
    const placed = moveObject(s, d.card, "field", { controller: player, dull: def.type === "Backup" });
    emit({ type: "cast", player, card: placed, defId: def.id, from });
    s.priority = { holder: s.turn.active, passes: 0 };
    return;
  }
  const onStack = moveObject(s, d.card, "stack", { controller: player });
  const stackId = newId(s, "s");
  const targets = d.targets ?? {};
  s.stack.push({
    id: stackId,
    kind: "summon",
    controller: player,
    sourceId: onStack,
    sourceDefId: def.id,
    targets,
    ...(d.modes ? { modes: [...d.modes].sort((a, b) => a - b) } : {}),
  });
  emit({ type: "cast", player, card: onStack, defId: def.id, from, stackId });
  const chosen = Object.values(targets).flat();
  if (chosen.length) rulesEvent(s, { e: "chosen", ids: chosen, by: "summon", controller: player });
  // CR 11.3.8: the caster gets priority back.
  s.priority = { holder: player, passes: 0 };
}

/** The action abilities of a card (special ones included). */
export function actionAbility(s: GameState, source: ObjectId, index: number): ActionAbility | undefined {
  const ab = s.defs[s.objects[source]?.defId ?? ""]?.abilities[index];
  return ab?.kind === "action" ? ab : undefined;
}

/** Whether an ability of this card can be used now, apart from its targets and its payment (CR 11.6, 11.7). */
export function abilityUsable(s: GameState, player: PlayerId, source: ObjectId, index: number): ActionAbility | null {
  if (s.flow !== "priority" || s.priority.holder !== player) return null;
  const o = s.objects[source];
  const ab = actionAbility(s, source, index);
  if (!o || !ab || !summonTiming(s)) return null;
  const zone = ab.zone ?? "field";
  if (o.zone !== zone) return null;
  if (zone === "field" ? o.controller !== player : o.owner !== player) return null;
  const lim = ab.limits;
  if (lim?.yourTurn && s.turn.active !== player) return null;
  if (lim?.mainPhase && !isMain(s)) return null;
  if (lim?.oncePerTurn && s.turnLog.some((e) => e.e === "used" && e.source === source && e.ability === index)) return null;
  const c = zone === "field" ? chars(s, source) : null;
  // Charlotte: "cannot use action abilities" (special abilities are another kind, CR 11.5.2).
  if (c && !ab.specialName && hasFlag(s, source, "cantUseActionAbilities")) return null;
  if (ab.cost.dull) {
    if (zone !== "field" || o.dull) return null;
    // CR 11.6.2.2: controlled since the start of the turn, unless Haste; Monsters are exempt.
    if (c?.type !== "Monster" && o.controlledSince >= s.turn.number && !hasKeyword(s, source, "haste")) return null;
  }
  if (ab.cost.putSelfIntoBreak && zone !== "field") return null;
  if (ab.cost.discardSelf && zone !== "hand") return null;
  if (ab.cost.removeSelf && zone !== "break") return null;
  if (ab.cost.crystals && (s.players[player]?.crystals ?? 0) < ab.cost.crystals) return null;
  return ab;
}

/** Cards that can be discarded for a special ability (CR 11.7.1): same name, from the hand. */
export function specialDiscards(s: GameState, player: PlayerId, source: ObjectId): ObjectId[] {
  const names = chars(s, source).names;
  return (s.players[player]?.hand ?? []).filter((id) => id !== source && chars(s, id).names.some((n) => names.includes(n)));
}

/** Uses an action or special ability (CR 11.6, 11.7): every cost paid at once, the ability on the stack. */
export function activateAbility(s: GameState, player: PlayerId, d: Extract<Decision, { type: "activate" }>): void {
  const ab = abilityUsable(s, player, d.source, d.ability);
  if (!ab) throw new RulesError(msg("This ability cannot be used now"));
  const o = obj(s, d.source);
  const exclude = [d.source];
  if (ab.cost.special) {
    if (!d.special || !specialDiscards(s, player, d.source).includes(d.special))
      throw new RulesError(msg("Discard a card with the same name"));
    exclude.push(d.special);
  } else if (d.special) throw new RulesError(msg("This is not a special ability"));
  if (!modesValid(ab.modal, d.modes)) throw new RulesError(msg("Invalid selection of actions"));
  const ctx = chooserOf(s, player, d.source, "ability");
  if (!targetsValid(s, specsOf(ab, d.modes), d.targets, ctx)) throw new RulesError(msg("Invalid targets"));
  const lki = snapshot(s, d.source);
  const cp = ab.cost.cp;
  if (cp) payCp(s, player, cp, d.payment, exclude);
  else if (d.payment?.discard?.length || d.payment?.dull?.length)
    // CR 11.2.2.4: no CP for a cost without CP.
    throw new RulesError(msg("This cost needs no CP"));
  if (ab.cost.crystals) {
    const pl = s.players[player];
    if (pl) pl.crystals -= ab.cost.crystals;
  }
  if (ab.cost.dull) o.dull = true;
  if (d.special) moveObject(s, d.special, "break");
  let source = d.source;
  if (ab.cost.putSelfIntoBreak || ab.cost.discardSelf) source = moveObject(s, d.source, "break");
  else if (ab.cost.removeSelf) source = moveObject(s, d.source, "removed");
  bump(s);
  s.turnLog.push({ e: "used", source: d.source, ability: d.ability });
  const stackId = newId(s, "s");
  const targets = d.targets ?? {};
  s.stack.push({
    id: stackId,
    kind: ab.specialName ? "special" : "action",
    controller: player,
    sourceId: source,
    sourceDefId: o.defId,
    ability: d.ability,
    targets,
    ...(d.modes ? { modes: [...d.modes].sort((a, b) => a - b) } : {}),
    lki,
  });
  emit({ type: "activate", player, source: d.source, defId: o.defId, ability: d.ability, stackId });
  const chosen = Object.values(targets).flat();
  if (chosen.length) rulesEvent(s, { e: "chosen", ids: chosen, by: "ability", controller: player });
  // CR 11.6.11, 11.7.11: the user keeps priority.
  s.priority = { holder: player, passes: 0 };
}

/** What a stack item does: its choose specifications and its effects (for its modes). */
export function itemAbility(s: GameState, item: StackItem): { choose: ChooseSpec[]; effects: Effect[]; ab?: AutoAbility } {
  if (item.kind === "summon") {
    const sm = s.defs[item.sourceDefId]?.summon;
    const modes = item.modes ?? [];
    return {
      choose: specsOf(sm ?? {}, item.modes),
      effects: sm?.modal ? modes.flatMap((m) => sm.modal?.modes[m]?.effects ?? []) : (sm?.effects ?? []),
    };
  }
  const ab = item.inline ?? s.defs[item.sourceDefId]?.abilities[item.ability ?? -1];
  if (!ab || ab.kind === "field") return { choose: [], effects: [] };
  const modes = item.modes ?? [];
  return {
    choose: specsOf(ab, item.modes),
    effects: ab.modal ? modes.flatMap((m) => ab.modal?.modes[m]?.effects ?? []) : ab.effects,
    ...(ab.kind === "auto" ? { ab } : {}),
  };
}

/** Resolves the top of the stack (CR 11.11): targets checked again, conditional auto-abilities checked again. */
export function resolveTop(s: GameState): void {
  const item = s.stack.pop();
  if (!item) return;
  const { choose, effects, ab } = itemAbility(s, item);
  const ctx: ChooserContext = {
    ...chooserOf(s, item.controller, item.sourceId, item.kind === "summon" ? "summon" : "ability"),
    sourceCost: item.lki?.cost ?? s.defs[item.sourceDefId]?.cost ?? 0,
  };
  const legal: Record<string, ObjectId[]> = {};
  let chosen = 0;
  let still = 0;
  for (const spec of choose) {
    const ids = item.targets[spec.key] ?? [];
    chosen += ids.length;
    legal[spec.key] = ids.filter((id) => canChoose(s, id, spec, ctx));
    still += legal[spec.key]?.length ?? 0;
  }
  const r: Resolution = {
    item,
    effects,
    pc: 0,
    controller: item.controller,
    targets: legal,
    vars: { ...(item.vars ?? {}) },
    awaiting: null,
  };
  // CR 11.11.2: every chosen target illegal, the effect is cancelled; CR 11.11.3: a conditional auto-ability whose
  // condition no longer holds does nothing.
  const cancelled = (chosen > 0 && still === 0) || (!!ab?.condition && !evalCond(s, contextOf(r), ab.condition));
  if (cancelled) {
    emit({ type: "fizzle", stackId: item.id, defId: item.sourceDefId });
    finish(s, r);
    return;
  }
  emit({ type: "resolve", stackId: item.id, defId: item.sourceDefId });
  s.resolving = r;
  s.flow = "resolving";
  continueResolution(s);
}

/** After a resolution: a resolved Summon goes to its owner's Break Zone (CR 11.11.10); the turn player gets priority. */
function finish(s: GameState, r: Resolution): void {
  if (r.exBurst) {
    s.flow = "priority";
    return;
  }
  if (r.item.kind === "summon" && s.objects[r.item.sourceId]?.zone === "stack") moveObject(s, r.item.sourceId, "break");
  s.priority = { holder: s.turn.active, passes: 0 };
  if (!s.over) s.flow = "priority";
}

setOnResolved(finish);
