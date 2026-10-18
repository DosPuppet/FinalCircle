/**
 * The tutorial guide (from Planecircle): a text bubble next to the element concerned, which is surrounded by a glowing
 * ring. The ring does not catch clicks: the element stays usable underneath.
 */
import type { GameView } from "@finalcircle/engine";
import { Fragment, useEffect, useRef, useState } from "react";
import { inline } from "../board/CardText";
import { useT } from "../localize";
import { useGame } from "../store";
import { textIn } from "../translate";
import { LESSONS, lessonById } from "./lessons";
import { placeBubble, type Rect } from "./placement";
import { stepText, type Target } from "./runtime";
import { useTutorial } from "./store";

const SELECTORS: Record<Exclude<Target, object>, string> = {
  myDamage: '[data-tuto="my-damage"]',
  oppDamage: '[data-tuto="opp-damage"]',
  myForwards: '[data-tuto="my-forwards"]',
  myBackups: '[data-tuto="my-backups"]',
  oppForwards: '[data-tuto="opp-forwards"]',
  hand: '[data-tuto="hand"]',
  myDeck: '[data-tuto="my-deck"]',
  myBreak: '[data-tuto="my-break"]',
  myLb: '[data-tuto="my-lb"]',
  phases: '[data-tuto="phases"]',
  stack: '[data-tuto="stack"]',
  mainButton: '[data-tuto="mainButton"]',
  // In Main Phase 2 the main button itself ends the turn.
  endTurn: '[data-tuto="endTurn"], [data-tuto="mainButton"]',
  preview: '[data-tuto="preview"]',
  log: '[data-tuto="log"]',
  payment: '[data-tuto="payment"]',
  attackInfo: '[data-tuto="attack-info"]',
};

function cardId(t: Extract<Target, object>, v: GameView): string | undefined {
  const owner = t.owner === "opponent" ? v.opponent : v.viewer;
  if (t.zone !== "field") {
    const inHand = v.hand.find((o) => o.defId === t.card)?.id;
    if (inHand || t.zone === "hand") return inHand;
  }
  return v.field.find((o) => o.defId === t.card && o.controller === owner)?.id;
}

function targetElement(t: Target | undefined, v: GameView | null): Element | null {
  if (!t || !v) return null;
  if (typeof t === "object") {
    if (t.zone === "stack") return document.querySelector(SELECTORS.stack);
    const id = cardId(t, v);
    return id ? document.querySelector(`[data-oid="${id}"]`) : null;
  }
  // Several selectors: the first one present, in this order of preference.
  for (const sel of SELECTORS[t].split(", ")) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  return null;
}

/** What the bubble should avoid covering: the cards, the buttons, the panels and windows. */
const OBSTACLES = ".table [data-oid], .main-actions, .payment-tray, .choice-panel, .modal";

function rectOf(el: Element | null): Rect | null {
  const r = el?.getBoundingClientRect();
  return r && r.width > 0 && r.height > 0 ? { x: r.left, y: r.top, w: r.width, h: r.height } : null;
}

const keyOf = (r: Rect | null) => (r ? `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.w)},${Math.round(r.h)}` : "");

const GAP = 14;
const PAD = 6;

/** Ring around the target and position of the bubble, followed every few frames (cards move, the window resizes). */
function useCoachLayout(
  target: Target | undefined,
  bubble: React.RefObject<HTMLDivElement | null>,
): { ring: Rect | null; pos: { left: number; top: number } | null } {
  const view = useGame((s) => s.view);
  const [layout, setLayout] = useState<{ ring: Rect | null; pos: { left: number; top: number } | null }>({
    ring: null,
    pos: null,
  });
  const last = useRef("");
  useEffect(() => {
    let raf = 0;
    let frame = 0;
    const tick = () => {
      if (frame++ % 4 === 0) {
        const ring = rectOf(targetElement(target, view));
        const b = bubble.current;
        const size = { w: b?.offsetWidth ?? 360, h: b?.offsetHeight ?? 120 };
        const obstacles = [...document.querySelectorAll(OBSTACLES)]
          .filter((el) => !b?.contains(el))
          .map((el) => rectOf(el))
          .filter((r): r is Rect => !!r)
          .map((r) => ({ r, weight: 1 }));
        const pos = placeBubble(ring, size, { w: window.innerWidth, h: window.innerHeight }, obstacles, GAP + PAD);
        const key = `${keyOf(ring)}|${Math.round(pos.left)},${Math.round(pos.top)}`;
        if (key !== last.current) {
          last.current = key;
          setLayout({ ring, pos });
        }
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [target, view, bubble]);
  return layout;
}

/** Guide text: **bold** and CP symbols (《火》, 《S》…). */
export function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) => {
        const key = `${i}-${p}`;
        if (p.startsWith("**")) return <strong key={key}>{inline(p.slice(2, -2), key, 15)}</strong>;
        return <Fragment key={key}>{inline(p, key, 15)}</Fragment>;
      })}
    </>
  );
}

export function Coach() {
  const tuto = useTutorial();
  const t = useT();
  const lang = useGame((s) => s.lang);
  const lesson = lessonById(tuto.lessonId);
  const step = lesson?.steps[tuto.step];
  const ref = useRef<HTMLDivElement>(null);
  const { ring: rect, pos } = useCoachLayout(tuto.finished ? undefined : step?.target, ref);
  const [hidden, setHidden] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the bubble comes back at every new step
  useEffect(() => {
    setHidden(false);
  }, [tuto.lessonId, tuto.step, tuto.finished]);
  if (!lesson || !step) return null;
  const index = LESSONS.indexOf(lesson);
  const nextLesson = LESSONS[index + 1];
  const tip = step.free && tuto.ctx ? step.tips?.find((x) => tuto.ctx && x.when(tuto.ctx))?.text : undefined;

  if (hidden) {
    return (
      <button type="button" className="coach-reopen btn small" onClick={() => setHidden(false)}>
        {t("Guide")}
      </button>
    );
  }

  return (
    <>
      {rect && !tuto.finished ? (
        <div
          className={`coach-ring${step.next ? " dim" : ""}`}
          style={{ left: rect.x - PAD, top: rect.y - PAD, width: rect.w + PAD * 2, height: rect.h + PAD * 2 }}
        />
      ) : null}
      <div
        ref={ref}
        className={`coach${tuto.finished ? " done" : ""}`}
        style={{
          width: "min(380px, calc(100vw - 24px))",
          left: pos?.left ?? 12,
          top: pos?.top ?? 70,
          visibility: pos ? "visible" : "hidden",
        }}
        role="dialog"
        aria-label={t("Guide")}
        data-testid="coach"
      >
        <div className="coach-head">
          <span>
            {t("Lesson {n}/{total} · {title}", { n: index + 1, total: LESSONS.length, title: textIn(lang, lesson.title) })}
          </span>
          {!tuto.finished ? (
            <span className="coach-count">
              {tuto.step + 1}/{lesson.steps.length}
            </span>
          ) : null}
        </div>
        {tuto.finished ? (
          <>
            <div className="coach-text" data-testid="coach-done">
              <strong>{t("Lesson complete!")}</strong>{" "}
              {nextLesson
                ? t("Up next: {title}.", { title: textIn(lang, nextLesson.title) })
                : t("You have finished the whole tutorial. Well done!")}
            </div>
            <div className="coach-actions">
              {nextLesson ? (
                <button
                  type="button"
                  className={`btn small${tuto.chain ? " primary" : ""}`}
                  onClick={tuto.startNext}
                  data-testid="coach-next-lesson"
                >
                  {t("Next lesson")}
                </button>
              ) : null}
              <button type="button" className={`btn small${tuto.chain && nextLesson ? "" : " primary"}`} onClick={tuto.quit}>
                {t("Tutorial menu")}
              </button>
              <button type="button" className="btn small ghost" onClick={() => setHidden(true)} title={t("Hide the guide")}>
                {t("Hide")}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="coach-text" data-testid="coach-text">
              <RichText text={textIn(lang, stepText(step, tuto.ctx))} />
            </div>
            {tip ? (
              <div className="coach-tip">
                <RichText text={textIn(lang, tip)} />
              </div>
            ) : null}
            <div className="coach-actions">
              {step.next ? (
                <button type="button" className="btn small primary coach-next" onClick={tuto.next} data-testid="coach-next">
                  {tuto.step + 1 === lesson.steps.length ? t("Finish") : t("Next")}
                </button>
              ) : null}
              <span className="coach-spacer" />
              {step.free ? (
                <button type="button" className="btn small ghost" onClick={() => setHidden(true)} title={t("Hide the guide")}>
                  {t("Hide")}
                </button>
              ) : null}
              <button type="button" className="btn small ghost" onClick={tuto.restart} title={t("Restart the lesson")}>
                {t("Restart")}
              </button>
              <button type="button" className="btn small ghost" onClick={tuto.quit}>
                {t("Quit")}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
