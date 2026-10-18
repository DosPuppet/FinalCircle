/**
 * A card's text with the official markup: `[[br]]` paragraphs, `[[i]]` italics, `[[b]]` bold, `[[s]]` a special
 * ability's name, `[[ex]]EX BURST[[/]]` the EX badge; symbols `《火》` (CP of an element), `《1》`, `《ダル》`, `《S》`,
 * `《C》`, `《X》`, `《LB》` as icons.
 */
import type { Element } from "@finalcircle/engine";
import { Fragment, type ReactNode } from "react";
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

/** Inline content: the symbols of a run of text (also used by the tutorial's guide). */
export function inline(text: string, keyBase: string, size: number): ReactNode[] {
  return text.split(/(《[^》]+》)/).map((part, i) => {
    const m = /^《([^》]+)》$/.exec(part);
    return m ? symbol(m[1] as string, `${keyBase}-${i}`, size) : <Fragment key={`${keyBase}-${i}`}>{part}</Fragment>;
  });
}

/** One paragraph with its spans. */
function paragraph(p: string, key: string, size: number): ReactNode {
  const out: ReactNode[] = [];
  const re = /\[\[(i|b|s|ex)\]\](.*?)\[\[\/\]\]/g;
  let last = 0;
  let k = 0;
  for (const m of p.matchAll(re)) {
    if ((m.index ?? 0) > last) out.push(...inline(p.slice(last, m.index), `${key}-t${k++}`, size));
    const body = inline(m[2] as string, `${key}-s${k}`, size);
    const tag = m[1];
    if (tag === "i") out.push(<em key={`${key}-${k++}`}>{body}</em>);
    else if (tag === "b") out.push(<strong key={`${key}-${k++}`}>{body}</strong>);
    else if (tag === "s")
      out.push(
        <span key={`${key}-${k++}`} className="special-name">
          {body}
        </span>,
      );
    else
      out.push(
        <span key={`${key}-${k++}`} className="ex-burst">
          EX BURST
        </span>,
      );
    last = (m.index ?? 0) + m[0].length;
  }
  if (last < p.length) out.push(...inline(p.slice(last), `${key}-t${k}`, size));
  return (
    <p key={key} className="card-text-p">
      {out}
    </p>
  );
}

export function CardText({ text, size = 14 }: { text: string; size?: number }) {
  return <div className="card-text">{text.split("[[br]]").map((p, i) => paragraph(p, `p${i}`, size))}</div>;
}
