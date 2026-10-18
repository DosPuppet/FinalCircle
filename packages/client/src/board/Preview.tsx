/**
 * The hovered card, large (from Planecircle): its full image, or its data drawn, and under it its description — name
 * and cost, type, job and category, its whole text in the interface language (the image may be in English: a card that
 * only exists in English shows its English image), its marks — and on the field its current state.
 */
import { type CardFace, HIDDEN_CARD_ID, type ObjectView } from "@finalcircle/engine";
import { faceJob, faceName, faceText, KEYWORD_LABEL, TYPE_LABEL } from "../i18n";
import { useT } from "../localize";
import { useGame } from "../store";
import { textIn } from "../translate";
import { Card } from "./Card";
import { CardText } from "./CardText";
import { ElementIcon } from "./ElementIcon";

/** The description of a card under its image; `obj`: its current state on the field. */
export function CardDetails({ face, obj }: { face: CardFace; obj?: ObjectView | undefined }) {
  const lang = useGame((s) => s.lang);
  const t = useT();
  const job = faceJob(face, lang);
  const text = faceText(face, lang);
  const onField = obj?.zone === "field";
  return (
    <div className="card-details" data-testid="card-details">
      <div className="details-title">
        <span className="details-cost">
          {face.elements.map((e) => (
            <ElementIcon key={e} element={e} size={16} />
          ))}
          <b>{face.cost}</b>
        </span>
        <span className="details-name">{faceName(face, lang)}</span>
      </div>
      <div className="details-type">
        {textIn(lang, TYPE_LABEL[face.type])}
        {job ? ` — ${job}` : ""}
        {face.categories.length ? ` · ${face.categories.join(" · ")}` : ""}
      </div>
      <div className="details-marks">
        {face.lb !== undefined ? <span className="mark lb">{t("Limit Break {n}", { n: face.lb })}</span> : null}
        {face.exBurst ? <span className="mark ex">EX BURST</span> : null}
        {face.generic ? <span className="mark">{t("Generic card")}</span> : null}
        {face.type === "Forward" && face.power !== undefined ? (
          <span className="mark">{t("Power {n}", { n: face.power })}</span>
        ) : null}
      </div>
      {text ? (
        <div className="details-text">
          <CardText text={text} size={14} />
        </div>
      ) : null}
      {onField ? (
        <div className="preview-state">
          {obj.power !== undefined && obj.power !== face.power ? <span>{t("Current power {n}", { n: obj.power })}</span> : null}
          {obj.damage ? <span>{t("Damage {n}", { n: obj.damage })}</span> : null}
          {obj.keywords.map((k) => (
            <span key={k}>{textIn(lang, KEYWORD_LABEL[k])}</span>
          ))}
          {obj.dull ? <span>{t("Dull")}</span> : null}
          {obj.frozen ? <span>{t("Frozen")}</span> : null}
        </div>
      ) : null}
      <div className="details-code">{face.defId}</div>
    </div>
  );
}

/** The card under the pointer, or `id` (the card held under a finger). */
export function Preview({ id }: { id?: string | null }) {
  const hovered = useGame((s) => s.hover);
  const hover = id === undefined ? hovered : id;
  const view = useGame((s) => s.view);
  const faces = useGame((s) => s.faces);
  if (!hover || !view) return <div className="preview empty" data-tuto="preview" />;
  const all = [
    ...view.field,
    ...view.hand,
    ...Object.values(view.players).flatMap((p) => [...p.breakZone, ...p.damage, ...p.removed, ...p.lb]),
  ];
  const obj = all.find((o) => o.id === hover);
  const defId = obj?.defId ?? hover;
  const face = faces[defId];
  if (!face || defId === HIDDEN_CARD_ID) return <div className="preview empty" data-tuto="preview" />;
  return (
    <div className="preview" data-tuto="preview">
      <Card face={face} size="full" />
      <CardDetails face={face} obj={obj} />
    </div>
  );
}
