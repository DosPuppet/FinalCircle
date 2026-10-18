/**
 * A card drawn from its data, when there is no image (the starter exclusives, a blocked network, images off): the
 * element's frame, the cost crystal, the name, type and job, the power, the text, the category and the card number.
 */
import type { CardFace } from "@finalcircle/engine";
import { faceJob, faceName, faceText, TYPE_LABEL } from "../i18n";
import { useT } from "../localize";
import { useGame } from "../store";
import { textIn } from "../translate";
import { CardText } from "./CardText";
import { ELEMENT_COLOR, ElementIcon } from "./ElementIcon";

export function TextFrame({ face, compact = false }: { face: CardFace; compact?: boolean }) {
  const lang = useGame((s) => s.lang);
  const t = useT();
  const colors = face.elements.map((e) => ELEMENT_COLOR[e]);
  const frame = colors.length > 1 ? `linear-gradient(135deg, ${colors.join(", ")})` : colors[0];
  return (
    <div className={`text-frame${compact ? " compact" : ""}`} style={{ background: frame }}>
      <div className="tf-head">
        <span className="tf-cost">
          {face.elements.map((e) => (
            <ElementIcon key={e} element={e} size={compact ? 12 : 16} />
          ))}
          <b>{face.cost}</b>
        </span>
        <span className="tf-name">{faceName(face, lang)}</span>
        {face.exBurst ? <span className="tf-ex">EX</span> : null}
        {face.generic ? (
          <span className="tf-generic" title={t("Generic card")}>
            ⧉
          </span>
        ) : null}
      </div>
      {compact ? null : (
        <>
          <div className="tf-type">
            {textIn(lang, TYPE_LABEL[face.type])}
            {faceJob(face, lang) ? ` — ${faceJob(face, lang)}` : ""}
          </div>
          <div className="tf-body">
            <CardText text={faceText(face, lang)} size={13} />
          </div>
        </>
      )}
      <div className="tf-foot">
        {face.type === "Forward" && face.power !== undefined ? <span className="tf-power">{face.power}</span> : <span />}
        <span className="tf-code">
          {face.categories.join(" · ")} {face.defId}
        </span>
      </div>
      {compact ? null : <div className="tf-legal">© SQUARE ENIX</div>}
    </div>
  );
}
