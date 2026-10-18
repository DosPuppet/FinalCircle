/**
 * The options of a player's pending decision (`legalActions`): what the interface offers, what the AI chooses from,
 * what the autopilot reads. Every option offered must be accepted by the engine with its suggested payment and the
 * first targets (`checkOffers` of the strict fuzz).
 */
import { attackCandidates, blockCandidates, partyGroups } from "./attack";
import { cpSources, defaultKeep, suggestPayment } from "./cp";
import { abilityUsable, castCost, castTimingOk, fieldAllows, specialDiscards } from "./stack";
import { obj } from "./state";
import { type ChooserContext, chooseOptions } from "./targets";
import { chooserOf } from "./triggers";
import type { ActionOption, CardDef, ChooseOption, ChooseSpec, GameState, Modal, ModalOption, ObjectId, PlayerId } from "./types";

/** The modes that can be selected and their targets (CR 11.3.4); null when too few can (it cannot be used). */
function modalOption(s: GameState, modal: Modal, ctx: ChooserContext): ModalOption | null {
  const choose = modal.modes.map((m) => chooseOptions(s, m.choose, ctx));
  const available = choose.map((c, i) => (c ? i : -1)).filter((i) => i >= 0);
  const required = modal.upTo ? 1 : modal.pick;
  if (available.length < Math.min(required, modal.modes.length)) return null;
  return {
    pick: modal.pick,
    ...(modal.upTo ? { upTo: true } : {}),
    labels: modal.modes.map((m) => m.label),
    choose: choose.map((c) => c ?? []),
    available,
  };
}

/** The targets and modes part of an option; null when the card or ability cannot be used (CR 11.3.3, 11.6.5). */
function chooseParts(
  s: GameState,
  ab: { choose?: ChooseSpec[]; modal?: Modal } | undefined,
  ctx: ChooserContext,
): { choose: ChooseOption[]; modal?: ModalOption } | null {
  if (!ab) return { choose: [] };
  if (ab.modal) {
    const modal = modalOption(s, ab.modal, ctx);
    return modal ? { choose: [], modal } : null;
  }
  const choose = chooseOptions(s, ab.choose, ctx);
  return choose ? { choose } : null;
}

function castOptions(s: GameState, player: PlayerId): ActionOption[] {
  const pl = s.players[player];
  if (!pl) return [];
  const out: ActionOption[] = [];
  const faceDownLb = pl.lb.filter((id) => s.objects[id]?.faceDown);
  for (const card of [...pl.hand, ...faceDownLb]) {
    const o = obj(s, card);
    const d = s.defs[o.defId] as CardDef;
    const from = o.zone === "lb" ? "lb" : "hand";
    if (from === "hand" && d.lb) continue;
    if (!castTimingOk(s, player, card)) continue;
    if (d.type !== "Summon" && !fieldAllows(s, player, d)) continue;
    const lbOptions = from === "lb" ? faceDownLb.filter((id) => id !== card) : [];
    if (from === "lb" && lbOptions.length < (d.lb ?? 0)) continue;
    const { cp, onlyFrom } = castCost(s, player, d, card);
    const sources = cpSources(s, player, [card]);
    const suggested = suggestPayment(cp, sources, defaultKeep, onlyFrom);
    if (!suggested) continue;
    const ctx: ChooserContext = { ...chooserOf(s, player, card, "summon"), sourceCost: d.cost };
    const parts = d.type === "Summon" ? chooseParts(s, d.summon, ctx) : { choose: [] };
    if (!parts) continue;
    out.push({
      type: "cast",
      card,
      from,
      cost: cp,
      sources,
      suggested,
      choose: parts.choose,
      ...(parts.modal ? { modal: parts.modal } : {}),
      ...(from === "lb" ? { lb: { count: d.lb ?? 0, options: lbOptions } } : {}),
      ...(d.type !== "Summon" && d.keywords.includes("backAttack") ? { backAttack: true } : {}),
    });
  }
  return out;
}

function abilityOptions(s: GameState, player: PlayerId): ActionOption[] {
  const pl = s.players[player];
  if (!pl) return [];
  const out: ActionOption[] = [];
  const holders: ObjectId[] = [...s.field.filter((id) => s.objects[id]?.controller === player), ...pl.hand, ...pl.breakZone];
  for (const id of holders) {
    const d = s.defs[obj(s, id).defId];
    d?.abilities.forEach((ab, index) => {
      if (ab.kind !== "action" || !abilityUsable(s, player, id, index)) return;
      const special = ab.cost.special ? specialDiscards(s, player, id) : undefined;
      if (special && !special.length) return;
      const exclude = [id, ...(special?.slice(0, 1) ?? [])];
      const sources = ab.cost.cp ? cpSources(s, player, exclude) : [];
      const suggested = ab.cost.cp ? suggestPayment(ab.cost.cp, sources) : {};
      if (!suggested) return;
      const parts = chooseParts(s, ab, chooserOf(s, player, id, "ability"));
      if (!parts) return;
      out.push({
        type: "activate",
        source: id,
        ability: index,
        zone: obj(s, id).zone,
        label: ab.label,
        cost: ab.cost.cp ?? null,
        sources,
        suggested,
        choose: parts.choose,
        ...(parts.modal ? { modal: parts.modal } : {}),
        ...(special ? { special: { options: special } } : {}),
      });
    });
  }
  return out;
}

/** The options of the player's pending decision. */
export function legalActions(s: GameState, player: PlayerId): ActionOption[] {
  const p = s.pending;
  if (!p || p.player !== player || s.over) return [];
  switch (p.kind) {
    case "declareAttack":
      return [{ type: "attack", single: attackCandidates(s, player), parties: partyGroups(s, player) }, { type: "endAttacks" }];
    case "declareBlock":
      return [{ type: "block", blockers: blockCandidates(s, player), mustBlock: false }];
    case "priority":
      return [{ type: "pass" }, ...castOptions(s, player), ...abilityOptions(s, player)];
    default:
      return [];
  }
}

/** The options other than passing (the autopilot passes when there are none). */
export function meaningfulActions(s: GameState, player: PlayerId): ActionOption[] {
  return legalActions(s, player).filter((a) => a.type !== "pass");
}
