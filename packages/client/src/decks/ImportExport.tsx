/**
 * Sharing a deck (from Planecircle): its list as text, a link that carries it (`#deck=…`), both copied to the clipboard;
 * and importing a list pasted (or received by a link) as a new deck.
 */
import type { DeckList } from "@finalcircle/cards";
import { useEffect, useState } from "react";
import { Dialog } from "../Dialog";
import { useT } from "../localize";
import { useGame } from "../store";
import { deckLink, deckText, parseDeck } from "./share";
import { deckName, useDecks } from "./store";

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function ImportExport({ deck, onClose }: { deck: DeckList | null; onClose: () => void }) {
  const shared = useGame((s) => s.sharedDeck);
  const lang = useGame((s) => s.lang);
  const openDecks = useGame((s) => s.openDecks);
  const save = useDecks((s) => s.save);
  const create = useDecks((s) => s.create);
  const t = useT();
  const exported = deck ? deckText({ ...deck, name: deckName(deck, lang) }) : "";
  const [text, setText] = useState(shared ?? exported);
  const [status, setStatus] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  useEffect(() => {
    if (deck && !shared) void deckLink({ ...deck, name: deckName(deck, lang) }).then(setLink);
  }, [deck, shared, lang]);
  const parsed = parseDeck(text);
  const doImport = () => {
    const id = create(parsed.name || t("Imported deck"));
    const created = useDecks.getState().decks.find((d) => d.id === id);
    if (created) save({ ...created, main: parsed.main, lb: parsed.lb });
    onClose();
    openDecks(id);
  };
  return (
    <Dialog title={shared ? t("Deck received") : t("Share / import")} className="wide" onClose={onClose} testId="share">
      <textarea
        className="deck-text-area"
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
        rows={14}
        aria-label={t("Decklist")}
        data-testid="deck-text"
      />
      {parsed.unknown.length ? (
        <p className="warn">{t("Lines not understood: {lines}", { lines: parsed.unknown.slice(0, 5).join(" · ") })}</p>
      ) : null}
      {status ? <p className="dim">{status}</p> : null}
      <div className="prompt-actions">
        {deck && !shared ? (
          <>
            <button
              type="button"
              className="btn"
              onClick={() =>
                void copy(exported).then((ok) => setStatus(ok ? t("List copied.") : t("Copy refused by the browser.")))
              }
            >
              {t("Copy the list")}
            </button>
            <button
              type="button"
              className="btn"
              disabled={!link}
              onClick={() =>
                link && void copy(link).then((ok) => setStatus(ok ? t("Link copied.") : t("Copy refused by the browser.")))
              }
              data-testid="copy-link"
            >
              {t("Copy the link")}
            </button>
          </>
        ) : null}
        <button
          type="button"
          className="btn primary"
          disabled={!parsed.main.length && !parsed.lb.length}
          onClick={doImport}
          data-testid="import-deck"
        >
          {t("Import as a new deck")}
        </button>
      </div>
      {link ? (
        <input className="share-link" readOnly value={link} aria-label={t("Link to the deck")} data-testid="deck-link" />
      ) : null}
    </Dialog>
  );
}
