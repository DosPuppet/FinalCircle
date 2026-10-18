/**
 * Online play (from Planecircle, duel only): a nickname, a deck legal in the chosen format, then create a room (its code
 * and an invitation link to share, or the server's AI as the opponent) or join one by its code. The server starts the
 * game as soon as the room is full.
 */
import type { AiLevel } from "@finalcircle/ai";
import { FORMAT_LABELS, findCard, validateDeck } from "@finalcircle/cards";
import { useState } from "react";
import { SoundControl } from "../audio/SoundControl";
import { ElementIcon } from "../board/ElementIcon";
import { deckName, useAllDecks } from "../decks/store";
import { LangToggle } from "../LangToggle";
import { useLocalize, useT } from "../localize";
import { loadName, useGame } from "../store";
import { textIn } from "../translate";
import { FormatChoice } from "./FormatChoice";

const LEVELS: AiLevel[] = ["beginner", "medium", "expert"];

/** The code of an invitation link (`?room=CODE`). */
export function codeFromUrl(): string {
  try {
    return (new URLSearchParams(location.search).get("room") ?? "").toUpperCase();
  } catch {
    return "";
  }
}

function inviteLink(code: string): string {
  return `${location.origin}${location.pathname}?room=${code}`;
}

function Waiting() {
  const online = useGame((s) => s.online);
  const lang = useGame((s) => s.lang);
  const leave = useGame((s) => s.leaveGame);
  const notify = useGame((s) => s.notify);
  const t = useT();
  const code = online?.code ?? "";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink(code));
      notify(t("Link copied: send it to your opponent."));
    } catch {
      notify(t("Link: {url}", { url: inviteLink(code) }));
    }
  };
  return (
    <div className="online-waiting">
      <div className="hint">{t("Room code")}</div>
      <div className="room-code" data-testid="room-code">
        {code}
      </div>
      <p className="hint">
        {t("Give this code (or the link) to your opponent. The game starts as soon as they arrive.")}
        {online?.match?.format ? ` ${t("Format: {format}.", { format: textIn(lang, FORMAT_LABELS[online.match.format]) })}` : ""}
      </p>
      <div className="lobby-buttons">
        <button type="button" className="btn primary" onClick={copy}>
          {t("Copy the link")}
        </button>
        <button type="button" className="btn" onClick={leave}>
          {t("Cancel")}
        </button>
      </div>
      <div className="waiting-dots">{t("Waiting for an opponent")}</div>
    </div>
  );
}

export function Online() {
  const online = useGame((s) => s.online);
  const createRoom = useGame((s) => s.createRoom);
  const joinRoom = useGame((s) => s.joinRoom);
  const format = useGame((s) => s.format);
  const lang = useGame((s) => s.lang);
  const loc = useLocalize();
  const t = useT();
  const decks = useAllDecks();
  const legal = decks.filter((d) => {
    const v = validateDeck(d, findCard, format);
    return v.legal && v.playable;
  });
  const [name, setName] = useState(loadName);
  const [deckId, setDeckId] = useState(() => legal[0]?.id ?? "");
  const [code, setCode] = useState(codeFromUrl);
  const [opponent, setOpponent] = useState<"player" | AiLevel>("player");
  const deck = legal.find((d) => d.id === deckId) ?? legal[0];
  const ready = !!deck && name.trim().length > 0;
  const busy = online?.status === "connecting" && !online.error;
  const levelLabel: Record<AiLevel, string> = { beginner: t("Beginner"), medium: t("Medium"), expert: t("Expert") };
  return (
    <div className="lobby online">
      <header className="lobby-head">
        <h1>{t("Online game")}</h1>
        <p className="tagline">{t("A duel against another player, or against the server's AI.")}</p>
        <div className="lobby-settings">
          <LangToggle />
          <SoundControl />
        </div>
      </header>
      <main className="lobby-main">
        {online?.status === "waiting" ? (
          <Waiting />
        ) : (
          <>
            <label className="online-field">
              <span className="pay-label">{t("Your nickname")}</span>
              <input
                className="search"
                value={name}
                maxLength={20}
                placeholder={t("Nickname visible to your opponent")}
                onChange={(e) => setName(e.target.value)}
                data-testid="nickname"
              />
            </label>
            <FormatChoice />
            <fieldset className="deck-choice">
              <legend>{t("Your deck (legal in {format})", { format: textIn(lang, FORMAT_LABELS[format]) })}</legend>
              {legal.length ? (
                legal.map((d) => (
                  <label key={d.id} className={`deck-option${deck?.id === d.id ? " on" : ""}`}>
                    <input type="radio" name="online-deck" checked={deck?.id === d.id} onChange={() => setDeckId(d.id)} />
                    <span className="deck-elements">
                      {d.elements.map((e) => (
                        <ElementIcon key={e} element={e} size={22} />
                      ))}
                    </span>
                    <span className="deck-text">
                      <b>{deckName(d, lang)}</b>
                    </span>
                  </label>
                ))
              ) : (
                <p className="warn">{t("No deck is legal in this format: build one in the deck builder.")}</p>
              )}
            </fieldset>
            {online?.error ? (
              <p className="warn online-error" role="alert" data-testid="online-error">
                {loc(online.error)}
              </p>
            ) : null}
            <div className="online-actions">
              <div className="online-card">
                <h3>{t("Create a game")}</h3>
                <div className="seg">
                  <button
                    type="button"
                    className={opponent === "player" ? "on" : ""}
                    aria-pressed={opponent === "player"}
                    onClick={() => setOpponent("player")}
                  >
                    {t("Against a player")}
                  </button>
                  {LEVELS.map((l) => (
                    <button
                      key={l}
                      type="button"
                      className={opponent === l ? "on" : ""}
                      aria-pressed={opponent === l}
                      onClick={() => setOpponent(l)}
                    >
                      {t("AI: {level}", { level: levelLabel[l] })}
                    </button>
                  ))}
                </div>
                <p className="hint">
                  {opponent === "player"
                    ? t("You will receive a code to share.")
                    : t("The server's AI plays a prebuilt deck; the game starts at once.")}
                </p>
                <button
                  type="button"
                  className="btn primary big"
                  disabled={!ready || busy}
                  onClick={() =>
                    deck &&
                    createRoom(
                      name.trim(),
                      { main: deck.main, lb: deck.lb },
                      { format, ...(opponent !== "player" ? { ai: opponent } : {}) },
                    )
                  }
                  data-testid="create-room"
                >
                  {t("Create")}
                </button>
              </div>
              <div className="online-card">
                <h3>{t("Join")}</h3>
                <p className="hint">{t("The room sets its format: your deck must be legal in it.")}</p>
                <input
                  className="search code-input"
                  value={code}
                  maxLength={6}
                  placeholder="CODE"
                  aria-label={t("Room code")}
                  onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                  data-testid="room-code-input"
                />
                <button
                  type="button"
                  className="btn primary big"
                  disabled={!ready || busy || code.length !== 6}
                  onClick={() => deck && joinRoom(code, name.trim(), { main: deck.main, lb: deck.lb })}
                  data-testid="join-room"
                >
                  {t("Join")}
                </button>
              </div>
            </div>
            {!ready ? <p className="hint">{t("Choose a nickname and a deck legal in the format.")}</p> : null}
          </>
        )}
        <button
          type="button"
          className="btn ghost"
          onClick={() => (online ? useGame.getState().leaveGame() : useGame.setState({ screen: "lobby" }))}
        >
          {t("Back")}
        </button>
      </main>
    </div>
  );
}
