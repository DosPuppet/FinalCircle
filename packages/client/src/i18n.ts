/**
 * Card faces in the interface language, the labels of the game (phases, elements, keywords, types), and the game log
 * built from the engine's events. Every text is English in the source, translated by the catalogs (`translate.ts`).
 */
import type { AttackStep, CardFace, CardType, Element, GameEvent, GameView, Keyword, Phase, PlayerId } from "@finalcircle/engine";
import { msg } from "@finalcircle/engine";
import { type Lang, localize, textIn } from "./translate";

export const faceName = (f: CardFace | undefined, lang: Lang) => (lang === "fr" && f?.fr?.name) || f?.name || "?";
export const faceText = (f: CardFace | undefined, lang: Lang) => (lang === "fr" && f?.fr?.text) || f?.text || "";
export const faceJob = (f: CardFace | undefined, lang: Lang) => (lang === "fr" && f?.fr?.job) || f?.jobs.join("/") || "";

export const TYPE_LABEL: Record<CardType, string> = {
  Forward: msg("Forward"),
  Backup: msg("Backup"),
  Monster: msg("Monster"),
  Summon: msg("Summon"),
};

export const ELEMENT_LABEL: Record<Element, string> = {
  fire: msg("Fire"),
  ice: msg("Ice"),
  wind: msg("Wind"),
  earth: msg("Earth"),
  lightning: msg("Lightning"),
  water: msg("Water"),
  light: msg("Light"),
  dark: msg("Dark"),
};

export const KEYWORD_LABEL: Record<Keyword, string> = {
  haste: msg("Haste"),
  brave: msg("Brave"),
  firstStrike: msg("First Strike"),
  backAttack: msg("Back Attack"),
};

export const PHASE_LABEL: Record<Phase, string> = {
  active: msg("Active Phase"),
  draw: msg("Draw Phase"),
  main1: msg("Main Phase 1"),
  attack: msg("Attack Phase"),
  main2: msg("Main Phase 2"),
  end: msg("End Phase"),
};

export const STEP_LABEL: Record<AttackStep, string> = {
  preparation: msg("Preparation"),
  declaration: msg("Attack Declaration"),
  block: msg("Block Declaration"),
  damage: msg("Damage Resolution"),
};

/** An engine text with the cards it cites named in the interface language. */
export function localizeText(text: string, faces: Record<string, CardFace>, lang: Lang): string {
  return localize(text, lang, (defId) => faceName(faces[defId], lang));
}

export interface LogLine {
  text: string;
  /** Whose action it is (colors the line). */
  player?: PlayerId;
}

/** The log lines of a batch of events, from the viewer's point of view. */
export function describeEvents(events: GameEvent[], view: GameView, faces: Record<string, CardFace>, lang: Lang): LogLine[] {
  const me = view.viewer;
  const name = (p: PlayerId) => view.players[p]?.name ?? p;
  const card = (defId: string) => `⟦${defId}⟧`;
  const out: LogLine[] = [];
  const line = (player: PlayerId | undefined, text: string) =>
    out.push({ text: localizeText(text, faces, lang), ...(player ? { player } : {}) });
  for (const e of events) {
    switch (e.type) {
      case "turn":
        line(e.player, msg("Turn {n}: {player}", { n: e.number, player: name(e.player) }));
        break;
      case "cast":
        line(
          e.player,
          e.player === me
            ? msg("You cast {card}", { card: card(e.defId) })
            : msg("{player} casts {card}", { player: name(e.player), card: card(e.defId) }),
        );
        break;
      case "cp":
        if (e.discarded.length)
          line(
            e.player,
            e.player === me
              ? msg("You discard {n} card(s) for CP", { n: e.discarded.length })
              : msg("{player} discards {n} card(s) for CP", { player: name(e.player), n: e.discarded.length }),
          );
        if (e.dulled.length)
          line(
            e.player,
            e.player === me
              ? msg("You dull {n} Backup(s) for CP", { n: e.dulled.length })
              : msg("{player} dulls {n} Backup(s) for CP", { player: name(e.player), n: e.dulled.length }),
          );
        break;
      case "activate":
        line(
          e.player,
          e.player === me
            ? msg("You use an ability of {card}", { card: card(e.defId) })
            : msg("{player} uses an ability of {card}", { player: name(e.player), card: card(e.defId) }),
        );
        break;
      case "trigger":
        line(e.player, msg("Auto-ability of {card}", { card: card(e.defId) }));
        break;
      case "fizzle":
        line(undefined, msg("{card}: no legal target, no effect", { card: card(e.defId) }));
        break;
      case "moved":
        if (e.hidden) break;
        if (e.from === "field" && e.to === "break")
          line(
            e.owner,
            e.broken
              ? msg("{card} is broken", { card: card(e.defId) })
              : msg("{card} is put into the Break Zone", { card: card(e.defId) }),
          );
        else if (e.to === "hand" && (e.from === "break" || e.from === "field"))
          line(e.owner, msg("{card} returns to the hand", { card: card(e.defId) }));
        else if (e.to === "removed") line(e.owner, msg("{card} is removed from the game", { card: card(e.defId) }));
        else if (e.to === "lb" && e.from !== "lb") line(e.owner, msg("{card} returns to the LB deck", { card: card(e.defId) }));
        break;
      case "attack":
        line(
          e.player,
          e.attackers.length > 1
            ? e.player === me
              ? msg("You attack with a party of {n} Forwards", { n: e.attackers.length })
              : msg("{player} attacks with a party of {n} Forwards", { player: name(e.player), n: e.attackers.length })
            : e.player === me
              ? msg("You attack")
              : msg("{player} attacks", { player: name(e.player) }),
        );
        break;
      case "block":
        line(
          e.player,
          e.blocker
            ? e.player === me
              ? msg("You block")
              : msg("{player} blocks", { player: name(e.player) })
            : e.player === me
              ? msg("You do not block")
              : msg("{player} does not block", { player: name(e.player) }),
        );
        break;
      case "playerDamage":
        line(
          e.player,
          e.player === me
            ? msg("You take {n} damage", { n: e.amount })
            : msg("{player} takes {n} damage", { player: name(e.player), n: e.amount }),
        );
        break;
      case "exBurst":
        if (e.used) line(e.player, msg("EX BURST: {card}", { card: card(e.defId) }));
        break;
      case "draw":
        line(
          e.player,
          e.player === me
            ? msg("You draw {n} card(s)", { n: e.count })
            : msg("{player} draws {n} card(s)", { player: name(e.player), n: e.count }),
        );
        break;
      case "discard":
        line(
          e.player,
          e.player === me
            ? msg("You discard {n} card(s)", { n: e.cards.length })
            : msg("{player} discards {n} card(s)", { player: name(e.player), n: e.cards.length }),
        );
        break;
      case "mulligan":
        line(
          e.player,
          e.player === me ? msg("You take a mulligan") : msg("{player} takes a mulligan", { player: name(e.player) }),
        );
        break;
      case "lbFlip":
        line(e.player, msg("{n} LB card(s) turned face up", { n: e.cards.length }));
        break;
      case "gameOver":
        line(
          undefined,
          e.winner === "draw"
            ? msg("The game is a draw")
            : e.winner === me
              ? msg("You win the game")
              : msg("{player} wins the game", { player: name(e.winner) }),
        );
        break;
      default:
        break;
    }
  }
  return out;
}

/** A label of the tables above, in a language. */
export const label = (lang: Lang, text: string) => textIn(lang, text);
