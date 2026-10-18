/** Language of the interface and of the cards, the same setting everywhere it is shown. */
import { useT } from "./localize";
import { useGame } from "./store";

export function LangToggle() {
  const lang = useGame((s) => s.lang);
  const setLang = useGame((s) => s.setLang);
  const t = useT();
  return (
    <div className="seg lang-toggle" title={t("Language")}>
      <button type="button" aria-pressed={lang === "fr"} className={lang === "fr" ? "on" : ""} onClick={() => setLang("fr")}>
        FR
      </button>
      <button type="button" aria-pressed={lang === "en"} className={lang === "en" ? "on" : ""} onClick={() => setLang("en")}>
        EN
      </button>
    </div>
  );
}
