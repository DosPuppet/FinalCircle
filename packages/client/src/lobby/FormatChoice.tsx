/** Choice of the format a deck is checked against (from Planecircle): Standard or L3 (`format.ts`). */
import { FORMAT_LABELS, FORMATS } from "@finalcircle/cards";
import { useT } from "../localize";
import { useGame } from "../store";
import { textIn } from "../translate";

export function FormatChoice() {
  const t = useT();
  const lang = useGame((s) => s.lang);
  const format = useGame((s) => s.format);
  const setFormat = useGame((s) => s.setFormat);
  return (
    <div className="format-choice">
      <div className="seg">
        {FORMATS.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={format === f}
            className={format === f ? "on" : ""}
            onClick={() => setFormat(f)}
          >
            {textIn(lang, FORMAT_LABELS[f])}
          </button>
        ))}
      </div>
      <span className="hint">
        {format === "standard"
          ? t("Every set, with the official banned and restricted cards.")
          : t("The latest three booster sets only.")}
      </span>
    </div>
  );
}
