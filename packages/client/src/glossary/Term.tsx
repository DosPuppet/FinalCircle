/**
 * A glossary term in a card's text: underlined, its definition shows in a bubble on hover (mouse), on focus (keyboard)
 * or on a tap (touch screens, where a tap elsewhere closes it). The bubble opens the whole glossary at that term.
 */
import { type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RichText } from "../board/CardText";
import { useT } from "../localize";
import { useGame } from "../store";
import { isTouch, justLongPressed } from "../touch";
import { textIn } from "../translate";
import type { GlossaryTerm } from "./terms";

const MARGIN = 8;
/** Time to move the mouse from the word to its bubble. */
const HIDE_DELAY = 150;

function TermTip({
  term,
  anchor,
  id,
  keep,
  hide,
}: {
  term: GlossaryTerm;
  anchor: HTMLElement;
  id: string;
  keep: () => void;
  hide: () => void;
}) {
  const lang = useGame((s) => s.lang);
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  // Above the word when there is room, below otherwise; inside the window.
  useLayoutEffect(() => {
    const b = ref.current;
    if (!b) return;
    const a = anchor.getBoundingClientRect();
    const w = b.offsetWidth;
    const h = b.offsetHeight;
    const left = Math.min(Math.max(a.left + a.width / 2 - w / 2, MARGIN), window.innerWidth - w - MARGIN);
    const top = a.top - h - 6 >= MARGIN ? a.top - h - 6 : Math.min(a.bottom + 6, window.innerHeight - h - MARGIN);
    setPos({ left, top });
  }, [anchor]);
  const english = lang === "en" ? null : textIn("en", term.name);
  return createPortal(
    // biome-ignore lint/a11y/useKeyWithClickEvents: its one control is a button
    <div
      ref={ref}
      id={id}
      role="tooltip"
      className="term-tip"
      style={pos ? { left: pos.left, top: pos.top } : { visibility: "hidden" }}
      onMouseEnter={keep}
      onMouseLeave={hide}
      // A tap in the bubble must not close what is under it (the card held under a finger).
      onClick={(e) => e.stopPropagation()}
      data-testid="term-tip"
    >
      <div className="term-tip-name">
        <b>{textIn(lang, term.name)}</b>
        {english && english !== textIn(lang, term.name) ? <span className="dim"> ({english})</span> : null}
      </div>
      <div className="term-tip-text">
        <RichText text={textIn(lang, term.definition)} />
      </div>
      <button
        type="button"
        className="btn small ghost term-tip-more"
        onClick={() => useGame.setState({ glossary: { focus: term.id }, peek: null })}
      >
        {t("Glossary")}
      </button>
    </div>,
    document.body,
  );
}

export function Term({ term, children }: { term: GlossaryTerm; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = useId();
  const keep = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const hide = () => {
    keep();
    timer.current = setTimeout(() => setOpen(false), HIDE_DELAY);
  };
  const show = () => {
    keep();
    setOpen(true);
  };
  // A touch (or click) outside the word and its bubble closes it: iOS does not blur on a tap elsewhere.
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (target && (ref.current?.contains(target) || document.getElementById(id)?.contains(target))) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, [open, id]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const mouse = !isTouch();
  return (
    <>
      <button
        type="button"
        ref={ref}
        className="term"
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onMouseEnter={mouse ? show : undefined}
        onMouseLeave={mouse ? hide : undefined}
        onFocus={mouse ? show : undefined}
        onBlur={mouse ? hide : undefined}
        onClick={(e) => {
          // The word is inside a card (held under a finger, or clickable): its tap is only for the word.
          e.stopPropagation();
          if (!justLongPressed()) show();
        }}
        onKeyDown={(e) => {
          if (e.key !== "Escape" || !open) return;
          e.stopPropagation();
          setOpen(false);
        }}
      >
        {children}
      </button>
      {open && ref.current ? <TermTip term={term} anchor={ref.current} id={id} keep={keep} hide={hide} /> : null}
    </>
  );
}
