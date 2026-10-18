/**
 * Shape of a received decision (online client, AI, script; from Planecircle): checked before touching the engine, so
 * that a malformed decision is refused by a RulesError rather than causing a TypeError deep in the engine. Legality
 * (cards in hand, targets, costs…) is still checked by the rules themselves.
 */

import { RulesError } from "./errors";
import { ELEMENTS } from "./model/cards";
import { msg } from "./text";
import type { Decision, GameState } from "./types";

type Rec = Record<string, unknown>;

const isStr = (v: unknown): v is string => typeof v === "string";
const isIndex = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;
const isStrArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr);
/** List of distinct objects: a duplicate makes no sense. */
const isIdSet = (v: unknown): v is string[] => isStrArray(v) && new Set(v).size === v.length;
/** Answer to a question: strings and finite numbers. */
const isValues = (v: unknown): boolean => Array.isArray(v) && v.every((x) => isStr(x) || Number.isFinite(x));
const isElement = (v: unknown) => v === undefined || ELEMENTS.includes(v as never);

function bad(field: string): never {
  throw new RulesError(msg("Malformed decision: {field}", { field }));
}

/** Optional field: absent (undefined), or well-formed. */
function opt(d: Rec, field: string, ok: (v: unknown) => boolean): void {
  if (d[field] !== undefined && !ok(d[field])) bad(field);
}

/** Object cited as the card or source of the action: it must exist. */
function objectRef(s: GameState, d: Rec, field: string): void {
  const id = d[field];
  if (!isStr(id)) bad(field);
  if (!s.objects[id]) throw new RulesError(msg("Unknown object"));
}

/** Objects cited in a list: they must all exist. */
function objectRefs(s: GameState, ids: unknown[]): void {
  if (ids.some((id) => !s.objects[id as string])) throw new RulesError(msg("Unknown object"));
}

/** A payment (CR 11.2.2.2): discarded cards and dulled Backups, each with an optional declared element. */
function paymentShape(s: GameState, d: Rec): void {
  const pay = d.payment;
  if (pay === undefined) return;
  if (!pay || typeof pay !== "object" || Array.isArray(pay)) bad("payment");
  const p = pay as Rec;
  const list = (field: string, key: string) => {
    const v = p[field];
    if (v === undefined) return [];
    if (!Array.isArray(v) || v.some((x) => !x || typeof x !== "object" || !isStr((x as Rec)[key]) || !isElement((x as Rec).as)))
      bad(`payment.${field}`);
    return (v as Rec[]).map((x) => x[key] as string);
  };
  const ids = [...list("discard", "card"), ...list("dull", "backup")];
  if (!isIdSet(ids)) bad("payment");
  objectRefs(s, ids);
  if (p.crystals !== undefined && !isIndex(p.crystals)) bad("payment.crystals");
}

function choicesShape(s: GameState, d: Rec): void {
  paymentShape(s, d);
  opt(d, "targets", (v) => !!v && typeof v === "object" && !Array.isArray(v) && Object.values(v).every(isIdSet));
  objectRefs(s, Object.values((d.targets as Record<string, string[]> | undefined) ?? {}).flat());
  opt(d, "modes", (v) => Array.isArray(v) && v.every(isIndex));
  opt(d, "x", isIndex);
}

export function checkDecisionShape(s: GameState, raw: Decision): void {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) bad("decision");
  const d = raw as unknown as Rec;
  switch (raw.type) {
    case "keep":
    case "mulligan":
    case "pass":
    case "concede":
    case "endAttacks":
      return;
    case "discard":
      if (!isIdSet(d.cards)) bad("cards");
      objectRefs(s, d.cards);
      return;
    case "cast":
      objectRef(s, d, "card");
      choicesShape(s, d);
      opt(d, "lbFlip", isIdSet);
      objectRefs(s, (d.lbFlip as string[] | undefined) ?? []);
      return;
    case "activate":
      objectRef(s, d, "source");
      if (!isIndex(d.ability)) bad("ability");
      choicesShape(s, d);
      if (d.special !== undefined) objectRef(s, d, "special");
      return;
    case "attack":
      if (!isIdSet(d.forwards)) bad("forwards");
      objectRefs(s, d.forwards);
      return;
    case "block":
      if (d.blocker !== null) objectRef(s, d, "blocker");
      return;
    case "choose":
      if (!isValues(d.values)) bad("values");
      return;
    default:
      bad("type");
  }
}
