/**
 * A card on screen: its image through the relay (the French printing, then the English one), or the card drawn from
 * its data (`TextFrame`). Dull cards are turned sideways (CR 6.3.1) and their slot widens so that neighbours make room;
 * badges show damage, the current power and Freeze, and the damage just dealt pops out. With a `layoutId` (the
 * physical card's `uid`), the card glides from one zone to the next (hand → field → Break Zone).
 */
import { type CardFace, HIDDEN_CARD_ID, type ObjectView } from "@finalcircle/engine";
import { motion } from "motion/react";
import { memo, useState } from "react";
import { fastMode } from "../fast";
import { faceName } from "../i18n";
import { type ImageSize, imageUrls } from "../images";
import { useGame } from "../store";
import { useLongPress } from "../touch";
import { SwordIcon } from "./ElementIcon";
import { TextFrame } from "./TextFrame";

export type Glow = "playable" | "target" | "selected" | "attacking" | "blocking" | "source" | "chosen" | null;

const SPRING = { type: "spring", stiffness: 420, damping: 38 } as const;
const INSTANT = { duration: 0 } as const;

export function CardBack() {
  return (
    <div className="card-back" aria-hidden="true">
      <div className="card-back-ring" />
    </div>
  );
}

function CardImage({ face, size, compact }: { face: CardFace; size: ImageSize; compact: boolean }) {
  const lang = useGame((s) => s.lang);
  const urls = imageUrls(face, lang, size);
  const [failed, setFailed] = useState(0);
  const url = urls[failed];
  return (
    <div className="card-face">
      <TextFrame face={face} compact={compact} />
      {url ? (
        <img
          key={url}
          className="card-img"
          src={url}
          alt={faceName(face, lang)}
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailed((n) => n + 1)}
        />
      ) : null}
    </div>
  );
}

/** The damage just dealt to a Forward, popping out for a moment (`hits` of the store). */
function Hit({ id }: { id: string }) {
  const hit = useGame((s) => s.hits[id]);
  if (!hit) return null;
  return (
    <span key={hit.at} className="hit" aria-hidden="true">
      −{hit.amount}
    </span>
  );
}

export const Card = memo(function Card({
  obj,
  face,
  size = "thumbs",
  glow = null,
  onClick,
  className = "",
  layoutId,
}: {
  obj?: ObjectView;
  face: CardFace | undefined;
  size?: ImageSize;
  glow?: Glow;
  onClick?: () => void;
  className?: string;
  layoutId?: string;
}) {
  const setHover = useGame((s) => s.setHover);
  const lang = useGame((s) => s.lang);
  const hidden = !face || obj?.defId === HIDDEN_CARD_ID;
  const id = obj?.id ?? face?.defId ?? "";
  const longPress = useLongPress(() => setHover(id));
  const modified = obj?.power !== undefined && face?.power !== undefined && obj.power !== face.power;
  const dull = !!obj?.dull;
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a role "button" when the card can be used; otherwise, hovering only shows its preview
    <div
      className={`card-slot${dull ? " dull" : ""} ${className}`}
      data-oid={obj?.id}
      data-def={hidden ? undefined : face?.defId}
      {...(onClick ? { role: "button", tabIndex: 0, "aria-label": hidden ? undefined : faceName(face, lang) } : {})}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault();
              e.stopPropagation();
              onClick();
            }
          : undefined
      }
      onPointerEnter={hidden ? undefined : () => setHover(id)}
      {...(hidden ? {} : longPress)}
    >
      <motion.div
        layoutId={layoutId}
        layout={layoutId ? true : undefined}
        transition={fastMode() ? INSTANT : SPRING}
        initial={false}
        animate={{ rotate: dull ? 90 : 0 }}
        className={`card${glow ? ` glow-${glow}` : ""}${onClick ? " clickable" : ""}`}
        onClick={onClick}
      >
        {hidden ? <CardBack /> : <CardImage face={face} size={size} compact={size === "thumbs"} />}
        {obj && obj.damage > 0 ? <span className="badge damage">{obj.damage}</span> : null}
        {obj?.power !== undefined && obj.zone === "field" ? (
          <span className={`badge power${modified ? " modified" : ""}`}>{obj.power}</span>
        ) : null}
        {obj?.frozen ? <span className="badge frozen">❄</span> : null}
        {obj?.attacking ? (
          <span className="badge attacking">
            <SwordIcon size={12} />
          </span>
        ) : null}
        {obj?.zone === "field" ? <Hit id={obj.id} /> : null}
      </motion.div>
    </div>
  );
});
