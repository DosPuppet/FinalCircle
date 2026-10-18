/**
 * The card-script DSL (Planecircle's design, FFTCG vocabulary): builders that only produce data. A card script gives
 * the abilities the text parser cannot deduce (`@finalcircle/cards`, `src/<group>/*.ts`).
 *
 *   "13-013C": { abilities: [auto(when.enters, [fx.damage(ref.chosen(), amount.ifElse(cond.controls({ … }), 8000, 4000))],
 *     { choose: [target.forward()], label: "Deal 4000 damage" })] },
 *
 * Costs are written with the official symbols: `cost("《火》《1》《ダル》", { putSelf: true })`.
 */
import type {
  AbilityCost,
  AbilityLimits,
  AbilityZone,
  ActionAbility,
  Amount,
  AutoAbility,
  ChooseSpec,
  Condition,
  CpCost,
  Effect,
  Element,
  FieldAbility,
  FieldMods,
  Flag,
  Keyword,
  Modal,
  ModeDef,
  ObjectFilter,
  Ref,
  Side,
  TriggerSpec,
} from "./types";

const KANJI: Record<string, Element> = {
  火: "fire",
  氷: "ice",
  風: "wind",
  土: "earth",
  雷: "lightning",
  水: "water",
  光: "light",
  闇: "dark",
};

/** CP symbols ("《火》《1》") as a CP cost. */
export function cp(symbols: string): CpCost {
  const out: CpCost = { elements: {}, generic: 0 };
  for (const m of symbols.matchAll(/《([^》]+)》/g)) {
    const sym = m[1] as string;
    const e = KANJI[sym];
    if (e) out.elements[e] = (out.elements[e] ?? 0) + 1;
    else if (/^\d+$/.test(sym)) out.generic += Number(sym);
    else throw new Error(`not a CP symbol: 《${sym}》`);
  }
  return out;
}

/** An ability's cost: its symbols (CP, 《ダル》, 《S》, 《C》) and the costs written as text. */
export function cost(
  symbols: string,
  more: { putSelf?: boolean; discardSelf?: boolean; removeSelf?: boolean } = {},
): AbilityCost {
  const out: AbilityCost = {};
  const cpPart = symbols.replace(/《(ダル|S|C)》/g, (_, x: string) => {
    if (x === "ダル") out.dull = true;
    else if (x === "S") out.special = true;
    else out.crystals = (out.crystals ?? 0) + 1;
    return "";
  });
  if (/《/.test(cpPart)) out.cp = cp(cpPart);
  if (more.putSelf) out.putSelfIntoBreak = true;
  if (more.discardSelf) out.discardSelf = true;
  if (more.removeSelf) out.removeSelf = true;
  return out;
}

export const ref = {
  self: { kind: "self" } as Ref,
  chosen: (key = "t"): Ref => ({ kind: "chosen", key }),
  stored: (key: string): Ref => ({ kind: "stored", key }),
  event: { kind: "event" } as Ref,
  all: (filter: ObjectFilter): Ref => ({ kind: "all", filter }),
};

/** "choose N …" (CR 11.3.3). */
export const target = {
  forward: (filter: ObjectFilter = {}, key = "t", count = 1, upTo = false): ChooseSpec => ({
    key,
    filter: { types: ["Forward"], ...filter },
    count,
    ...(upTo ? { upTo } : {}),
  }),
  character: (filter: ObjectFilter = {}, key = "t"): ChooseSpec => ({ key, filter: { character: true, ...filter }, count: 1 }),
  /** "choose 1 [card] in your Break Zone". */
  inBreakZone: (filter: ObjectFilter = {}, key = "t"): ChooseSpec => ({
    key,
    filter: { controller: "you", ...filter },
    zone: "break",
    count: 1,
  }),
};

export const amount = {
  count: (filter: ObjectFilter): Amount => ({ kind: "count", filter }),
  times: (n: number, of: Amount): Amount => ({ kind: "times", n, of }),
  damage: (who: Side = "you"): Amount => ({ kind: "damage", who }),
  ifElse: (c: Condition, then: Amount, otherwise: Amount): Amount => ({ kind: "ifElse", cond: c, then, else: otherwise }),
};

export const cond = {
  /** "If you control N [cards] or more". */
  controls: (filter: ObjectFilter, n = 1): Condition => ({ kind: "count", filter: { ...filter, controller: "you" }, atLeast: n }),
  opponentControls: (filter: ObjectFilter, n = 1): Condition => ({
    kind: "count",
    filter: { ...filter, controller: "opponent" },
    atLeast: n,
  }),
  /** "If you have received N points of damage or more", Damage N (CR 15.2.6). */
  damage: (n: number, who: Side = "you"): Condition => ({ kind: "damage", who, atLeast: n }),
  stored: (key: string, filter: ObjectFilter): Condition => ({ kind: "stored", key, filter }),
  did: (key: string): Condition => ({ kind: "did", key }),
  yourTurn: { kind: "yourTurn" } as Condition,
  not: (c: Condition): Condition => ({ kind: "not", cond: c }),
};

export const when = {
  enters: { on: "enters", self: true } as TriggerSpec,
  attacks: { on: "attacks", self: true } as TriggerSpec,
  /** "When a [card] enters your field". */
  entersYourField: (filter: ObjectFilter): TriggerSpec => ({ on: "enters", filter: { ...filter, controller: "you" } }),
  chosenBy: (by: ("summon" | "ability")[] = ["summon", "ability"]): TriggerSpec => ({ on: "chosen", self: true, by }),
  dealsDamageToForward: { on: "dealsDamage", self: true, to: "forward" } as TriggerSpec,
  dealsDamageToOpponent: { on: "dealsDamage", self: true, to: "opponent" } as TriggerSpec,
  phaseStart: (phase: "main1" | "attack" | "end", whose: "you" | "opponent" | "each" = "you"): TriggerSpec => ({
    on: "phaseStart",
    phase,
    whose,
  }),
  /** "When a [card] is put from the field into the Break Zone". */
  putIntoBreak: (filter: ObjectFilter): TriggerSpec => ({ on: "putIntoBreak", fromField: true, filter }),
  leaves: { on: "leaves", self: true } as TriggerSpec,
};

export const fx = {
  damage: (to: Ref, n: Amount): Effect => ({ op: "damage", to, amount: n }),
  power: (to: Ref, n: Amount): Effect => ({ op: "power", to, amount: n }),
  gain: (to: Ref, keywords: Keyword[], flags?: Flag[]): Effect => ({
    op: "gain",
    to,
    ...(keywords.length ? { keywords } : {}),
    ...(flags?.length ? { flags } : {}),
  }),
  dull: (to: Ref): Effect => ({ op: "dull", to }),
  activate: (to: Ref): Effect => ({ op: "activate", to }),
  freeze: (to: Ref): Effect => ({ op: "freeze", to }),
  break: (what: Ref): Effect => ({ op: "break", what }),
  toBreakZone: (what: Ref): Effect => ({ op: "toBreakZone", what }),
  toHand: (what: Ref): Effect => ({ op: "toHand", what }),
  removeFromGame: (what: Ref): Effect => ({ op: "removeFromGame", what }),
  draw: (n: Amount, who: Side = "you"): Effect => ({ op: "draw", who, n }),
  discard: (n: Amount, store?: string, who: Side = "you"): Effect => ({ op: "discard", who, n, ...(store ? { store } : {}) }),
  search: (filter: ObjectFilter, to: "hand" | "field" = "hand"): Effect => ({ op: "search", filter, to, may: true }),
  lookTop: (n: number, take: { filter?: ObjectFilter; count: number } = { count: 1 }, reveal = false): Effect => ({
    op: "lookTop",
    n,
    take,
    ...(reveal ? { reveal } : {}),
  }),
  playFromHand: (filter: ObjectFilter, may = true): Effect => ({ op: "playFromHand", filter, ...(may ? { may } : {}) }),
  shield: (to: Ref, reduce: number): Effect => ({ op: "shield", to, reduce }),
  select: (who: Side, filter: ObjectFilter, store: string, count = 1, upTo = false): Effect => ({
    op: "select",
    who,
    filter,
    count,
    store,
    ...(upTo ? { upTo } : {}),
  }),
  may: (prompt: string, effects: Effect[], store?: string): Effect => ({
    op: "may",
    prompt,
    effects,
    ...(store ? { store } : {}),
  }),
  if: (c: Condition, then: Effect[], otherwise?: Effect[]): Effect => ({
    op: "if",
    cond: c,
    then,
    ...(otherwise ? { else: otherwise } : {}),
  }),
  /** "When you do so, …". */
  reflexive: (ability: AutoAbility, c?: Condition): Effect => ({ op: "reflexive", ability, ...(c ? { cond: c } : {}) }),
  gainCrystals: (n: Amount, who: Side = "you"): Effect => ({ op: "gainCrystals", who, n }),
};

export const mode = (label: string, effects: Effect[], choose?: ChooseSpec[]): ModeDef => ({
  label,
  effects,
  ...(choose ? { choose } : {}),
});
/** "Select N of the M following actions" (CR 11.3.4); `upTo`: "up to N". */
export const modal = (pick: number, modes: ModeDef[], upTo = false): Modal => ({ pick, modes, ...(upTo ? { upTo } : {}) });

interface AbilityOptions {
  label: string;
  choose?: ChooseSpec[];
  modal?: Modal;
  exBurst?: boolean;
  zone?: AbilityZone;
}

/** An auto-ability (CR 11.8); `condition`: a conditional auto-ability (11.8.13). */
export function auto(
  on: TriggerSpec | TriggerSpec[],
  effects: Effect[],
  opts: AbilityOptions & { condition?: Condition },
): AutoAbility {
  return {
    kind: "auto",
    on: Array.isArray(on) ? on : [on],
    effects,
    label: opts.label,
    ...(opts.choose ? { choose: opts.choose } : {}),
    ...(opts.modal ? { modal: opts.modal } : {}),
    ...(opts.condition ? { condition: opts.condition } : {}),
    ...(opts.exBurst ? { exBurst: true } : {}),
    ...(opts.zone ? { zone: opts.zone } : {}),
  };
}

/** An action ability (CR 11.6). */
export function action(
  abilityCost: AbilityCost,
  effects: Effect[],
  opts: AbilityOptions & { limits?: AbilityLimits },
): ActionAbility {
  return {
    kind: "action",
    cost: abilityCost,
    effects,
    label: opts.label,
    ...(opts.choose ? { choose: opts.choose } : {}),
    ...(opts.modal ? { modal: opts.modal } : {}),
    ...(opts.zone ? { zone: opts.zone } : {}),
    ...(opts.limits ? { limits: opts.limits } : {}),
  };
}

/** A special ability (CR 11.7): its name, its cost (《S》 included), its effects. */
export function special(
  name: string,
  abilityCost: AbilityCost,
  effects: Effect[],
  opts: AbilityOptions & { limits?: AbilityLimits },
) {
  return { ...action({ ...abilityCost, special: true }, effects, opts), specialName: name };
}

/** A field ability (CR 11.9): `affects` the card itself, or the cards that match. */
export function field(
  mods: FieldMods,
  opts: { label: string; affects?: "self" | ObjectFilter; affectsZone?: "field" | "break"; condition?: Condition },
): FieldAbility {
  return {
    kind: "field",
    affects: opts.affects ?? "self",
    mods,
    label: opts.label,
    ...(opts.affectsZone ? { affectsZone: opts.affectsZone } : {}),
    ...(opts.condition ? { condition: opts.condition } : {}),
  };
}

/** "Damage N -- [field ability]" (CR 15.2.6). */
export function damageN(n: number, ability: FieldAbility): FieldAbility {
  const c = cond.damage(n);
  return { ...ability, condition: ability.condition ? { kind: "all", conds: [c, ability.condition] } : c };
}
