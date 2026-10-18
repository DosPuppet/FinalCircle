/** Tutorial menu (from Planecircle): play everything through, resume where you left off, or choose a lesson. */
import { useT } from "../localize";
import { useGame } from "../store";
import { textIn } from "../translate";
import { LESSONS, lessonById } from "./lessons";
import { useTutorial } from "./store";

export function TutorialMenu() {
  const progress = useTutorial((s) => s.progress);
  const start = useTutorial((s) => s.start);
  const resetProgress = useTutorial((s) => s.resetProgress);
  const lang = useGame((s) => s.lang);
  const t = useT();
  const resume = lessonById(progress.current);
  const allDone = LESSONS.every((l) => progress.done.includes(l.id));
  return (
    <div className="lobby tutorial-menu">
      <header className="lobby-head">
        <h1>{t("Learn to play")}</h1>
        <p className="tagline">
          {t(
            "Short lessons on real game excerpts, with the cards of the two Starter Sets. Your progress is saved: you can stop and resume later.",
          )}
        </p>
      </header>
      <main className="lobby-main">
        <div className="lobby-buttons">
          {resume ? (
            <button type="button" className="btn primary big" onClick={() => start(resume.id, true)} data-testid="resume-lesson">
              {t("Resume: {title}", { title: textIn(lang, resume.title) })}
            </button>
          ) : null}
          <button
            type="button"
            className={`btn big${resume ? "" : " primary"}`}
            onClick={() => start(LESSONS[0]?.id ?? "", true)}
            data-testid="all-lessons"
          >
            {progress.done.length > 0 || resume ? t("Start everything over") : t("Play every lesson")}
          </button>
          <button type="button" className="btn big" onClick={() => useGame.setState({ screen: "lobby" })}>
            {t("Back")}
          </button>
        </div>
        {allDone ? <p className="hint">{t("Every lesson is complete. Well done!")}</p> : null}
        <ol className="lesson-list">
          {LESSONS.map((l, i) => {
            const done = progress.done.includes(l.id);
            const current = progress.current === l.id;
            return (
              <li key={l.id}>
                <button
                  type="button"
                  className={`lesson-tile${done ? " done" : ""}${current ? " current" : ""}`}
                  onClick={() => start(l.id)}
                  data-testid={`lesson-${l.id}`}
                >
                  <span className="lesson-num">{done ? "✓" : i + 1}</span>
                  <span className="lesson-body">
                    <span className="lesson-title">
                      {textIn(lang, l.title)}
                      {current ? <span className="lesson-badge">{t("to resume")}</span> : null}
                    </span>
                    <span className="lesson-summary">{textIn(lang, l.summary)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        {progress.done.length > 0 || resume ? (
          <button
            type="button"
            className="btn small ghost"
            onClick={() => window.confirm(t("Erase your tutorial progress?")) && resetProgress()}
          >
            {t("Reset")}
          </button>
        ) : null}
      </main>
    </div>
  );
}
