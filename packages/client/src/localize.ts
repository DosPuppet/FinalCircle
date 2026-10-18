/** Texts in the interface language: engine texts (prompts, labels) with card names, and interface texts (`useT`). */
import type { GameView, TextArg } from "@finalcircle/engine";
import { useCallback, useMemo } from "react";
import { localizeText } from "./i18n";
import { useGame } from "./store";
import { tr } from "./translate";

export function useLocalize(): (text: string) => string {
  const faces = useGame((s) => s.faces);
  const lang = useGame((s) => s.lang);
  return useMemo(() => (text: string) => localizeText(text, faces, lang), [faces, lang]);
}

/**
 * `t` for components: an interface text in the current language, `t("{n} cards", { n })`; the component re-renders
 * when the language changes. The template must be a string literal (see `translate.ts`).
 */
export function useT(): (template: string, args?: Record<string, TextArg>) => string {
  const lang = useGame((s) => s.lang);
  return useCallback((template: string, args?: Record<string, TextArg>) => tr(lang, template, args), [lang]);
}

/** The view, with the pending question localized (prompt and labels); the same object as long as nothing changes. */
export function useLocalizedView(view: GameView): GameView {
  const loc = useLocalize();
  return useMemo(() => {
    const p = view.pending;
    if (p?.kind !== "choice" || !p.request) return view;
    const labels = p.request.labels
      ? Object.fromEntries(Object.entries(p.request.labels).map(([k, v]) => [k, loc(v)]))
      : undefined;
    return { ...view, pending: { ...p, request: { ...p.request, prompt: loc(p.request.prompt), labels } } };
  }, [view, loc]);
}
