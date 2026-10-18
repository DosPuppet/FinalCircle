/**
 * Modal dialog shared by the windows of the game and of the deck editor (from Planecircle): `aria-modal`, labelled by its
 * title, the focus taken on opening, kept inside while it is open (Tab cycles) and given back on closing.
 */
import { type ReactNode, useEffect, useId, useRef } from "react";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Dialog({
  title,
  children,
  className,
  backdropClassName,
  onClose,
  before,
  testId,
}: {
  title: ReactNode;
  children: ReactNode;
  /** Classes added to `modal` (wide, notice…). */
  className?: string;
  /** Classes added to `modal-backdrop` (full, soft). */
  backdropClassName?: string;
  /** Closing by Escape or a click outside the window; without it, the window waits for an answer. */
  onClose?: () => void;
  /** Shown above the title (the card that asks the question). */
  before?: ReactNode;
  testId?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // The window itself takes the focus (no control activated by mistake); Tab then goes through its controls.
    if (ref.current && !ref.current.contains(document.activeElement)) ref.current.focus({ preventScroll: true });
    return () => {
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  const onKeyDown = (e: React.KeyboardEvent) => {
    // A window that can be closed (graveyard, deck editor) keeps its keys: the game's shortcuts don't apply under it.
    if (onClose) e.stopPropagation();
    if (e.key === "Escape" && onClose) {
      onClose();
      return;
    }
    if (e.key !== "Tab") return;
    const items = [...(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) {
      e.preventDefault();
      return;
    }
    const at = document.activeElement;
    if (e.shiftKey && (at === first || at === ref.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && at === last) {
      e.preventDefault();
      first.focus();
    }
  };
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the backdrop's click closes the window, Escape does it from the keyboard
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape is handled by the window itself
    <div className={`modal-backdrop ${backdropClassName ?? ""}`} onClick={onClose}>
      <div
        ref={ref}
        className={`modal ${className ?? ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid={testId}
        onKeyDown={onKeyDown}
        onClick={(e) => e.stopPropagation()}
      >
        {before}
        <h2 id={titleId}>{title}</h2>
        {children}
      </div>
    </div>
  );
}
