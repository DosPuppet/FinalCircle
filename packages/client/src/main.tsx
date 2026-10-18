import { msg } from "@finalcircle/engine";
import { LayoutGroup, MotionConfig } from "motion/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { playSound, unlockAudio, useAudio } from "./audio/sfx";
import { decodeDeck, sharedDeckData } from "./decks/share";
import { codeFromUrl } from "./lobby/Online";
import { flushSave, useGame } from "./store";
import { lessonById } from "./tutorial/lessons";
import { useTutorial } from "./tutorial/store";
import "./styles.css";

// Dev mode: access to the stores for the Playwright scripts (sandbox, see protocol.ts; tutorial: the current step).
if (import.meta.env.DEV) {
  const w = window as unknown as { __fc: typeof useGame; __tutoStep: () => unknown };
  w.__fc = useGame;
  w.__tutoStep = () => {
    const tuto = useTutorial.getState();
    const step = lessonById(tuto.lessonId)?.steps[tuto.step];
    return step
      ? {
          lesson: tuto.lessonId,
          index: tuto.step,
          finished: tuto.finished,
          next: !!step.next,
          free: !!step.free,
          allow: step.allow ?? [],
          target: step.target ?? null,
        }
      : { lesson: tuto.lessonId, finished: tuto.finished };
  };
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      {/* Reduced motion if the system asks for it (accessibility). */}
      <MotionConfig reducedMotion="user">
        <LayoutGroup>
          <App />
        </LayoutGroup>
      </MotionConfig>
    </StrictMode>,
  );
}

// A deck link (#deck=…): the deck builder offers to import it, nothing is resumed. Otherwise, page reopened: the saved
// game against the AI resumes. Page closed: the save is written at once.
const deckData = sharedDeckData(location.hash);
if (deckData) {
  history.replaceState(null, "", location.pathname + location.search);
  void decodeDeck(deckData).then((text) => {
    if (text) useGame.setState({ screen: "decks", editing: null, sharedDeck: text });
    else useGame.getState().notify(msg("This deck link is damaged."));
  });
} else if (codeFromUrl() && !hasOnlineToken()) useGame.getState().openOnline();
else useGame.getState().resumeAtStartup();
window.addEventListener("pagehide", flushSave);

// Sound: unlocked on the first gesture (browsers' autoplay policy), button clicks, M = mute.
document.addEventListener("pointerdown", unlockAudio, { capture: true });
document.addEventListener(
  "click",
  (e) => {
    const btn = (e.target as HTMLElement | null)?.closest?.("button.btn, .main-button");
    if (btn && !(btn as HTMLButtonElement).disabled) playSound("click");
  },
  { capture: true },
);
document.addEventListener("keydown", (e) => {
  const el = e.target as HTMLElement | null;
  if (e.key.toLowerCase() !== "m" || e.ctrlKey || e.metaKey || e.altKey) return;
  if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
  useAudio.getState().toggleMute();
});

/** An online game of this browser to resume (its reconnection token): it comes before an invitation link. */
function hasOnlineToken(): boolean {
  try {
    return !!localStorage.getItem("finalcircle.online");
  } catch {
    return false;
  }
}
