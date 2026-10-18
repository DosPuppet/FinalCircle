/**
 * Interface language (from Planecircle): English is the source language of every text; French comes from the catalogs, keyed by
 * the English text (`engine/locales/fr.json`, `server/locales/fr.json`, `cards/locales/fr/*.json`, `client/locales/fr.json`). The same decoder
 * renders the engine's texts (`msg`, `cardRef`) and the interface's (`t`).
 *
 * Components read texts through `useT()` (`localize.ts`), which re-renders them when the language changes; `t()`
 * serves code outside components and reads the language set by the store (`setTextLang`).
 */
import { FRENCH_CATALOGS } from "@finalcircle/cards/locales";
import { msg, renderText, type TextArg } from "@finalcircle/engine";
import engineFr from "@finalcircle/engine/locales/fr.json";
import serverFr from "@finalcircle/server/locales/fr.json";
import clientFr from "../locales/fr.json";

export type Lang = "fr" | "en";

const FRENCH: Record<string, string> = Object.assign({}, engineFr, serverFr, ...Object.values(FRENCH_CATALOGS), clientFr);

let current: Lang = "fr";

/** Language of `t()` outside components; kept by the store in step with its `lang`. */
export function setTextLang(lang: Lang): void {
  current = lang;
  if (typeof document !== "undefined") document.documentElement.lang = lang;
}

export function textLang(): Lang {
  return current;
}

/** Translation of one message id, `undefined` when the language is English or the catalog has none. */
export function translateId(id: string, lang: Lang): string | undefined {
  return lang === "fr" ? FRENCH[id] : undefined;
}

/** Renders an engine or interface text in a language; `card` names the cards cited by `⟦defId⟧`. */
export function localize(text: string, lang: Lang, card: (defId: string) => string): string {
  return renderText(text, { translate: (id) => translateId(id, lang), card });
}

/**
 * An interface text in a language: `tr("fr", "{n} cards", { n })`. The template must be a string literal (the catalog
 * test finds message ids in the source by `t(` and `tr(`).
 */
export function tr(lang: Lang, template: string, args?: Record<string, TextArg>): string {
  return localize(msg(template, args), lang, (defId) => defId);
}

/** An interface text in the current language (code outside components; components use `useT()`). */
export function t(template: string, args?: Record<string, TextArg>): string {
  return tr(current, template, args);
}

/**
 * A text held in a variable (a `msg` literal of a table defined once, a text from the engine or the server) in a
 * language; card references keep their id (use `localizeText` or `useLocalize()` when cards must be named).
 */
export function textIn(lang: Lang, text: string): string {
  return localize(text, lang, (defId) => defId);
}
