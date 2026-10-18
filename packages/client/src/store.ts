/**
 * The interface's state (Zustand, Planecircle's design): screens, the game session and its view, the playback of the
 * updates, the language and the settings, and the interaction of the game screen: casting a card or using an ability
 * (modes, targets, CP payment), choosing the attackers of a party, the blocker.
 */
import type { AiLevel } from "@finalcircle/ai";
import { CARDS, type DeckEntries, deckById, findCard } from "@finalcircle/cards";
import {
  type ActionOption,
  type AutopilotSettings,
  type CardDef,
  type CardFace,
  checkPayment,
  DEFAULT_AUTOPILOT,
  type Decision,
  type Element,
  type GameEvent,
  type GameView,
  msg,
  type ObjectId,
  type Payment,
  type PendingView,
  RulesError,
} from "@finalcircle/engine";
import { create } from "zustand";
import { fastMode } from "./fast";
import { describeEvents, type LogLine } from "./i18n";
import type { FromWorker } from "./protocol";
import { clearSavedGame, loadSavedGame, SaveWriter } from "./savedGame";
import { LocalSession, type Session } from "./session";
import { type Lang, setTextLang, t } from "./translate";

export type Screen = "lobby" | "game";

/** An option being cast or used: its modes, targets, payment, LB flips and same-name discard. */
export interface Casting {
  option: Extract<ActionOption, { type: "cast" | "activate" }>;
  stage: "modes" | "targets" | "pay";
  modes: number[];
  targets: Record<string, ObjectId[]>;
  payment: Payment;
  lbFlip: ObjectId[];
  special?: ObjectId;
}

const LANG_KEY = "finalcircle.lang";
const SETTINGS_KEY = "finalcircle.autopilot";
const LEVEL_KEY = "finalcircle.aiLevel";

function loadLang(): Lang {
  try {
    return localStorage.getItem(LANG_KEY) === "en" ? "en" : "fr";
  } catch {
    return "fr";
  }
}

export interface ClientSettings extends AutopilotSettings {
  /** Pay automatically with the suggested payment (no payment tray). */
  autoPay?: boolean;
}

function loadSettings(): ClientSettings {
  try {
    return { ...DEFAULT_AUTOPILOT, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") as Partial<ClientSettings>) };
  } catch {
    return { ...DEFAULT_AUTOPILOT };
  }
}

function loadLevel(): AiLevel {
  try {
    const l = localStorage.getItem(LEVEL_KEY);
    return l === "beginner" || l === "expert" ? l : "medium";
  } catch {
    return "medium";
  }
}

/** Definitions of the cards of some decks: the worker does not bundle the card database. */
export function defsFor(decks: DeckEntries[]): Record<string, CardDef> {
  const out: Record<string, CardDef> = {};
  for (const d of decks)
    for (const [, code] of [...d.main, ...(d.lb ?? [])]) {
      const c = findCard(code);
      if (c) out[code] = c;
    }
  return out;
}

interface Store {
  screen: Screen;
  lang: Lang;
  settings: ClientSettings;
  aiLevel: AiLevel;
  session: Session | null;
  view: GameView | null;
  faces: Record<string, CardFace>;
  log: LogLine[];
  toast: string | null;
  /** A notice shown on the home screen (a saved game that could not be resumed…). */
  notice: string | null;
  casting: Casting | null;
  /** Forwards selected to attack together (a party, CR 15.1.1.9). */
  party: ObjectId[];
  /** The blocker selected (CR 10.1.3). */
  blocker: ObjectId | null;
  /** The card under the pointer (preview). */
  hover: string | null;
  /** The ability chooser of a card with several abilities. */
  abilityMenu: ObjectId | null;
  /** Options picked for the pending question (cards, labels) or the cards to discard. */
  selection: string[];
  /** Updates being shown one after the other (the AI's actions are paced). */
  busy: boolean;
  /** Damage just dealt to Forwards (it pops out on the card); `at` tells two hits apart. */
  hits: Record<ObjectId, { amount: number; at: number }>;
  /** An EX Burst of the opponent, revealed for a moment (CR 6.5.2.1). */
  flash: { defId: string; at: number } | null;

  setLang(lang: Lang): void;
  setAiLevel(level: AiLevel): void;
  setSettings(p: Partial<ClientSettings>): void;
  notify(text: string): void;
  startGame(myDeck: string, aiDeck: string, opts?: { seed?: number; sandbox?: import("./protocol").Sandbox }): void;
  resumeAtStartup(): void;
  leaveGame(): void;
  decide(d: Decision): void;
  endTurn(hard?: boolean): void;
  setHover(id: string | null): void;
  /** A card of the hand or the field clicked: cast, use an ability, attack, block, or a target or payment. */
  clickCard(id: ObjectId): void;
  beginCast(option: Extract<ActionOption, { type: "cast" | "activate" }>): void;
  setModes(modes: number[]): void;
  confirmCast(): void;
  cancelCast(): void;
  closeAbilityMenu(): void;
  setSelection(selection: string[]): void;
  /** A Multi-Element source of the payment gives its next element (CR 5.2.1.3). */
  cyclePaymentElement(id: ObjectId): void;
  /** An LB card to turn face up (or not) for the LB cost (CR 15.2.8.3.2). */
  toggleLbFlip(id: ObjectId): void;
  /** The same-name card discarded for a special ability (CR 11.7.1). */
  setSpecial(id: ObjectId): void;
}

let writer: SaveWriter | null = null;
const queue: FromWorker[] = [];
/** A decision was sent and its answer (an update or an error) has not come back: a second click is ignored. */
let inFlight = false;

/** The options of the viewer's pending priority. */
export function priorityActions(view: GameView | null): ActionOption[] {
  const p = view?.pending;
  return p?.kind === "priority" && p.player === view?.viewer ? (p.actions ?? []) : [];
}

/** Whether a payment covers the option's cost (the engine's check, CR 11.2). */
export function paymentOk(c: Casting): boolean {
  if (!c.option.cost) return true;
  try {
    checkPayment(c.option.cost, c.option.sources, c.payment);
    return true;
  } catch (e) {
    if (e instanceof RulesError) return false;
    throw e;
  }
}

/** The targets of the current modes (or of the option). */
export function chooseOf(c: Casting) {
  return c.option.modal ? c.modes.flatMap((m) => c.option.modal?.choose[m] ?? []) : c.option.choose;
}

/** Targets complete: each key has its count (or fewer for "up to", or all the legal ones when they are fewer). */
export function targetsOk(c: Casting): boolean {
  return chooseOf(c).every((o) => {
    const n = c.targets[o.key]?.length ?? 0;
    return o.upTo ? n <= o.count : n === Math.min(o.count, o.options.length);
  });
}

/** The pending question when it is a pick for the viewer (targets of an auto-ability, cards to take…). */
export function pickOf(view: GameView | null) {
  const p = view?.pending;
  if (p?.kind !== "choice" || p.player !== view?.viewer || p.request?.type !== "pick") return null;
  return p.request;
}

/** Targets with a single possibility are chosen at once. */
function autoTargets(c: Casting): Record<string, ObjectId[]> {
  const out = { ...c.targets };
  for (const o of chooseOf(c)) if (!out[o.key] && !o.upTo && o.options.length <= o.count) out[o.key] = [...o.options];
  return out;
}

function nextStage(c: Casting, autoPay: boolean): Casting["stage"] | "done" {
  if (c.option.modal && !c.modes.length) return "modes";
  if (!targetsOk(c)) return "targets";
  if (c.option.cost && (c.option.cost.generic || Object.keys(c.option.cost.elements).length) && !autoPay) return "pay";
  return "done";
}

export const useGame = create<Store>((set, get) => {
  /** The decision of a completed casting. */
  const castDecision = (c: Casting): Decision => {
    const common = {
      payment: c.payment,
      targets: c.targets,
      ...(c.option.modal ? { modes: [...c.modes].sort((a, b) => a - b) } : {}),
    };
    if (c.option.type === "cast")
      return { type: "cast", card: c.option.card, ...common, ...(c.lbFlip.length ? { lbFlip: c.lbFlip } : {}) };
    return {
      type: "activate",
      source: c.option.source,
      ability: c.option.ability,
      ...common,
      ...(c.special ? { special: c.special } : {}),
    };
  };

  const advanceCasting = (c: Casting) => {
    const withTargets = { ...c, targets: autoTargets(c) };
    const stage = nextStage(withTargets, !!get().settings.autoPay);
    if (stage === "done") {
      set({ casting: null });
      get().decide(castDecision(withTargets));
    } else set({ casting: { ...withTargets, stage } });
  };

  const applyUpdate = (m: Extract<FromWorker, { type: "update" }>) => {
    inFlight = false;
    const s = get();
    const faces = { ...s.faces, ...m.faces };
    const lines = describeEvents(m.events, m.view, faces, s.lang);
    // A new decision clears what was being chosen for the previous one.
    const changed = JSON.stringify(s.view?.pending) !== JSON.stringify(m.view.pending);
    const at = Date.now();
    const hits: Store["hits"] = {};
    for (const e of m.events) if (e.type === "damage" && e.amount > 0) hits[e.target] = { amount: e.amount, at };
    const ex = m.events.find((e) => e.type === "exBurst" && e.used && e.player !== m.view.viewer);
    set({
      view: m.view,
      faces,
      log: [...s.log, ...lines].slice(-400),
      ...(Object.keys(hits).length ? { hits } : {}),
      ...(ex?.type === "exBurst" && !fastMode() ? { flash: { defId: ex.defId, at } } : {}),
      ...(changed ? { casting: null, party: [], blocker: null, abilityMenu: null, selection: [] } : {}),
    });
    if (ex && !fastMode())
      setTimeout(() => {
        if (get().flash?.at === at) set({ flash: null });
      }, 1800);
  };

  /** Shows the queued updates one by one; an AI action stays on screen for a moment. */
  const pump = async () => {
    if (get().busy) return;
    set({ busy: true });
    try {
      for (let m = queue.shift(); m; m = queue.shift()) {
        if (m.type !== "update") continue;
        applyUpdate(m);
        const visible = m.events.some((e: GameEvent) => e.type === "resolve" || e.type === "attack" || e.type === "exBurst");
        if (visible && !fastMode()) await new Promise((r) => setTimeout(r, 450));
      }
    } finally {
      set({ busy: false });
    }
  };

  const onMessage = (m: FromWorker) => {
    switch (m.type) {
      case "update":
        queue.push(m);
        void pump();
        return;
      case "error":
        inFlight = false;
        get().notify(m.message);
        return;
      case "saved":
        writer?.apply(m);
        return;
      case "resumeFailed":
        clearSavedGame();
        get().session?.close();
        set({
          session: null,
          view: null,
          screen: "lobby",
          notice: msg("The saved game could not be resumed: {why}.", { why: m.message }),
        });
        return;
      case "record":
        return;
    }
  };

  const sendSettings = (settings: ClientSettings) => get().session?.send({ type: "settings", settings });

  return {
    screen: "lobby",
    lang: loadLang(),
    settings: loadSettings(),
    aiLevel: loadLevel(),
    session: null,
    view: null,
    faces: {},
    log: [],
    toast: null,
    notice: null,
    casting: null,
    party: [],
    blocker: null,
    hover: null,
    hits: {},
    flash: null,
    abilityMenu: null,
    selection: [],
    busy: false,

    setLang(lang) {
      setTextLang(lang);
      try {
        localStorage.setItem(LANG_KEY, lang);
      } catch {
        // storage unavailable
      }
      set({ lang });
    },
    setAiLevel(level) {
      try {
        localStorage.setItem(LEVEL_KEY, level);
      } catch {
        // storage unavailable
      }
      set({ aiLevel: level });
    },
    setSettings(p) {
      const settings = { ...get().settings, ...p };
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...settings, passUntilTurn: null }));
      } catch {
        // storage unavailable
      }
      set({ settings });
      sendSettings(settings);
    },
    notify(text) {
      set({ toast: text });
      setTimeout(() => {
        if (get().toast === text) set({ toast: null });
      }, 3500);
    },
    startGame(myDeck, aiDeck, opts = {}) {
      const mine = deckById(myDeck);
      const theirs = deckById(aiDeck);
      if (!mine || !theirs) return;
      get().session?.close();
      queue.length = 0;
      inFlight = false;
      const session = new LocalSession(onMessage);
      const level = get().aiLevel;
      writer?.stop();
      writer = opts.sandbox ? null : new SaveWriter(() => ({ aiLevel: level, log: get().log }));
      set({ session, screen: "game", view: null, faces: {}, log: [], casting: null, party: [], blocker: null });
      session.send({
        type: "start",
        seed: opts.seed ?? Math.floor(Math.random() * 2 ** 31),
        playerName: t("You"),
        aiName: t("AI"),
        playerDeck: mine,
        aiDeck: theirs,
        defs: defsFor([mine, theirs]),
        aiLevel: level,
        ...(fastMode() ? { fast: true } : {}),
        ...(opts.sandbox ? { sandbox: opts.sandbox } : {}),
      });
      sendSettings(get().settings);
    },
    resumeAtStartup() {
      const saved = loadSavedGame();
      if (!saved) return;
      const defs: Record<string, CardDef> = {};
      for (const p of saved.record.players)
        for (const code of [...p.deck, ...(p.lb ?? [])]) {
          const c = CARDS[code] ?? findCard(code);
          if (c) defs[code] = c;
        }
      queue.length = 0;
      inFlight = false;
      const session = new LocalSession(onMessage);
      writer?.stop();
      writer = new SaveWriter(() => ({ ...(saved.aiLevel ? { aiLevel: saved.aiLevel } : {}), log: get().log }));
      writer.start(saved.record);
      set({ session, screen: "game", view: null, faces: {}, log: saved.log ?? [] });
      session.send({
        type: "resume",
        record: saved.record,
        defs,
        ...(saved.aiLevel ? { aiLevel: saved.aiLevel } : {}),
        ...(fastMode() ? { fast: true } : {}),
      });
      sendSettings(get().settings);
    },
    leaveGame() {
      writer?.stop();
      writer = null;
      clearSavedGame();
      get().session?.close();
      queue.length = 0;
      inFlight = false;
      set({ session: null, view: null, screen: "lobby", casting: null, party: [], blocker: null });
    },
    decide(d) {
      if ((get().busy || inFlight) && d.type !== "concede") return;
      inFlight = true;
      get().session?.send({ type: "decision", decision: d });
    },
    endTurn(hard = false) {
      const v = get().view;
      if (!v) return;
      const settings = {
        ...get().settings,
        passUntilTurn: v.turn.number,
        passMode: hard ? ("hard" as const) : ("soft" as const),
      };
      // The worker's autopilot passes from there on, the pending priority included (a decision sent here would arrive
      // after the autopilot's and be refused).
      set({ settings, casting: null, party: [] });
      sendSettings(settings);
    },
    setHover(id) {
      if (get().hover !== id) set({ hover: id });
    },
    clickCard(id) {
      const s = get();
      const v = s.view;
      if (!v) return;
      const c = s.casting;
      if (c?.stage === "targets") {
        const option = chooseOf(c).find(
          (o) =>
            o.options.includes(id) &&
            (!c.targets[o.key] || (c.targets[o.key]?.length ?? 0) < o.count || c.targets[o.key]?.includes(id)),
        );
        if (!option) return;
        const now = c.targets[option.key] ?? [];
        const targets = {
          ...c.targets,
          [option.key]: now.includes(id) ? now.filter((x) => x !== id) : [...now, id].slice(-option.count),
        };
        const next = { ...c, targets };
        // Complete without "up to": go on at once.
        if (targetsOk(next) && !chooseOf(next).some((o) => o.upTo)) advanceCasting(next);
        else set({ casting: next });
        return;
      }
      if (c?.stage === "pay") {
        const src = c.option.sources.find((x) => x.id === id);
        if (!src) return;
        const key = src.kind === "discard" ? "discard" : "dull";
        const list = (c.payment[key] ?? []) as { card?: string; backup?: string }[];
        const has = list.some((x) => (x.card ?? x.backup) === id);
        const entry = src.kind === "discard" ? { card: id } : { backup: id };
        const updated = has ? list.filter((x) => (x.card ?? x.backup) !== id) : [...list, entry];
        set({ casting: { ...c, payment: { ...c.payment, [key]: updated } } });
        return;
      }
      const p = v.pending;
      if (p?.kind === "declareAttack" && p.player === v.viewer) {
        if (s.party.includes(id)) set({ party: s.party.filter((x) => x !== id) });
        // A Forward that cannot join the Forwards already selected starts a new selection.
        else if (attackGroupOk(p, [...s.party, id])) set({ party: [...s.party, id] });
        else if (attackGroupOk(p, [id])) set({ party: [id] });
        return;
      }
      if (p?.kind === "declareBlock" && p.player === v.viewer) {
        if (!(p.blockers ?? []).includes(id)) return;
        set({ blocker: s.blocker === id ? null : id });
        return;
      }
      const pick = pickOf(v);
      if (pick) {
        if (!pick.options.includes(id)) return;
        const sel = s.selection.includes(id) ? s.selection.filter((x) => x !== id) : [...s.selection, id].slice(-pick.max);
        set({ selection: sel });
        return;
      }
      if (p?.kind === "discard" && p.player === v.viewer) {
        if (!v.hand.some((o) => o.id === id)) return;
        set({ selection: s.selection.includes(id) ? s.selection.filter((x) => x !== id) : [...s.selection, id].slice(-p.count) });
        return;
      }
      const options = priorityActions(v).filter(
        (o): o is Extract<ActionOption, { type: "cast" | "activate" }> =>
          (o.type === "cast" && o.card === id) || (o.type === "activate" && o.source === id),
      );
      if (options.length === 1 && options[0]) get().beginCast(options[0]);
      else if (options.length > 1) set({ abilityMenu: id });
    },
    beginCast(option) {
      const c: Casting = {
        option,
        stage: "targets",
        modes: [],
        targets: {},
        payment: option.suggested,
        lbFlip: option.type === "cast" && option.lb ? option.lb.options.slice(0, option.lb.count) : [],
        ...(option.type === "activate" && option.special ? { special: option.special.options[0] as string } : {}),
      };
      set({ abilityMenu: null });
      advanceCasting(c);
    },
    setModes(modes) {
      const c = get().casting;
      if (c) advanceCasting({ ...c, modes, targets: {} });
    },
    confirmCast() {
      const c = get().casting;
      if (!c) return;
      if (c.stage === "targets" && targetsOk(c)) {
        advanceCasting(c);
        return;
      }
      if (c.stage === "pay" && paymentOk(c)) {
        set({ casting: null });
        get().decide(castDecision(c));
      }
    },
    cancelCast() {
      set({ casting: null, abilityMenu: null });
    },
    closeAbilityMenu() {
      set({ abilityMenu: null });
    },
    setSelection(selection) {
      set({ selection });
    },
    cyclePaymentElement(id) {
      const c = get().casting;
      const src = c?.option.sources.find((x) => x.id === id);
      if (!c || !src || src.elements.length < 2) return;
      const key = src.kind === "discard" ? "discard" : "dull";
      const list = (c.payment[key] ?? []) as { card?: string; backup?: string; as?: Element }[];
      const updated = list.map((x) => {
        if ((x.card ?? x.backup) !== id) return x;
        const at = src.elements.indexOf(x.as ?? (src.elements[0] as Element));
        return { ...x, as: src.elements[(at + 1) % src.elements.length] };
      });
      set({ casting: { ...c, payment: { ...c.payment, [key]: updated } } });
    },
    toggleLbFlip(id) {
      const c = get().casting;
      if (c?.option.type !== "cast" || !c.option.lb?.options.includes(id)) return;
      const count = c.option.lb.count;
      set({
        casting: { ...c, lbFlip: c.lbFlip.includes(id) ? c.lbFlip.filter((x) => x !== id) : [...c.lbFlip, id].slice(-count) },
      });
    },
    setSpecial(id) {
      const c = get().casting;
      if (c?.option.type === "activate" && c.option.special?.options.includes(id)) set({ casting: { ...c, special: id } });
    },
  };
});

setTextLang(useGame.getState().lang);

/** Writes the save at once (page closed). */
export function flushSave(): void {
  writer?.flush();
}

/** What the main button does now, and its label (Arena-style). */
/**
 * Whether Forwards can attack together (CR 10.1.2.1): one that can attack alone, or two or more of a party the engine
 * offers (they share an element).
 */
export function attackGroupOk(p: Extract<PendingView, { kind: "declareAttack" }>, ids: ObjectId[]): boolean {
  if (ids.length === 1)
    return (p.single ?? []).includes(ids[0] as ObjectId) || (p.parties ?? []).some((g) => g.members.includes(ids[0] as ObjectId));
  return ids.length > 1 && (p.parties ?? []).some((g) => ids.every((id) => g.members.includes(id)));
}

export function mainAction(
  view: GameView | null,
  party: ObjectId[],
  blocker: ObjectId | null,
): { label: string; decision: Decision | "endTurn" } | null {
  const p = view?.pending;
  if (!view || !p || p.player !== view.viewer) return null;
  if (p.kind === "declareAttack")
    return party.length
      ? {
          label: party.length > 1 ? msg("Attack with the party ({n})", { n: party.length }) : msg("Attack"),
          decision: { type: "attack", forwards: party },
        }
      : { label: msg("End attacks"), decision: { type: "endAttacks" } };
  if (p.kind === "declareBlock")
    return blocker
      ? { label: msg("Block"), decision: { type: "block", blocker } }
      : { label: msg("No block"), decision: { type: "block", blocker: null } };
  if (p.kind !== "priority") return null;
  if (view.stack.length) return { label: msg("Resolve"), decision: { type: "pass" } };
  const mine = view.turn.active === view.viewer;
  if (mine && view.turn.phase === "main1") return { label: msg("To the attacks"), decision: { type: "pass" } };
  if (mine && view.turn.phase === "main2") return { label: msg("End turn"), decision: "endTurn" };
  return { label: msg("Next"), decision: { type: "pass" } };
}
