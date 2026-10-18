/**
 * The eight elements (CR 5.2.1.1) as the project's own icons (not the official crystals): a flame, a snowflake, a
 * swirl, a rock, a bolt, a drop, a star and a crescent, on the element's color.
 */
import type { Element } from "@finalcircle/engine";

export const ELEMENT_COLOR: Record<Element, string> = {
  fire: "#d8452f",
  ice: "#3cb7d8",
  wind: "#3fa45a",
  earth: "#c79a1e",
  lightning: "#8b55c9",
  water: "#2f6fd8",
  light: "#f1ecd8",
  dark: "#2a2433",
};

const GLYPH: Record<Element, string> = {
  fire: "M12 3c1 3.2 4.6 5.1 4.6 9.2A4.6 4.6 0 0 1 12 17a4.6 4.6 0 0 1-4.6-4.8c0-2.2 1.3-3.5 2.1-4.6.3 1.5 1 2.4 1.9 2.8C11 8.4 11 5.6 12 3Z",
  ice: "M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M12 6.5l-2-1.8M12 6.5l2-1.8M12 17.5l-2 1.8M12 17.5l2 1.8",
  wind: "M4 9h10.5a2.7 2.7 0 1 0-2.6-3.4M4 13h14a2.8 2.8 0 1 1-2.7 3.5M4 17h7",
  earth: "M3.5 18 9 7.5l3.2 5.2 2.3-3.4L20.5 18Z",
  lightning: "M13.5 3 6 13.2h5L9.8 21 18 10.6h-5.2Z",
  water: "M12 3.5c3.4 4.6 5.4 7.6 5.4 10.1a5.4 5.4 0 0 1-10.8 0c0-2.5 2-5.5 5.4-10.1Z",
  light: "m12 3 2.1 6.5H21l-5.5 4 2.1 6.5L12 16l-5.6 4 2.1-6.5-5.5-4h6.9Z",
  dark: "M15.5 4.2A8 8 0 1 0 19.8 15 6.5 6.5 0 0 1 15.5 4.2Z",
};

const STROKED: ReadonlySet<Element> = new Set(["ice", "wind"]);

export function ElementIcon({ element, size = 16, title }: { element: Element; size?: number; title?: string }) {
  const fg = element === "light" ? "#7a6a2a" : "#fff";
  const stroked = STROKED.has(element);
  return (
    <svg
      className={`element-icon el-${element}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-label={title ?? element}
    >
      {title ? <title>{title}</title> : null}
      <circle cx="12" cy="12" r="11.5" fill={ELEMENT_COLOR[element]} stroke="rgba(0,0,0,.35)" />
      <path
        d={GLYPH[element]}
        fill={stroked ? "none" : fg}
        stroke={stroked ? fg : "none"}
        strokeWidth={stroked ? 1.9 : 0}
        strokeLinecap="round"
        transform="translate(2.4 2.4) scale(0.8)"
      />
    </svg>
  );
}

/** A generic CP symbol (《1》, 《X》). */
export function GenericCp({ n, size = 16 }: { n: string; size?: number }) {
  return (
    <svg className="cp-generic" width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={n}>
      <circle cx="12" cy="12" r="11.5" fill="#d9d4c7" stroke="rgba(0,0,0,.35)" />
      <text x="12" y="16.5" textAnchor="middle" fontSize="13" fontWeight="700" fill="#2b2b2b">
        {n}
      </text>
    </svg>
  );
}

/** 《ダル》: dull the card. */
export function DullIcon({ size = 16 }: { size?: number }) {
  return (
    <svg className="dull-icon" width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="Dull">
      <circle cx="12" cy="12" r="11.5" fill="#31353d" stroke="rgba(0,0,0,.35)" />
      <rect
        x="5"
        y="8.5"
        width="14"
        height="9"
        rx="1.6"
        fill="none"
        stroke="#f0e6c8"
        strokeWidth="1.8"
        transform="rotate(-90 12 13)"
      />
      <path d="M7 6.5h7.5l-2-2M14.5 6.5l-2 2" fill="none" stroke="#f0e6c8" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** 《S》: a special ability; 《C》: a Crystal; 《LB》. */
export function SymbolBadge({ text, kind, size = 16 }: { text: string; kind: "special" | "crystal" | "lb"; size?: number }) {
  const bg = kind === "special" ? "#b8862b" : kind === "crystal" ? "#5fb7c9" : "#7a2d2d";
  return (
    <svg className={`symbol-${kind}`} width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={text}>
      {kind === "crystal" ? (
        <path d="M12 1.5 20 9l-8 13.5L4 9Z" fill={bg} stroke="rgba(0,0,0,.35)" />
      ) : (
        <circle cx="12" cy="12" r="11.5" fill={bg} stroke="rgba(0,0,0,.35)" />
      )}
      <text x="12" y="16" textAnchor="middle" fontSize={text.length > 1 ? 9 : 12} fontWeight="800" fill="#fff">
        {text}
      </text>
    </svg>
  );
}
