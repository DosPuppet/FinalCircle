/**
 * Touch screens (tablet, phone; from Planecircle): no hover, so a card's preview goes through the long press,
 * and a card in hand rises on the first tap before being played on the second.
 */
import { type PointerEvent, useRef } from "react";

/** Touch primary pointer (no hover). A computer with a touch screen keeps the mouse behavior. */
export const isTouch = (): boolean =>
  typeof window !== "undefined" && window.matchMedia("(hover: none), (pointer: coarse)").matches;

/** Duration of the long press (ms) and movement tolerance (px) before it is cancelled (drag, scroll). */
const LONG_PRESS_MS = 450;
const MOVE_TOLERANCE = 10;

let lastLongPress = 0;
/** True just after a long press: the tap that ends it must not play the card. */
export const justLongPressed = (): boolean => Date.now() - lastLongPress < 700;

/**
 * Long-press handlers (finger only) to spread on the element: `onLong` is called after LONG_PRESS_MS
 * without movement. The click that follows is swallowed.
 */
export function useLongPress(onLong: (() => void) | undefined) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef({ x: 0, y: 0 });
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  if (!onLong) return {};
  return {
    onPointerDown(e: PointerEvent) {
      if (e.pointerType === "mouse") return;
      start.current = { x: e.clientX, y: e.clientY };
      clear();
      timer.current = setTimeout(() => {
        timer.current = null;
        lastLongPress = Date.now();
        onLong();
      }, LONG_PRESS_MS);
    },
    onPointerMove(e: PointerEvent) {
      if (timer.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > MOVE_TOLERANCE) clear();
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    onClickCapture(e: { stopPropagation(): void; preventDefault(): void }) {
      if (!justLongPressed()) return;
      e.stopPropagation();
      e.preventDefault();
    },
  };
}
