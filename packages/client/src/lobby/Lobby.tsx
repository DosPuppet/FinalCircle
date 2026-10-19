/**
 * The home screen: your deck and the AI's (prebuilt or yours, checked in the chosen format), the AI level, the language,
 * the sound and the images, the deck builder, and the game. The tutorial and online play join it in lots A10–A11.
 */
import type { AiLevel } from "@finalcircle/ai";
import { type DeckList, findCard, validateDeck } from "@finalcircle/cards";
import { isGameRecord } from "@finalcircle/engine";
import { useState } from "react";
import { SoundControl } from "../audio/SoundControl";
import { ElementIcon } from "../board/ElementIcon";
import { DeckArt } from "../decks/DeckArt";
import { deckDescription, deckName, useAllDecks } from "../decks/store";
import { GlossaryButton } from "../glossary/Glossary";
import { imagesOn, setImagesOn } from "../images";
import { LangToggle } from "../LangToggle";
import { useLocalize, useT } from "../localize";
import { useGame } from "../store";
import { FormatChoice } from "./FormatChoice";

const LEVELS: AiLevel[] = ["beginner", "medium", "expert"];
const CHOICE_KEY = "finalcircle.lobby";

/** The decks chosen last time (storage can be unavailable). */
function loadChoice(): { mine?: string; theirs?: string } {
  try {
    return JSON.parse(localStorage.getItem(CHOICE_KEY) ?? "{}") as { mine?: string; theirs?: string };
  } catch {
    return {};
  }
}

function saveChoice(choice: { mine: string; theirs: string }): void {
  try {
    localStorage.setItem(CHOICE_KEY, JSON.stringify(choice));
  } catch {
    // choice not kept
  }
}

function DeckChoice({
  decks,
  value,
  onChange,
  label,
  name,
}: {
  decks: DeckList[];
  value: string;
  onChange: (id: string) => void;
  label: string;
  name: string;
}) {
  const lang = useGame((s) => s.lang);
  const format = useGame((s) => s.format);
  const t = useT();
  return (
    <fieldset className="deck-choice">
      <legend>{label}</legend>
      {decks.map((d) => {
        const legal = validateDeck(d, findCard, format).legal;
        return (
          <label key={d.id} className={`deck-option${value === d.id ? " on" : ""}${legal ? "" : " illegal"}`}>
            <input type="radio" name={name} checked={value === d.id} onChange={() => onChange(d.id)} />
            <DeckArt deck={d} />
            <span className="deck-elements">
              {d.elements.map((e) => (
                <ElementIcon key={e} element={e} size={22} />
              ))}
            </span>
            <span className="deck-text">
              <b>{deckName(d, lang)}</b>
              <span className="dim">{deckDescription(d, lang) ?? (legal ? t("Your deck") : t("not legal"))}</span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

/** "Replay a game": opens a downloaded game file in the replay viewer. */
function ReplayOpener() {
  const openReplay = useGame((s) => s.openReplay);
  const notify = useGame((s) => s.notify);
  const t = useT();
  return (
    <label className="btn replay-open">
      {t("Replay a game")}
      <input
        type="file"
        accept="application/json,.json"
        hidden
        data-testid="replay-file"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          try {
            const record = JSON.parse(await file.text()) as unknown;
            if (!isGameRecord(record)) return notify(t("This file is not a FinalCircle game."));
            openReplay(record);
          } catch {
            notify(t("Unreadable file."));
          }
        }}
      />
    </label>
  );
}

export function Lobby() {
  const startGame = useGame((s) => s.startGame);
  const openDecks = useGame((s) => s.openDecks);
  const aiLevel = useGame((s) => s.aiLevel);
  const setAiLevel = useGame((s) => s.setAiLevel);
  const notice = useGame((s) => s.notice);
  const format = useGame((s) => s.format);
  const decks = useAllDecks();
  const loc = useLocalize();
  const t = useT();
  const known = (id: string | undefined) => (id && decks.some((d) => d.id === id) ? id : undefined);
  const [saved] = useState(loadChoice);
  const [mine, setMine] = useState(known(saved.mine) ?? decks[0]?.id ?? "");
  const [theirs, setTheirs] = useState(known(saved.theirs) ?? decks[1]?.id ?? decks[0]?.id ?? "");
  const [images, setImages] = useState(imagesOn());
  const levelLabel: Record<AiLevel, string> = { beginner: t("Beginner"), medium: t("Medium"), expert: t("Expert") };
  const myDeck = decks.find((d) => d.id === mine);
  const aiDeck = decks.find((d) => d.id === theirs);
  const myCheck = myDeck ? validateDeck(myDeck, findCard, format) : null;
  const aiCheck = aiDeck ? validateDeck(aiDeck, findCard, format) : null;
  const ready = !!myCheck?.legal && myCheck.playable && !!aiCheck?.legal && aiCheck.playable;
  return (
    <div className="lobby">
      <header className="lobby-head">
        <h1>FinalCircle</h1>
        <p className="tagline">{t("Play the FINAL FANTASY Trading Card Game against the AI.")}</p>
        <div className="lobby-settings">
          <LangToggle />
          <SoundControl />
        </div>
      </header>
      {notice ? (
        <div className="notice-line" role="status">
          {loc(notice)}
          <button type="button" className="btn small ghost" onClick={() => useGame.setState({ notice: null })}>
            {t("OK")}
          </button>
        </div>
      ) : null}
      <main className="lobby-main">
        <FormatChoice />
        <div className="deck-choices">
          <DeckChoice decks={decks} label={t("Your deck")} name="mine" value={mine} onChange={setMine} />
          <DeckChoice decks={decks} label={t("The AI's deck")} name="theirs" value={theirs} onChange={setTheirs} />
        </div>
        <div className="lobby-buttons">
          <button type="button" className="btn" onClick={() => useGame.getState().openOnline()} data-testid="open-online">
            {t("Play online")}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => useGame.setState({ screen: "tutorial" })}
            data-testid="open-tutorial"
          >
            {t("Learn to play")}
          </button>
          <GlossaryButton />
          <button type="button" className="btn" onClick={() => openDecks(null)} data-testid="open-decks">
            {t("Deck builder")}
          </button>
          <ReplayOpener />
        </div>
        <fieldset className="level-choice">
          <legend>{t("AI level")}</legend>
          <div className="seg">
            {LEVELS.map((l) => (
              <button
                type="button"
                key={l}
                className={aiLevel === l ? "on" : ""}
                aria-pressed={aiLevel === l}
                onClick={() => setAiLevel(l)}
              >
                {levelLabel[l]}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="check">
          <input
            type="checkbox"
            checked={images}
            onChange={(e) => {
              setImagesOn(e.target.checked);
              setImages(e.target.checked);
            }}
          />
          {t("Show the official card images")}
        </label>
        {myCheck && !myCheck.legal ? (
          <p className="warn">{t("Your deck is not legal: {why}", { why: loc(myCheck.errors[0] ?? "") })}</p>
        ) : null}
        {aiCheck && !aiCheck.legal ? (
          <p className="warn">{t("The AI's deck is not legal: {why}", { why: loc(aiCheck.errors[0] ?? "") })}</p>
        ) : null}
        <button
          type="button"
          className="btn primary big"
          disabled={!ready}
          onClick={() => {
            saveChoice({ mine, theirs });
            startGame(mine, theirs);
          }}
          data-testid="play"
        >
          {t("Play")}
        </button>
      </main>
      <footer className="legal">
        {t(
          "Unofficial non-commercial fan project, not affiliated with Square Enix. FINAL FANTASY TRADING CARD GAME, card names, texts and images © SQUARE ENIX.",
        )}
      </footer>
    </div>
  );
}
