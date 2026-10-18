/**
 * The game screen: each player's field (Forwards in front, Backups behind, CR 7.7), their zones (main deck, Damage
 * Zone of 7, Break Zone, LB deck), the phase track, the stack, the hand, the main button, the preview and the log.
 */
import type { AttackStep, CardFace, GameView, ObjectView, Phase, PlayerId } from "@finalcircle/engine";
import { useEffect, useRef, useState } from "react";
import { Dialog } from "../Dialog";
import { faceName, PHASE_LABEL, STEP_LABEL } from "../i18n";
import { LangToggle } from "../LangToggle";
import { useLocalize, useT } from "../localize";
import { chooseOf, mainAction, pickOf, priorityActions, useGame } from "../store";
import { textIn } from "../translate";
import { Card, type Glow } from "./Card";
import { PaymentTray } from "./PaymentTray";
import { Preview } from "./Preview";

const PHASES: Phase[] = ["active", "draw", "main1", "attack", "main2", "end"];
const STEPS: AttackStep[] = ["preparation", "declaration", "block", "damage"];

/** The highlight of a card, from what the player is choosing now. */
function useGlow(): (o: ObjectView) => Glow {
  const view = useGame((s) => s.view);
  const casting = useGame((s) => s.casting);
  const party = useGame((s) => s.party);
  const blocker = useGame((s) => s.blocker);
  const selection = useGame((s) => s.selection);
  return (o) => {
    if (!view) return null;
    const pick = pickOf(view);
    if (pick) return selection.includes(o.id) ? "chosen" : pick.options.includes(o.id) ? "target" : null;
    if (view.pending?.kind === "discard" && view.pending.player === view.viewer && o.zone === "hand")
      return selection.includes(o.id) ? "chosen" : "target";
    if (casting?.stage === "targets") {
      const chosen = Object.values(casting.targets).flat();
      if (chosen.includes(o.id)) return "chosen";
      return chooseOf(casting).some((c) => c.options.includes(o.id)) ? "target" : null;
    }
    if (casting?.stage === "pay") {
      const used = [...(casting.payment.discard ?? []).map((d) => d.card), ...(casting.payment.dull ?? []).map((d) => d.backup)];
      if (used.includes(o.id)) return "chosen";
      return casting.option.sources.some((x) => x.id === o.id) ? "source" : null;
    }
    const p = view.pending;
    if (p?.kind === "declareAttack" && p.player === view.viewer) {
      if (party.includes(o.id)) return "selected";
      if ((p.single ?? []).includes(o.id)) return "playable";
    }
    if (p?.kind === "declareBlock" && p.player === view.viewer) {
      if (blocker === o.id) return "selected";
      if ((p.blockers ?? []).includes(o.id)) return "playable";
    }
    if (o.attacking) return "attacking";
    if (o.blocking) return "blocking";
    if (priorityActions(view).some((a) => (a.type === "cast" && a.card === o.id) || (a.type === "activate" && a.source === o.id)))
      return "playable";
    return null;
  };
}

function FieldSide({ view, player, mine }: { view: GameView; player: PlayerId; mine: boolean }) {
  const faces = useGame((s) => s.faces);
  const clickCard = useGame((s) => s.clickCard);
  const glow = useGlow();
  const cards = view.field.filter((o) => o.controller === player);
  const forwards = cards.filter((o) => faces[o.defId]?.type !== "Backup");
  const backups = cards.filter((o) => faces[o.defId]?.type === "Backup");
  const row = (list: ObjectView[], kind: "forwards" | "backups") => (
    <div className={`field-row ${kind}`} data-tuto={mine ? `my-${kind}` : `opp-${kind}`}>
      {list.map((o) => (
        <Card key={o.id} obj={o} face={faces[o.defId]} glow={glow(o)} onClick={() => clickCard(o.id)} />
      ))}
      {kind === "backups"
        ? Array.from({ length: Math.max(0, 5 - list.length) }, (_, i) => <div key={`slot${i}`} className="backup-slot" />)
        : null}
    </div>
  );
  return (
    <section className={`field ${mine ? "me" : "opp"}`}>
      {mine ? (
        <>
          {row(forwards, "forwards")}
          {row(backups, "backups")}
        </>
      ) : (
        <>
          {row(backups, "backups")}
          {row(forwards, "forwards")}
        </>
      )}
    </section>
  );
}

function ZoneDialog({ title, cards, onClose }: { title: string; cards: ObjectView[]; onClose: () => void }) {
  const faces = useGame((s) => s.faces);
  return (
    <Dialog title={title} onClose={onClose} className="zone-dialog">
      <div className="zone-cards">
        {cards.length ? cards.map((o) => <Card key={o.id} obj={o} face={faces[o.defId]} />) : <p className="dim">—</p>}
      </div>
    </Dialog>
  );
}

function Zones({ view, player, mine }: { view: GameView; player: PlayerId; mine: boolean }) {
  const faces = useGame((s) => s.faces);
  const t = useT();
  const [open, setOpen] = useState<"break" | "lb" | "removed" | null>(null);
  const pl = view.players[player];
  if (!pl) return null;
  const top = pl.breakZone[pl.breakZone.length - 1];
  const faceDown = pl.lb.filter((o) => o.faceDown).length;
  return (
    <div className={`zones ${mine ? "me" : "opp"}`}>
      <div className="player-name" data-tuto={mine ? "my-name" : "opp-name"}>
        {pl.name}
        {view.turn.active === player ? <span className="turn-dot" title={t("Turn player")} /> : null}
      </div>
      <div className="damage-zone" data-tuto={mine ? "my-damage" : "opp-damage"} title={t("Damage Zone")}>
        {Array.from({ length: 7 }, (_, i) => {
          const o = pl.damage[i];
          const f = o ? faces[o.defId] : undefined;
          return (
            <div key={i} className={`damage-slot${o ? " filled" : ""}${i === 6 ? " last" : ""}${f?.exBurst ? " ex" : ""}`}>
              {o ? <Card obj={o} face={f} /> : <span>{i + 1}</span>}
            </div>
          );
        })}
        <span className="damage-count">{pl.damage.length}/7</span>
      </div>
      <div className="piles">
        <button type="button" className="pile deck" data-tuto={mine ? "my-deck" : "opp-deck"} title={t("Main deck")}>
          <Card face={undefined} />
          <span className="pile-count">{pl.deckCount}</span>
        </button>
        <button
          type="button"
          className="pile break"
          data-tuto={mine ? "my-break" : "opp-break"}
          title={t("Break Zone")}
          onClick={() => setOpen("break")}
        >
          {top ? <Card obj={top} face={faces[top.defId]} /> : <div className="pile-empty" />}
          <span className="pile-count">{pl.breakZone.length}</span>
        </button>
        <button
          type="button"
          className="pile lb"
          data-tuto={mine ? "my-lb" : "opp-lb"}
          title={t("LB deck")}
          onClick={() => setOpen("lb")}
        >
          {pl.lb.length ? <Card face={undefined} /> : <div className="pile-empty" />}
          <span className="pile-count">{t("LB {down}/{all}", { down: faceDown, all: pl.lb.length })}</span>
        </button>
        {pl.removed.length ? (
          <button type="button" className="pile removed" title={t("Removed from play")} onClick={() => setOpen("removed")}>
            <div className="pile-empty" />
            <span className="pile-count">{pl.removed.length}</span>
          </button>
        ) : null}
        {!mine ? (
          <div className="opp-hand" title={t("Cards in hand")}>
            <Card face={undefined} />
            <span className="pile-count">{pl.handCount}</span>
          </div>
        ) : null}
        {pl.crystals ? <div className="crystals">◆ {pl.crystals}</div> : null}
      </div>
      {open === "break" ? <ZoneDialog title={t("Break Zone")} cards={pl.breakZone} onClose={() => setOpen(null)} /> : null}
      {open === "lb" ? <ZoneDialog title={t("LB deck")} cards={pl.lb} onClose={() => setOpen(null)} /> : null}
      {open === "removed" ? <ZoneDialog title={t("Removed from play")} cards={pl.removed} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

function PhaseTrack({ view }: { view: GameView }) {
  const lang = useGame((s) => s.lang);
  return (
    <div className="phase-track" data-tuto="phases">
      {PHASES.map((p) => (
        <span key={p} className={`phase${view.turn.phase === p ? " on" : ""}`}>
          {textIn(lang, PHASE_LABEL[p])}
          {p === "attack" && view.turn.phase === "attack" ? (
            <span className="steps">
              {STEPS.map((st) => (
                <span key={st} className={`step${view.turn.step === st ? " on" : ""}`}>
                  {textIn(lang, STEP_LABEL[st])}
                </span>
              ))}
            </span>
          ) : null}
        </span>
      ))}
    </div>
  );
}

function StackView({ view }: { view: GameView }) {
  const faces = useGame((s) => s.faces);
  const lang = useGame((s) => s.lang);
  const loc = useLocalize();
  const t = useT();
  if (!view.stack.length) return null;
  return (
    <div className="stack" data-tuto="stack">
      <div className="stack-title">{t("Stack")}</div>
      {[...view.stack].reverse().map((item) => {
        const face: CardFace | undefined = faces[item.defId];
        return (
          <div key={item.id} className={`stack-item ${item.controller === view.viewer ? "me" : "opp"}`}>
            <Card face={face} />
            <div className="stack-label">
              <b>{faceName(face, lang)}</b>
              {item.label ? <span>{loc(item.label)}</span> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Hand({ view }: { view: GameView }) {
  const faces = useGame((s) => s.faces);
  const clickCard = useGame((s) => s.clickCard);
  const glow = useGlow();
  return (
    <div className="hand" data-tuto="hand">
      {view.hand.map((o) => (
        <Card key={o.id} obj={o} face={faces[o.defId]} glow={glow(o)} onClick={() => clickCard(o.id)} className="hand-card" />
      ))}
    </div>
  );
}

function MainButton({ view }: { view: GameView }) {
  const party = useGame((s) => s.party);
  const blocker = useGame((s) => s.blocker);
  const decide = useGame((s) => s.decide);
  const endTurn = useGame((s) => s.endTurn);
  const busy = useGame((s) => s.busy);
  const casting = useGame((s) => s.casting);
  const loc = useLocalize();
  const t = useT();
  const action = mainAction(view, party, blocker);
  const waiting = !action && !view.over;
  return (
    <div className="main-actions">
      {action && !casting ? (
        <button
          type="button"
          className="main-button btn"
          data-tuto="mainButton"
          disabled={busy}
          onClick={() => (action.decision === "endTurn" ? endTurn() : decide(action.decision))}
        >
          {loc(action.label)}
        </button>
      ) : null}
      {waiting ? <span className="waiting">{t("The opponent is playing…")}</span> : null}
      {view.turn.active === view.viewer && !view.over && !casting ? (
        <button type="button" className="btn ghost" onClick={() => endTurn()} title={t("Pass until the end of the turn")}>
          {t("End turn")}
        </button>
      ) : null}
    </div>
  );
}

function Log() {
  const log = useGame((s) => s.log);
  const view = useGame((s) => s.view);
  const end = useRef<HTMLDivElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on each new line
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [log.length]);
  return (
    <div className="log" data-tuto="log">
      {log.map((l, i) => (
        <div key={i} className={`log-line ${l.player === view?.viewer ? "me" : l.player ? "opp" : ""}`}>
          {l.text}
        </div>
      ))}
      <div ref={end} />
    </div>
  );
}

function Settings() {
  const settings = useGame((s) => s.settings);
  const setSettings = useGame((s) => s.setSettings);
  const decide = useGame((s) => s.decide);
  const leave = useGame((s) => s.leaveGame);
  const over = useGame((s) => s.view?.over);
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <div className="settings">
      <button type="button" className="btn ghost" onClick={() => setOpen(!open)} aria-expanded={open} data-tuto="settings">
        ☰
      </button>
      {open ? (
        <div className="settings-panel">
          <LangToggle />
          <label>
            <input type="checkbox" checked={!!settings.autoPay} onChange={(e) => setSettings({ autoPay: e.target.checked })} />
            {t("Pay automatically")}
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings.fullControl}
              onChange={(e) => setSettings({ fullControl: e.target.checked })}
            />
            {t("Full control")}
          </label>
          {!over ? (
            <button type="button" className="btn danger" onClick={() => decide({ type: "concede" })}>
              {t("Concede")}
            </button>
          ) : null}
          <button type="button" className="btn" onClick={leave}>
            {t("Back to the menu")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function Board() {
  const view = useGame((s) => s.view);
  const t = useT();
  if (!view) return <div className="loading">{t("Loading the game…")}</div>;
  const me = view.viewer;
  const opp = view.opponent;
  return (
    <div className="game">
      <aside className="side-panel">
        <Preview />
        <Log />
      </aside>
      <main className="table">
        <Zones view={view} player={opp} mine={false} />
        <FieldSide view={view} player={opp} mine={false} />
        <div className="center-strip">
          <PhaseTrack view={view} />
          <StackView view={view} />
          <MainButton view={view} />
          <Settings />
        </div>
        <FieldSide view={view} player={me} mine />
        <Zones view={view} player={me} mine />
        <Hand view={view} />
      </main>
      <PaymentTray />
    </div>
  );
}
