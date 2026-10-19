/**
 * A card's text with the official markup: `[[br]]` paragraphs, `[[i]]` italics, `[[b]]` bold, `[[s]]` a special
 * ability's name, `[[ex]]EX BURST[[/]]` the EX badge; symbols `《火》` (CP of an element), `《1》`, `《ダル》`, `《S》`,
 * `《C》`, `《X》`, `《LB》` as icons. With a language, the glossary's keywords and symbols explain themselves (`Term`).
 */
import type { Element } from "@finalcircle/engine";
import { Fragment, type ReactNode } from "react";
import { Term } from "../glossary/Term";
import { splitTerms, termById, termOfSymbol } from "../glossary/terms";
import type { Lang } from "../translate";
import { DullIcon, ElementIcon, GenericCp, SymbolBadge } from "./ElementIcon";

const KANJI: Record<string, Element> = {
  火: "fire",
  氷: "ice",
  風: "wind",
  土: "earth",
  雷: "lightning",
  水: "water",
  光: "light",
  闇: "dark",
};

function symbol(sym: string, key: string, size: number): ReactNode {
  const element = KANJI[sym];
  if (element) return <ElementIcon key={key} element={element} size={size} />;
  if (sym === "ダル") return <DullIcon key={key} size={size} />;
  if (sym === "S") return <SymbolBadge key={key} text="S" kind="special" size={size} />;
  if (sym === "C") return <SymbolBadge key={key} text="C" kind="crystal" size={size} />;
  if (sym === "LB") return <SymbolBadge key={key} text="LB" kind="lb" size={size} />;
  return <GenericCp key={key} n={sym} size={size} />;
}

/** Plain text, its glossary terms marked when `terms` gives the language. */
function words(text: string, key: string, terms?: Lang): ReactNode {
  if (!terms) return <Fragment key={key}>{text}</Fragment>;
  return (
    <Fragment key={key}>
      {splitTerms(text, terms).map((piece, i) =>
        typeof piece === "string" ? (
          piece
        ) : (
          <Term key={i} term={piece.term}>
            {piece.text}
          </Term>
        ),
      )}
    </Fragment>
  );
}

/** Inline content: the symbols of a run of text (also used by the tutorial's guide and the glossary). */
export function inline(text: string, keyBase: string, size: number, terms?: Lang): ReactNode[] {
  return text.split(/(《[^》]+》)/).map((part, i) => {
    const key = `${keyBase}-${i}`;
    const m = /^《([^》]+)》$/.exec(part);
    if (!m) return words(part, key, terms);
    const icon = symbol(m[1] as string, key, size);
    const term = terms ? termOfSymbol(m[1] as string) : undefined;
    return term ? (
      <Term key={key} term={term}>
        {icon}
      </Term>
    ) : (
      icon
    );
  });
}

/** Guide and glossary text: **bold** and CP symbols (《火》, 《S》…). */
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

/** One paragraph with its spans. */
function paragraph(p: string, key: string, size: number, terms?: Lang): ReactNode {
  const out: ReactNode[] = [];
  const re = /\[\[(i|b|s|ex)\]\](.*?)\[\[\/\]\]/g;
  let last = 0;
  let k = 0;
  for (const m of p.matchAll(re)) {
    if ((m.index ?? 0) > last) out.push(...inline(p.slice(last, m.index), `${key}-t${k++}`, size, terms));
    const body = inline(m[2] as string, `${key}-s${k}`, size, m[1] === "s" ? undefined : terms);
    const tag = m[1];
    if (tag === "i") out.push(<em key={`${key}-${k++}`}>{body}</em>);
    else if (tag === "b") out.push(<strong key={`${key}-${k++}`}>{body}</strong>);
    else if (tag === "s")
      out.push(
        <span key={`${key}-${k++}`} className="special-name">
          {body}
        </span>,
      );
    else {
      const badge = (
        <span key={`${key}-${k++}`} className="ex-burst">
          EX BURST
        </span>
      );
      const ex = terms ? termById("exBurst") : undefined;
      out.push(
        ex ? (
          <Term key={`${key}-${k++}`} term={ex}>
            {badge}
          </Term>
        ) : (
          badge
        ),
      );
    }
    last = (m.index ?? 0) + m[0].length;
  }
  if (last < p.length) out.push(...inline(p.slice(last), `${key}-t${k}`, size, terms));
  return (
    <p key={key} className="card-text-p">
      {out}
    </p>
  );
}

/** `terms`: the language of the text, to mark its glossary terms (the description; not the small card frames). */
export function CardText({ text, size = 14, terms }: { text: string; size?: number; terms?: Lang }) {
  return <div className="card-text">{text.split("[[br]]").map((p, i) => paragraph(p, `p${i}`, size, terms))}</div>;
}
