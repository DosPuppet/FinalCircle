/**
 * Everything the game asks the player outside the main button: the mulligan, the engine's questions (pick, yes/no,
 * number, order, division), the cards to discard at the end of the turn, the modes and targets of a card being cast,
 * the ability chooser of a card, and the end of the game.
 */
import type { ChoiceRequest, GameView, ObjectId, ObjectView } from "@finalcircle/engine";
import { useEffect, useState } from "react";
import { Card } from "../board/Card";
import { Dialog } from "../Dialog";
import { faceName } from "../i18n";
import { useLocalize, useLocalizedView, useT } from "../localize";
import { chooseOf, priorityActions, targetsOk, useGame } from "../store";

type ChoiceView = Extract<NonNullable<GameView["pending"]>, { kind: "choice" }>;

/** Every card the view shows, to draw the options of a question. */
function objectsOf(view: GameView, extra: ObjectView[] = []): ObjectView[] {
  return [
    ...extra,
    ...view.field,
    ...view.hand,
    ...Object.values(view.players).flatMap((p) => [...p.breakZone, ...p.damage, ...p.removed, ...p.lb]),
  ];
}

/** The card that asks the question, above the prompt. */
function SourceCard({ source }: { source?: { defId: string; label?: string } }) {
  const faces = useGame((s) => s.faces);
  const lang = useGame((s) => s.lang);
  const loc = useLocalize();
  if (!source) return null;
  const face = faces[source.defId];
  return (
    <div className="prompt-source">
      <Card face={face} className="prompt-card" />
      <div>
        <b>{faceName(face, lang)}</b>
        {source.label ? <div className="dim">{loc(source.label)}</div> : null}
      </div>
    </div>
  );
}

function OptionButton({
  id,
  view,
  objects,
  labels,
  selected,
  onClick,
}: {
  id: string;
  view: GameView;
  objects: ObjectView[];
  labels?: Record<string, string>;
  selected: boolean;
  onClick: () => void;
}) {
  const faces = useGame((s) => s.faces);
  const t = useT();
  const o = objects.find((x) => x.id === id);
  if (o && !labels?.[id]) return <Card obj={o} face={faces[o.defId]} glow={selected ? "chosen" : "target"} onClick={onClick} />;
  const text = labels?.[id] ?? (id === view.viewer ? t("You") : (view.players[id]?.name ?? id));
  return (
    <button type="button" className={`btn choice${selected ? " primary" : ""}`} onClick={onClick} aria-pressed={selected}>
      {text}
    </button>
  );
}

function PickPanel({ view, p, req }: { view: GameView; p: ChoiceView; req: Extract<ChoiceRequest, { type: "pick" }> }) {
  const selection = useGame((s) => s.selection);
  const setSelection = useGame((s) => s.setSelection);
  const clickCard = useGame((s) => s.clickCard);
  const decide = useGame((s) => s.decide);
  const t = useT();
  const objects = objectsOf(view, p.objects);
  // Options on the field or in the hand are clicked on the board; the others are shown here.
  const onBoard = new Set([...view.field, ...view.hand].map((o) => o.id));
  const shown = req.options.filter((id) => !onBoard.has(id) || req.labels?.[id]);
  const valid = selection.length >= req.min && selection.length <= req.max;
  return (
    <div className="choice-panel" role="dialog" aria-label={req.prompt} data-testid="choice">
      <SourceCard source={p.source} />
      <p className="prompt-text">{req.prompt}</p>
      {shown.length ? (
        <div className="choice-options">
          {shown.map((id) => (
            <OptionButton
              key={id}
              id={id}
              view={view}
              objects={objects}
              labels={req.labels}
              selected={selection.includes(id)}
              onClick={() => clickCard(id)}
            />
          ))}
        </div>
      ) : (
        <p className="dim">{t("Click the highlighted cards — selection: {n} / {max}", { n: selection.length, max: req.max })}</p>
      )}
      <div className="prompt-actions">
        <button
          type="button"
          className="btn ghost"
          onClick={() => setSelection(req.suggested.map(String))}
          data-testid="choice-suggest"
        >
          {t("Suggestion")}
        </button>
        <button
          type="button"
          className="btn primary"
          disabled={!valid}
          onClick={() => decide({ type: "choose", values: selection })}
          data-testid="choice-confirm"
        >
          {selection.length === 0 && req.min === 0 ? t("None") : t("Confirm")}
        </button>
      </div>
    </div>
  );
}

function OrderPanel({ view, p, req }: { view: GameView; p: ChoiceView; req: Extract<ChoiceRequest, { type: "order" }> }) {
  const decide = useGame((s) => s.decide);
  const faces = useGame((s) => s.faces);
  const lang = useGame((s) => s.lang);
  const loc = useLocalize();
  const t = useT();
  const [items, setItems] = useState<string[]>(req.suggested.length === req.items.length ? req.suggested.map(String) : req.items);
  const objects = objectsOf(view, p.objects);
  const move = (i: number, d: number) => {
    const next = [...items];
    const [x] = next.splice(i, 1);
    if (x !== undefined) next.splice(i + d, 0, x);
    setItems(next);
  };
  const nameOf = (id: string) => {
    if (req.labels?.[id]) return loc(req.labels[id]);
    const o = objects.find((x) => x.id === id);
    return o ? faceName(faces[o.defId], lang) : id;
  };
  return (
    <Dialog title={req.prompt} before={<SourceCard source={p.source} />}>
      <ol className="order-list">
        {items.map((id, i) => (
          <li key={id}>
            <span>{nameOf(id)}</span>
            <button
              type="button"
              className="btn small ghost"
              disabled={i === 0}
              onClick={() => move(i, -1)}
              aria-label={t("Move up")}
            >
              ↑
            </button>
            <button
              type="button"
              className="btn small ghost"
              disabled={i === items.length - 1}
              onClick={() => move(i, 1)}
              aria-label={t("Move down")}
            >
              ↓
            </button>
          </li>
        ))}
      </ol>
      <div className="prompt-actions">
        <button type="button" className="btn primary" onClick={() => decide({ type: "choose", values: items })}>
          {t("Confirm")}
        </button>
      </div>
    </Dialog>
  );
}

function DividePanel({ view, p, req }: { view: GameView; p: ChoiceView; req: Extract<ChoiceRequest, { type: "divide" }> }) {
  const decide = useGame((s) => s.decide);
  const faces = useGame((s) => s.faces);
  const lang = useGame((s) => s.lang);
  const t = useT();
  const step = req.step ?? 1;
  const [values, setValues] = useState<number[]>(
    req.suggested.length === req.among.length ? req.suggested.map(Number) : req.among.map((_, i) => (i === 0 ? req.total : 0)),
  );
  const objects = objectsOf(view, p.objects);
  const sum = values.reduce((a, b) => a + b, 0);
  const set = (i: number, d: number) => setValues(values.map((v, j) => (j === i ? Math.max(req.minEach ?? 0, v + d) : v)));
  return (
    <Dialog title={req.prompt} before={<SourceCard source={p.source} />}>
      <div className="divide-list">
        {req.among.map((id, i) => {
          const o = objects.find((x) => x.id === id);
          return (
            <div key={id} className="divide-row">
              {o ? <Card obj={o} face={faces[o.defId]} /> : null}
              <span>{o ? faceName(faces[o.defId], lang) : id}</span>
              <button type="button" className="btn small ghost" onClick={() => set(i, -step)} aria-label={t("Less")}>
                −
              </button>
              <b>{values[i]}</b>
              <button type="button" className="btn small ghost" onClick={() => set(i, step)} aria-label={t("More")}>
                +
              </button>
            </div>
          );
        })}
      </div>
      <p className={sum === req.total ? "dim" : "warn"}>{t("{n} of {total} divided", { n: sum, total: req.total })}</p>
      <div className="prompt-actions">
        <button
          type="button"
          className="btn primary"
          disabled={sum !== req.total}
          onClick={() => decide({ type: "choose", values })}
        >
          {t("Confirm")}
        </button>
      </div>
    </Dialog>
  );
}

function NumberPanel({ p, req }: { p: ChoiceView; req: Extract<ChoiceRequest, { type: "number" }> }) {
  const decide = useGame((s) => s.decide);
  const t = useT();
  const [n, setN] = useState<number>(Number(req.suggested[0] ?? req.min));
  return (
    <Dialog title={req.prompt} before={<SourceCard source={p.source} />}>
      <div className="number-row">
        <button type="button" className="btn ghost" disabled={n <= req.min} onClick={() => setN(n - 1)} aria-label={t("Less")}>
          −
        </button>
        <b>{n}</b>
        <button type="button" className="btn ghost" disabled={n >= req.max} onClick={() => setN(n + 1)} aria-label={t("More")}>
          +
        </button>
      </div>
      <div className="prompt-actions">
        <button type="button" className="btn primary" onClick={() => decide({ type: "choose", values: [n] })}>
          {t("Confirm")}
        </button>
      </div>
    </Dialog>
  );
}

function YesNoPanel({ view, p }: { view: GameView; p: ChoiceView }) {
  const decide = useGame((s) => s.decide);
  const faces = useGame((s) => s.faces);
  const t = useT();
  const req = p.request;
  if (!req) return null;
  const exCard =
    p.purpose?.kind === "exBurst"
      ? objectsOf(view, p.objects).find((o) => o.id === (p.purpose as { card: ObjectId }).card)
      : undefined;
  return (
    <Dialog
      title={req.prompt}
      className={exCard ? "ex-burst" : ""}
      before={
        exCard ? (
          <div className="ex-reveal">
            <span className="ex-title">EX BURST</span>
            <Card obj={exCard} face={faces[exCard.defId]} size="full" />
          </div>
        ) : (
          <SourceCard source={p.source} />
        )
      }
    >
      <div className="prompt-actions">
        <button
          type="button"
          className="btn ghost"
          onClick={() => decide({ type: "choose", values: [0] })}
          data-testid="choice-no"
        >
          {t("No")}
        </button>
        <button
          type="button"
          className="btn primary"
          onClick={() => decide({ type: "choose", values: [1] })}
          data-testid="choice-yes"
        >
          {t("Yes")}
        </button>
      </div>
    </Dialog>
  );
}

function ChoicePrompt({ view: raw }: { view: GameView }) {
  const view = useLocalizedView(raw);
  const p = view.pending;
  if (p?.kind !== "choice" || p.player !== view.viewer || !p.request) return null;
  const req = p.request;
  // A new question: a new form (the state of the previous one is not kept).
  const key = JSON.stringify(req);
  switch (req.type) {
    case "pick":
      return <PickPanel key={key} view={view} p={p} req={req} />;
    case "order":
      return <OrderPanel key={key} view={view} p={p} req={req} />;
    case "divide":
      return <DividePanel key={key} view={view} p={p} req={req} />;
    case "number":
      return <NumberPanel key={key} p={p} req={req} />;
    case "yesNo":
      return <YesNoPanel key={key} view={view} p={p} />;
  }
}

function MulliganPrompt({ view }: { view: GameView }) {
  const decide = useGame((s) => s.decide);
  const t = useT();
  const p = view.pending;
  if (p?.kind !== "mulligan" || p.player !== view.viewer) return null;
  return (
    <div className="choice-panel mulligan" role="dialog" aria-label={t("Your opening hand")} data-testid="mulligan">
      <p className="prompt-text">
        {p.mulliganed
          ? t("Your new hand of 5 cards.")
          : t("Keep these 5 cards, or put them at the bottom of your deck and draw 5 new ones (once)?")}
      </p>
      <div className="prompt-actions">
        {!p.mulliganed ? (
          <button type="button" className="btn ghost" onClick={() => decide({ type: "mulligan" })} data-testid="mulligan-btn">
            {t("Mulligan")}
          </button>
        ) : null}
        <button type="button" className="btn primary" onClick={() => decide({ type: "keep" })} data-testid="keep-btn">
          {t("Keep")}
        </button>
      </div>
    </div>
  );
}

function DiscardPrompt({ view }: { view: GameView }) {
  const selection = useGame((s) => s.selection);
  const decide = useGame((s) => s.decide);
  const t = useT();
  const p = view.pending;
  if (p?.kind !== "discard" || p.player !== view.viewer) return null;
  return (
    <div className="choice-panel" role="dialog" aria-label={t("Discard")} data-testid="discard">
      <p className="prompt-text">
        {t("End of the turn: discard down to 5 cards. Click {n} card(s) of your hand.", { n: p.count })}
      </p>
      <div className="prompt-actions">
        <button
          type="button"
          className="btn primary"
          disabled={selection.length !== p.count}
          onClick={() => decide({ type: "discard", cards: selection })}
        >
          {t("Discard ({n}/{count})", { n: selection.length, count: p.count })}
        </button>
      </div>
    </div>
  );
}

/** Modes of a modal Summon or ability (CR 11.3.4): "select 1 of the 3 following actions". */
function ModesDialog() {
  const casting = useGame((s) => s.casting);
  const setModes = useGame((s) => s.setModes);
  const cancel = useGame((s) => s.cancelCast);
  const loc = useLocalize();
  const t = useT();
  const [picked, setPicked] = useState<number[]>([]);
  const modal = casting?.option.modal;
  if (casting?.stage !== "modes" || !modal) return null;
  const toggle = (i: number) => setPicked(picked.includes(i) ? picked.filter((x) => x !== i) : [...picked, i].slice(-modal.pick));
  const valid = modal.upTo
    ? picked.length >= 1 && picked.length <= modal.pick
    : picked.length === Math.min(modal.pick, modal.available.length);
  return (
    <Dialog
      title={modal.upTo ? t("Select up to {n} mode(s)", { n: modal.pick }) : t("Select {n} mode(s)", { n: modal.pick })}
      onClose={cancel}
    >
      <div className="modes">
        {modal.labels.map((l, i) => (
          <button
            type="button"
            key={l}
            className={`btn mode${picked.includes(i) ? " primary" : ""}`}
            disabled={!modal.available.includes(i)}
            aria-pressed={picked.includes(i)}
            onClick={() => toggle(i)}
          >
            {loc(l)}
          </button>
        ))}
      </div>
      <div className="prompt-actions">
        <button type="button" className="btn ghost" onClick={cancel}>
          {t("Cancel")}
        </button>
        <button type="button" className="btn primary" disabled={!valid} onClick={() => setModes(picked)}>
          {t("Confirm")}
        </button>
      </div>
    </Dialog>
  );
}

/** The targets of a card being cast are clicked on the board; this banner counts them. */
function TargetsBanner() {
  const casting = useGame((s) => s.casting);
  const confirm = useGame((s) => s.confirmCast);
  const cancel = useGame((s) => s.cancelCast);
  const faces = useGame((s) => s.faces);
  const view = useGame((s) => s.view);
  const lang = useGame((s) => s.lang);
  const t = useT();
  if (casting?.stage !== "targets" || !view) return null;
  const choose = chooseOf(casting);
  const want = choose.reduce((a, o) => a + Math.min(o.count, o.options.length), 0);
  const have = choose.reduce((a, o) => a + (casting.targets[o.key]?.length ?? 0), 0);
  const id = casting.option.type === "cast" ? casting.option.card : casting.option.source;
  const obj = objectsOf(view).find((o) => o.id === id);
  // Targets outside the board (Break Zone): shown here.
  const onBoard = new Set([...view.field, ...view.hand].map((o) => o.id));
  const off = [...new Set(choose.flatMap((o) => o.options))].filter((x) => !onBoard.has(x));
  const objects = objectsOf(view);
  return (
    <div className="choice-panel targets" role="dialog" aria-label={t("Choose the targets")} data-testid="targets">
      <p className="prompt-text">
        <b>{obj ? faceName(faces[obj.defId], lang) : ""}</b> — {t("Choose the targets: {n} / {max}", { n: have, max: want })}
      </p>
      {off.length ? (
        <div className="choice-options">
          {off.map((x) => {
            const o = objects.find((y) => y.id === x);
            const chosen = Object.values(casting.targets).flat().includes(x);
            return o ? (
              <Card
                key={x}
                obj={o}
                face={faces[o.defId]}
                glow={chosen ? "chosen" : "target"}
                onClick={() => useGame.getState().clickCard(x)}
              />
            ) : null;
          })}
        </div>
      ) : null}
      <div className="prompt-actions">
        <button type="button" className="btn ghost" onClick={cancel}>
          {t("Cancel")}
        </button>
        <button type="button" className="btn primary" disabled={!targetsOk(casting)} onClick={confirm}>
          {t("Confirm")}
        </button>
      </div>
    </div>
  );
}

/** A card with several uses (cast it, or one of its abilities). */
function AbilityMenu({ view }: { view: GameView }) {
  const id = useGame((s) => s.abilityMenu);
  const close = useGame((s) => s.closeAbilityMenu);
  const begin = useGame((s) => s.beginCast);
  const faces = useGame((s) => s.faces);
  const lang = useGame((s) => s.lang);
  const loc = useLocalize();
  const t = useT();
  if (!id) return null;
  const options = priorityActions(view).filter(
    (o) => (o.type === "cast" && o.card === id) || (o.type === "activate" && o.source === id),
  );
  const obj = objectsOf(view).find((o) => o.id === id);
  const face = obj ? faces[obj.defId] : undefined;
  return (
    <Dialog title={faceName(face, lang)} onClose={close}>
      <div className="modes">
        {options.map((o, i) =>
          o.type === "cast" ? (
            <button type="button" key={`c${i}`} className="btn mode" onClick={() => begin(o)} data-testid="ability-cast">
              {t("Cast")}
            </button>
          ) : o.type === "activate" ? (
            <button
              type="button"
              key={`a${o.ability}`}
              className="btn mode"
              onClick={() => begin(o)}
              data-testid={`ability-${o.ability}`}
            >
              {loc(o.label)}
            </button>
          ) : null,
        )}
      </div>
    </Dialog>
  );
}

function GameOver({ view }: { view: GameView }) {
  const leave = useGame((s) => s.leaveGame);
  const exportGame = useGame((s) => s.exportGame);
  const replaying = useGame((s) => !!s.replay);
  const online = useGame((s) => s.online);
  const rematch = useGame((s) => s.rematch);
  const t = useT();
  const [shown, setShown] = useState(true);
  // biome-ignore lint/correctness/useExhaustiveDependencies: shown again when a game ends
  useEffect(() => {
    setShown(true);
  }, [view.over]);
  if (!view.over || !shown || replaying) return null;
  const title = view.winner === "draw" ? t("Draw") : view.winner === view.viewer ? t("Victory") : t("Defeat");
  return (
    <Dialog title={title} className="game-over" onClose={() => setShown(false)} testId="game-over">
      <p>
        {view.winner === view.viewer
          ? t("Your opponent has taken 7 damage, or could not draw.")
          : view.winner === "draw"
            ? t("Both players lost at the same time.")
            : t("You have taken 7 damage, or could not draw.")}
      </p>
      <div className="prompt-actions">
        <button type="button" className="btn ghost" onClick={() => setShown(false)} data-testid="see-board">
          {t("See the board")}
        </button>
        <button type="button" className="btn ghost" onClick={() => exportGame("download")} data-testid="download-game">
          {t("Download the game")}
        </button>
        <button type="button" className="btn" onClick={() => exportGame("replay")} data-testid="watch-replay">
          {t("Watch the replay")}
        </button>
        {online ? (
          <button
            type="button"
            className="btn"
            disabled={online.players.some((p) => p.seat === online.seat && p.rematch)}
            onClick={rematch}
            data-testid="rematch"
          >
            {online.players.some((p) => p.seat !== online.seat && p.rematch) ? t("Accept the rematch") : t("Rematch")}
          </button>
        ) : null}
        <button type="button" className="btn primary" onClick={leave}>
          {t("Back to the menu")}
        </button>
      </div>
      {online?.players.some((p) => p.seat === online.seat && p.rematch) ? (
        <p className="dim">{t("Waiting for your opponent's answer…")}</p>
      ) : null}
    </Dialog>
  );
}

export function Prompts() {
  const view = useGame((s) => s.view);
  if (!view) return null;
  return (
    <>
      <MulliganPrompt view={view} />
      <ChoicePrompt view={view} />
      <DiscardPrompt view={view} />
      <ModesDialog />
      <TargetsBanner />
      <AbilityMenu view={view} />
      <GameOver view={view} />
    </>
  );
}
