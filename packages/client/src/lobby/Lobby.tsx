/**
 * The home screen: your deck and the AI's, the AI level, the language, the images, and the game. The deck builder,
 * the tutorial and online play join it in lots A9–A11.
 */
import type { AiLevel } from "@finalcircle/ai";
import { DECKS, type DeckList } from "@finalcircle/cards";
import { useState } from "react";
import { SoundControl } from "../audio/SoundControl";
import { ElementIcon } from "../board/ElementIcon";
import { imagesOn, setImagesOn } from "../images";
import { LangToggle } from "../LangToggle";
import { useLocalize, useT } from "../localize";
import { useGame } from "../store";

const LEVELS: AiLevel[] = ["beginner", "medium", "expert"];

const deckName = (d: DeckList, lang: string) => (lang === "fr" && d.fr?.name) || d.name;
const deckText = (d: DeckList, lang: string) => (lang === "fr" && d.fr?.description) || d.description || "";

function DeckChoice({ value, onChange, label }: { value: string; onChange: (id: string) => void; label: string }) {
  const lang = useGame((s) => s.lang);
  return (
    <fieldset className="deck-choice">
      <legend>{label}</legend>
      {DECKS.map((d) => (
        <label key={d.id} className={`deck-option${value === d.id ? " on" : ""}`}>
          <input type="radio" name={label} checked={value === d.id} onChange={() => onChange(d.id)} />
          <span className="deck-elements">
            {d.elements.map((e) => (
              <ElementIcon key={e} element={e} size={22} />
            ))}
          </span>
          <span className="deck-text">
            <b>{deckName(d, lang)}</b>
            <span className="dim">{deckText(d, lang)}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

export function Lobby() {
  const startGame = useGame((s) => s.startGame);
  const aiLevel = useGame((s) => s.aiLevel);
  const setAiLevel = useGame((s) => s.setAiLevel);
  const notice = useGame((s) => s.notice);
  const loc = useLocalize();
  const t = useT();
  const first = DECKS[0]?.id ?? "";
  const [mine, setMine] = useState(first);
  const [theirs, setTheirs] = useState(DECKS[1]?.id ?? first);
  const [images, setImages] = useState(imagesOn());
  const levelLabel: Record<AiLevel, string> = { beginner: t("Beginner"), medium: t("Medium"), expert: t("Expert") };
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
        <DeckChoice label={t("Your deck")} value={mine} onChange={setMine} />
        <DeckChoice label={t("The AI's deck")} value={theirs} onChange={setTheirs} />
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
        <button type="button" className="btn primary big" onClick={() => startGame(mine, theirs)} data-testid="play">
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
