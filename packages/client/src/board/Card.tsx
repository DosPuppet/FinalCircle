/**
 * A card on screen: its image through the relay (the French printing, then the English one), or the card drawn from
 * its data (`TextFrame`). Dull cards are turned sideways (CR 6.3.1); badges show damage, the current power and Freeze.
 */
import { type CardFace, HIDDEN_CARD_ID, type ObjectView } from "@finalcircle/engine";
import { memo, useState } from "react";
import { faceName } from "../i18n";
import { type ImageSize, imageUrls } from "../images";
import { useGame } from "../store";
import { useLongPress } from "../touch";
import { TextFrame } from "./TextFrame";

export type Glow = "playable" | "target" | "selected" | "attacking" | "blocking" | "source" | "chosen" | null;

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
          draggable={false}
          onError={() => setFailed((n) => n + 1)}
        />
      ) : null}
    </div>
  );
}

export const Card = memo(function Card({
  obj,
  face,
  size = "thumbs",
  glow = null,
  onClick,
  className = "",
}: {
  obj?: ObjectView;
  face: CardFace | undefined;
  size?: ImageSize;
  glow?: Glow;
  onClick?: () => void;
  className?: string;
}) {
  const setHover = useGame((s) => s.setHover);
  const hidden = !face || obj?.defId === HIDDEN_CARD_ID || (obj?.faceDown && obj.defId === HIDDEN_CARD_ID);
  const id = obj?.id ?? face?.defId ?? "";
  const longPress = useLongPress(() => setHover(id));
  const modified = obj?.power !== undefined && face?.power !== undefined && obj.power !== face.power;
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a role "button" when the card can be used; otherwise, hovering only shows its preview
    <div
      className={`card${obj?.dull ? " dull" : ""}${glow ? ` glow-${glow}` : ""}${onClick ? " clickable" : ""} ${className}`}
      data-oid={obj?.id}
      data-def={hidden ? undefined : face?.defId}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (onClick && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick();
        }
      }}
      onPointerEnter={hidden ? undefined : () => setHover(id)}
      {...(hidden ? {} : longPress)}
    >
      {hidden ? <CardBack /> : <CardImage face={face} size={size} compact={size === "thumbs"} />}
      {obj && obj.damage > 0 ? <span className="badge damage">{obj.damage}</span> : null}
      {obj?.power !== undefined && obj.zone === "field" ? (
        <span className={`badge power${modified ? " modified" : ""}`}>{obj.power}</span>
      ) : null}
      {obj?.frozen ? <span className="badge frozen">❄</span> : null}
      {obj?.attacking ? <span className="badge attacking">⚔</span> : null}
    </div>
  );
});
