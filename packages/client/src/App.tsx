import { useEffect } from "react";
import { Board } from "./board/Board";
import { Lobby } from "./lobby/Lobby";
import { useLocalize } from "./localize";
import { Prompts } from "./prompts/Prompts";
import { mainAction, useGame } from "./store";

/** A short message; its text can come from the engine or the interface (`msg`), translated here. */
function Toast() {
  const toast = useGame((s) => s.toast);
  const loc = useLocalize();
  if (!toast) return null;
  return (
    <div className="toast" role="status">
      {loc(toast)}
    </div>
  );
}

/** Space: the main button; Enter: to the end of the turn; Escape: cancel the casting. */
function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.closest(".modal"))) return;
      const s = useGame.getState();
      if (e.code === "Space") {
        e.preventDefault();
        const action = s.casting || s.busy ? null : mainAction(s.view, s.party, s.blocker);
        if (action) action.decision === "endTurn" ? s.endTurn() : s.decide(action.decision);
      } else if (e.code === "Enter" || e.code === "NumpadEnter") {
        if (s.view?.pending?.player === s.view?.viewer) {
          e.preventDefault();
          s.endTurn(e.shiftKey);
        }
      } else if (e.code === "Escape") s.cancelCast();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

function GameScreen() {
  useShortcuts();
  return (
    <>
      <Board />
      <Prompts />
    </>
  );
}

export function App() {
  const screen = useGame((s) => s.screen);
  return (
    <>
      {screen === "lobby" ? <Lobby /> : <GameScreen />}
      <Toast />
    </>
  );
}
