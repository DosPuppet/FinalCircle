/**
 * The deck builder: the cards the engine handles, filtered (search in both languages, elements, type, cost, EX Burst,
 * Limit Break), and the deck being built, main deck (50 cards) and LB deck (up to 8), with its checks in the chosen
 * format (CR 8.1, `validateDeck`). The player's decks are saved as they change; a prebuilt deck is copied to be edited.
 */
import { CARDS, DECK_RULES, type DeckList, findCard, validateDeck } from "@finalcircle/cards";
import { type CardDef, type CardFace, cardFace, type Element } from "@finalcircle/engine";
import { useMemo, useState } from "react";
import { Card } from "../board/Card";
import { ElementIcon } from "../board/ElementIcon";
import { CardDetails } from "../board/Preview";
import { faceName, TYPE_LABEL } from "../i18n";
import { LangToggle } from "../LangToggle";
import { FormatChoice } from "../lobby/FormatChoice";
import { useLocalize, useT } from "../localize";
import { useGame } from "../store";
import { textIn } from "../translate";
import { ImportExport } from "./ImportExport";
import { searchFilter } from "./search";
import { deckName, findDeck, useAllDecks, useDecks } from "./store";

const ELEMENTS: Element[] = ["fire", "ice", "wind", "earth", "lightning", "water", "light", "dark"];
const TYPES: CardDef["type"][] = ["Forward", "Backup", "Monster", "Summon"];
const COSTS = [1, 2, 3, 4, 5, 6, 7];

/** Faces of every card, for the card component (outside a game, the store has none). */
const FACES: Record<string, CardFace> = Object.fromEntries(Object.values(CARDS).map((c) => [c.id, cardFace(c)]));

/** Catalog order: element, type, cost, name. */
function catalogOrder(a: CardDef, b: CardDef): number {
  const e = (c: CardDef) => (c.elements.length > 1 ? 8 : ELEMENTS.indexOf(c.elements[0] as Element));
  return e(a) - e(b) || TYPES.indexOf(a.type) - TYPES.indexOf(b.type) || a.cost - b.cost || a.name.localeCompare(b.name);
}

interface Filters {
  query: string;
  elements: Element[];
  type: CardDef["type"] | null;
  cost: number | null;
  ex: boolean;
  lb: boolean;
}

function filterCards(f: Filters): CardDef[] {
  const search = searchFilter(f.query);
  return Object.values(CARDS)
    .filter(
      (c) =>
        c.implemented &&
        search(c) &&
        (!f.elements.length || c.elements.some((e) => f.elements.includes(e))) &&
        (!f.type || c.type === f.type) &&
        (f.cost === null || (f.cost >= 7 ? c.cost >= 7 : c.cost === f.cost)) &&
        (!f.ex || c.exBurst) &&
        (!f.lb || c.lb !== undefined),
    )
    .sort(catalogOrder);
}

/** Copies of a card in a deck (main and LB decks). */
const copiesIn = (deck: DeckList, id: string) =>
  [...deck.main, ...deck.lb].filter(([, code]) => findCard(code)?.id === id).reduce((n, [c]) => n + c, 0);

function changeCount(deck: DeckList, id: string, delta: number): DeckList {
  const c = CARDS[id];
  if (!c) return deck;
  const key = c.lb !== undefined ? "lb" : "main";
  const list = deck[key].map(([n, code]) => [n, code] as [number, string]);
  const at = list.find(([, code]) => findCard(code)?.id === id);
  if (at) at[0] += delta;
  else if (delta > 0) list.push([delta, id]);
  return { ...deck, [key]: list.filter(([n]) => n > 0) };
}

function Catalog({
  deck,
  onAdd,
  onRemove,
}: {
  deck: DeckList | null;
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const t = useT();
  const lang = useGame((s) => s.lang);
  const [f, setF] = useState<Filters>({ query: "", elements: [], type: null, cost: null, ex: false, lb: false });
  const cards = useMemo(() => filterCards(f), [f]);
  const toggleElement = (e: Element) =>
    setF({ ...f, elements: f.elements.includes(e) ? f.elements.filter((x) => x !== e) : [...f.elements, e] });
  return (
    <section className="catalog" aria-label={t("Cards")}>
      <div className="filters">
        <input
          type="search"
          className="search"
          placeholder={t("Search: name, job, text…")}
          title={t("Search: words of the name, job or text; t:forward, e:fire, cost<=2, power>=8000, j:job, is:ex, is:lb")}
          value={f.query}
          onChange={(e) => setF({ ...f, query: e.target.value })}
          data-testid="deck-search"
        />
        <div className="chips">
          {ELEMENTS.map((e) => (
            <button
              key={e}
              type="button"
              className={`chip${f.elements.includes(e) ? " on" : ""}`}
              aria-pressed={f.elements.includes(e)}
              onClick={() => toggleElement(e)}
            >
              <ElementIcon element={e} size={20} />
            </button>
          ))}
        </div>
        <div className="seg">
          <button type="button" className={!f.type ? "on" : ""} aria-pressed={!f.type} onClick={() => setF({ ...f, type: null })}>
            {t("All")}
          </button>
          {TYPES.map((ty) => (
            <button
              key={ty}
              type="button"
              className={f.type === ty ? "on" : ""}
              aria-pressed={f.type === ty}
              onClick={() => setF({ ...f, type: f.type === ty ? null : ty })}
            >
              {textIn(lang, TYPE_LABEL[ty])}
            </button>
          ))}
        </div>
        <div className="seg">
          {COSTS.map((c) => (
            <button
              key={c}
              type="button"
              className={f.cost === c ? "on" : ""}
              aria-pressed={f.cost === c}
              onClick={() => setF({ ...f, cost: f.cost === c ? null : c })}
            >
              {c === 7 ? "7+" : c}
            </button>
          ))}
        </div>
        <div className="seg">
          <button type="button" className={f.ex ? "on" : ""} aria-pressed={f.ex} onClick={() => setF({ ...f, ex: !f.ex })}>
            EX BURST
          </button>
          <button type="button" className={f.lb ? "on" : ""} aria-pressed={f.lb} onClick={() => setF({ ...f, lb: !f.lb })}>
            Limit Break
          </button>
        </div>
      </div>
      <div className="catalog-grid" data-testid="catalog">
        {cards.map((c) => {
          const n = deck ? copiesIn(deck, c.id) : 0;
          return (
            // biome-ignore lint/a11y/noStaticElementInteractions: the right click removes a copy; the − button of the deck list does it too
            <div
              key={c.id}
              className="catalog-card"
              onContextMenu={(e) => {
                e.preventDefault();
                if (deck && n) onRemove(c.id);
              }}
            >
              <Card face={FACES[c.id]} onClick={deck ? () => onAdd(c.id) : undefined} glow={n ? "chosen" : null} />
              {n ? <span className="copies">{n}</span> : null}
              <span className="catalog-name">{faceName(FACES[c.id], lang)}</span>
            </div>
          );
        })}
        {cards.length ? null : <p className="dim">{t("No card matches.")}</p>}
      </div>
    </section>
  );
}

function DeckRows({
  entries,
  deck,
  onAdd,
  onRemove,
}: {
  entries: [number, string][];
  deck: DeckList;
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const lang = useGame((s) => s.lang);
  const setHover = useGame((s) => s.setHover);
  const t = useT();
  const rows = entries
    .map(([n, code]) => [n, findCard(code)] as const)
    .filter((r): r is readonly [number, CardDef] => !!r[1])
    .sort(([, a], [, b]) => TYPES.indexOf(a.type) - TYPES.indexOf(b.type) || a.cost - b.cost || a.name.localeCompare(b.name));
  let lastType: string | null = null;
  return (
    <ul className="deck-rows">
      {rows.map(([n, c]) => {
        const header = c.type !== lastType ? textIn(lang, TYPE_LABEL[c.type]) : null;
        lastType = c.type;
        return (
          <li key={c.id} onPointerEnter={() => setHover(c.id)}>
            {header ? <div className="deck-type">{header}</div> : null}
            <div className="deck-row">
              {deck.builtin ? null : (
                <button type="button" className="btn small ghost" onClick={() => onRemove(c.id)} aria-label={t("Remove a copy")}>
                  −
                </button>
              )}
              <b className="deck-count">{n}</b>
              {deck.builtin ? null : (
                <button
                  type="button"
                  className="btn small ghost"
                  onClick={() => onAdd(c.id)}
                  disabled={copiesIn(deck, c.id) >= DECK_RULES.maxCopies}
                  aria-label={t("Add a copy")}
                >
                  +
                </button>
              )}
              <span className="deck-cost">
                {c.elements.map((e) => (
                  <ElementIcon key={e} element={e} size={14} />
                ))}
                {c.cost}
              </span>
              <span className="deck-name">{faceName(FACES[c.id], lang)}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Cards by cost (main deck): the curve. */
function Curve({ deck }: { deck: DeckList }) {
  const t = useT();
  const counts = COSTS.map((c) =>
    deck.main.reduce((n, [k, code]) => {
      const cost = findCard(code)?.cost ?? 0;
      return n + ((c === 7 ? cost >= 7 : cost === c) ? k : 0);
    }, 0),
  );
  const max = Math.max(1, ...counts);
  return (
    <div className="curve" role="img" aria-label={t("Cards by cost")}>
      {counts.map((n, i) => (
        <div key={COSTS[i]} className="curve-bar" title={`${COSTS[i]}${i === 6 ? "+" : ""}: ${n}`}>
          <span style={{ height: `${(n / max) * 100}%` }} />
          <small>{i === 6 ? "7+" : COSTS[i]}</small>
        </div>
      ))}
    </div>
  );
}

function DeckPanel({ deck, onAdd, onRemove }: { deck: DeckList; onAdd: (id: string) => void; onRemove: (id: string) => void }) {
  const t = useT();
  const loc = useLocalize();
  const format = useGame((s) => s.format);
  const [tab, setTab] = useState<"main" | "lb">("main");
  const check = validateDeck(deck, findCard, format);
  return (
    <aside className="deck-panel" aria-label={t("The deck")}>
      <div className="seg tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "main"}
          className={tab === "main" ? "on" : ""}
          onClick={() => setTab("main")}
        >
          {t("Main deck {n}/{max}", { n: check.mainCount, max: DECK_RULES.main })}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "lb"}
          className={tab === "lb" ? "on" : ""}
          onClick={() => setTab("lb")}
        >
          {t("LB deck {n}/{max}", { n: check.lbCount, max: DECK_RULES.lbMax })}
        </button>
      </div>
      <DeckRows entries={tab === "main" ? deck.main : deck.lb} deck={deck} onAdd={onAdd} onRemove={onRemove} />
      {tab === "main" ? <Curve deck={deck} /> : null}
      <div className={`deck-check ${check.legal ? "ok" : "bad"}`} data-testid="deck-check">
        {check.legal ? <p>{t("The deck is legal.")}</p> : null}
        {check.errors.map((e) => (
          <p key={e} className="error">
            {loc(e)}
          </p>
        ))}
        {check.warnings.map((w) => (
          <p key={w} className="warn">
            {loc(w)}
          </p>
        ))}
      </div>
    </aside>
  );
}

/** The card under the pointer, large. */
function DeckPreview() {
  const hover = useGame((s) => s.hover);
  const face = hover ? FACES[hover] : undefined;
  return (
    <div className="preview deck-preview">
      {face ? (
        <>
          <Card face={face} size="full" />
          <CardDetails face={face} />
        </>
      ) : (
        <div className="preview empty" />
      )}
    </div>
  );
}

/** Touch screens: the card held under a finger, large; a tap closes it. */
function DeckPeek() {
  const peek = useGame((s) => s.peek);
  const setPeek = useGame((s) => s.setPeek);
  const face = peek ? FACES[peek] : undefined;
  if (!face) return null;
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a tap anywhere closes the preview, as Escape does
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape closes it
    <div className="touch-preview" onClick={() => setPeek(null)}>
      <div className="preview">
        <Card face={face} size="full" />
        <CardDetails face={face} />
      </div>
    </div>
  );
}

/** The list of decks: the prebuilt ones, then the player's. */
function DeckIndex({ onOpen }: { onOpen: (id: string) => void }) {
  const decks = useAllDecks();
  const create = useDecks((s) => s.create);
  const lang = useGame((s) => s.lang);
  const format = useGame((s) => s.format);
  const t = useT();
  return (
    <div className="deck-list">
      <button type="button" className="btn primary" onClick={() => onOpen(create())} data-testid="new-deck">
        {t("New deck")}
      </button>
      {decks.map((d) => {
        const legal = validateDeck(d, findCard, format).legal;
        return (
          <button type="button" key={d.id} className="deck-item" onClick={() => onOpen(d.id)}>
            <span className="deck-elements">
              {d.elements.map((e) => (
                <ElementIcon key={e} element={e} size={18} />
              ))}
            </span>
            <span className="deck-text">
              <b>{deckName(d, lang)}</b>
              <span className="dim">
                {d.builtin ? t("Prebuilt deck") : t("Your deck")} · {legal ? t("legal") : t("not legal")}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function DeckBuilder() {
  const editing = useGame((s) => s.editing);
  const openDecks = useGame((s) => s.openDecks);
  const sharedDeck = useGame((s) => s.sharedDeck);
  const lang = useGame((s) => s.lang);
  const save = useDecks((s) => s.save);
  const remove = useDecks((s) => s.remove);
  const duplicate = useDecks((s) => s.duplicate);
  // Re-render on any change of the player's decks.
  useDecks((s) => s.decks);
  const t = useT();
  const [sharing, setSharing] = useState(false);
  const deck = editing ? (findDeck(editing) ?? null) : null;
  const editable = deck && !deck.builtin ? deck : null;
  const add = (id: string) => {
    if (!editable || copiesIn(editable, id) >= DECK_RULES.maxCopies) return;
    save(changeCount(editable, id, 1));
  };
  const del = (id: string) => editable && save(changeCount(editable, id, -1));
  return (
    <div className="deck-builder">
      <header className="deck-head">
        <button type="button" className="btn ghost" onClick={() => useGame.setState({ screen: "lobby", editing: null })}>
          {t("Back")}
        </button>
        {deck ? (
          editable ? (
            <input
              className="deck-title"
              value={editable.name}
              onChange={(e) => save({ ...editable, name: e.target.value })}
              aria-label={t("Deck name")}
              data-testid="deck-name"
            />
          ) : (
            <h2 className="deck-title">{deckName(deck, lang)}</h2>
          )
        ) : (
          <h2 className="deck-title">{t("Decks")}</h2>
        )}
        <FormatChoice />
        {deck ? (
          <div className="deck-actions">
            {deck.builtin ? (
              <button type="button" className="btn primary" onClick={() => openDecks(duplicate(deck))} data-testid="copy-deck">
                {t("Copy to edit")}
              </button>
            ) : null}
            <button type="button" className="btn" onClick={() => setSharing(true)} data-testid="share-deck">
              {t("Share / import")}
            </button>
            {editable ? (
              <button
                type="button"
                className="btn danger"
                onClick={() => {
                  if (confirm(t("Delete the deck {name}?", { name: editable.name }))) {
                    remove(editable.id);
                    openDecks(null);
                  }
                }}
              >
                {t("Delete")}
              </button>
            ) : null}
            <button type="button" className="btn ghost" onClick={() => openDecks(null)}>
              {t("All decks")}
            </button>
          </div>
        ) : null}
        <LangToggle />
      </header>
      {deck ? (
        <div className="deck-body">
          <Catalog deck={editable} onAdd={add} onRemove={del} />
          <DeckPanel deck={deck} onAdd={add} onRemove={del} />
          <DeckPreview />
        </div>
      ) : (
        <div className="deck-body list">
          <DeckIndex onOpen={(id) => openDecks(id)} />
          <Catalog deck={null} onAdd={() => {}} onRemove={() => {}} />
        </div>
      )}
      <DeckPeek />
      {sharing || sharedDeck ? (
        <ImportExport
          deck={deck}
          onClose={() => {
            setSharing(false);
            useGame.setState({ sharedDeck: null });
          }}
        />
      ) : null}
    </div>
  );
}
