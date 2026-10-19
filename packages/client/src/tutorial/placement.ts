/**
 * Placement of the guide's bubble: among a few candidate positions (around the target, edges of the screen), the one
 * that covers the least of what the player must see or click (cards, buttons, windows), and never the target.
 * Pure (tested by `client/test/placement.test.ts`).
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Obstacle {
  r: Rect;
  /** Importance: covering the target costs much more than covering any card. */
  weight: number;
}

/** Edges of the screen the bubble must stay out of (notch, status bar, home bar). */
export interface Inset {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const MARGIN = 12;

const overlap = (a: Rect, b: Rect): number =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

export function placeBubble(
  target: Rect | null,
  size: { w: number; h: number },
  viewport: { w: number; h: number; inset?: Inset },
  obstacles: Obstacle[],
  gap = 20,
): { left: number; top: number } {
  const { w, h } = size;
  const inset = viewport.inset ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const minX = inset.left + MARGIN;
  const minY = inset.top + MARGIN;
  const maxX = viewport.w - inset.right - w - MARGIN;
  const maxY = viewport.h - inset.bottom - h - MARGIN;
  const topY = inset.top + 70;
  const near: [number, number][] = target
    ? [
        [target.x + target.w / 2 - w / 2, target.y + target.h + gap], // below
        [target.x + target.w / 2 - w / 2, target.y - gap - h], // above
        [target.x + target.w + gap, target.y + target.h / 2 - h / 2], // right
        [target.x - gap - w, target.y + target.h / 2 - h / 2], // left
      ]
    : [[(viewport.w - w) / 2, viewport.h * 0.14]];
  const edges: [number, number][] = [
    [minX, topY],
    [maxX, topY],
    [minX, (viewport.h - h) / 2],
    [maxX, (viewport.h - h) / 2],
    [maxX, maxY],
    [(viewport.w - w) / 2, topY],
  ];
  const all = [...near, ...edges].map(([x, y]) => ({ x: clamp(x, minX, maxX), y: clamp(y, minY, maxY), w, h }));
  const weighted = target ? [...obstacles, { r: target, weight: 20 }] : obstacles;
  let best = all[0] as Rect;
  let bestScore = Number.POSITIVE_INFINITY;
  all.forEach((c, i) => {
    // With equal overlap, positions near the target come before the edges of the screen.
    const score = weighted.reduce((s, o) => s + o.weight * overlap(c, o.r), 0) + i * 400;
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  });
  return { left: best.x, top: best.y };
}
