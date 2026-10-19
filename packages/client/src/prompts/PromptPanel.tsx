/**
 * The frame of a question asked over the board (choice, targets, payment). On a phone it covers the field: a button
 * shrinks it to one line at the top of the screen (the question and its buttons), to see and click the cards under it.
 */
import { type ReactNode, useState } from "react";
import { useT } from "../localize";

export function PromptPanel({
  className,
  label,
  testId,
  tuto,
  children,
}: {
  className: string;
  label: string;
  testId?: string;
  tuto?: string;
  children: ReactNode;
}) {
  const [min, setMin] = useState(false);
  const t = useT();
  return (
    <div className={`${className}${min ? " min" : ""}`} role="dialog" aria-label={label} data-testid={testId} data-tuto={tuto}>
      <button
        type="button"
        className="btn ghost panel-min"
        onClick={() => setMin(!min)}
        aria-expanded={!min}
        title={min ? t("Show the whole panel") : t("Reduce the panel to see the board")}
      >
        {min ? "▾" : "▴"}
      </button>
      {children}
    </div>
  );
}
