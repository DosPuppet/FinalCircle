/** The hovered card, large: its full image, or its data drawn, with its current state on the field. */
import { HIDDEN_CARD_ID } from "@finalcircle/engine";
import { faceName, KEYWORD_LABEL } from "../i18n";
import { useT } from "../localize";
import { useGame } from "../store";
import { textIn } from "../translate";
import { Card } from "./Card";

/** The card under the pointer, or `id` (the card held under a finger). */
export function Preview({ id }: { id?: string | null }) {
  const hovered = useGame((s) => s.hover);
  const hover = id === undefined ? hovered : id;
  const view = useGame((s) => s.view);
  const faces = useGame((s) => s.faces);
  const lang = useGame((s) => s.lang);
  const t = useT();
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
      <div className="preview-name">{faceName(face, lang)}</div>
      {obj?.zone === "field" ? (
        <div className="preview-state">
          {obj.power !== undefined ? <span>{t("Power {n}", { n: obj.power })}</span> : null}
          {obj.damage ? <span>{t("Damage {n}", { n: obj.damage })}</span> : null}
          {obj.keywords.map((k) => (
            <span key={k}>{textIn(lang, KEYWORD_LABEL[k])}</span>
          ))}
          {obj.dull ? <span>{t("Dull")}</span> : null}
          {obj.frozen ? <span>{t("Frozen")}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
