import { LayoutGroup, MotionConfig } from "motion/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { flushSave, useGame } from "./store";
import "./styles.css";

// Dev mode: access to the store for the Playwright scripts (sandbox, see protocol.ts).
if (import.meta.env.DEV) (window as unknown as { __fc: typeof useGame }).__fc = useGame;

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

// Page reopened: the saved game against the AI resumes; page closed: the save is written at once.
useGame.getState().resumeAtStartup();
window.addEventListener("pagehide", flushSave);
