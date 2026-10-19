/**
 * The glossary window: every keyword and game term with its definition, grouped, with a search. It opens from the home
 * screen, the tutorial menu, the deck builder and the game menu, or from a term's bubble (`Term`) at that term.
 */
import { useEffect, useRef, useState } from "react";
import { RichText } from "../board/CardText";
import { Dialog } from "../Dialog";
import { useT } from "../localize";
import { useGame } from "../store";
import { textIn } from "../translate";
import { GLOSSARY, GROUP_LABEL, type TermGroup } from "./terms";

const GROUPS: TermGroup[] = ["abilities", "actions", "resources", "cards"];

/** Lower case, without accents: a search typed without accents finds the accented words. */
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export function GlossaryButton({ className = "btn" }: { className?: string }) {
  const t = useT();
  return (
    <button type="button" className={className} onClick={() => useGame.setState({ glossary: {} })} data-testid="open-glossary">
      {t("Glossary")}
    </button>
  );
}

export function Glossary() {
  const glossary = useGame((s) => s.glossary);
  const lang = useGame((s) => s.lang);
  const t = useT();
  const [query, setQuery] = useState("");
  const list = useRef<HTMLDivElement>(null);
  const focus = glossary?.focus;
  // Opened from a term: that term is shown and marked.
  useEffect(() => {
    if (!focus) return;
    setQuery("");
    requestAnimationFrame(() => list.current?.querySelector(`[data-term="${focus}"]`)?.scrollIntoView({ block: "center" }));
  }, [focus]);
  if (!glossary) return null;
  const close = () => useGame.setState({ glossary: null });
  const q = fold(query.trim());
  const shown = GLOSSARY.filter(
    (term) =>
      !q || [textIn(lang, term.name), textIn("en", term.name), textIn(lang, term.definition)].some((s) => fold(s).includes(q)),
  );
  return (
    <Dialog title={t("Glossary")} className="glossary" onClose={close} testId="glossary">
      <input
        className="glossary-search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("Search a keyword…")}
        aria-label={t("Search a keyword…")}
      />
      <div className="glossary-list" ref={list}>
        {GROUPS.map((group) => {
          const terms = shown.filter((term) => term.group === group);
          if (!terms.length) return null;
          return (
            <section key={group}>
              <h3>{textIn(lang, GROUP_LABEL[group])}</h3>
              <dl>
                {terms.map((term) => {
                  const name = textIn(lang, term.name);
                  const english = textIn("en", term.name);
                  return (
                    <div key={term.id} className={`glossary-entry${term.id === focus ? " focus" : ""}`} data-term={term.id}>
                      <dt>
                        {term.symbol ? <RichText text={`《${term.symbol}》 `} /> : null}
                        {name}
                        {lang !== "en" && english !== name ? <span className="dim"> ({english})</span> : null}
                      </dt>
                      <dd>
                        <RichText text={textIn(lang, term.definition)} />
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </section>
          );
        })}
        {shown.length ? null : <p className="dim">{t("No keyword matches.")}</p>}
      </div>
      <div className="prompt-actions">
        <button type="button" className="btn primary" onClick={close}>
          {t("Close")}
        </button>
      </div>
    </Dialog>
  );
}
