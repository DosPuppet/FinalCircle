/**
 * FinalCircle icon (from Planecircle's tool): a ring of the eight element colors around a crystal, on the dark table —
 * the project's own drawing, no official logo. The SVG is drawn here (single source); the PNG sizes a PWA needs are
 * rendered by Chromium (Playwright). Writes packages/client/public/icons/.
 *
 * Usage: npx tsx tools/make-icons.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const OUT = "packages/client/public/icons";
mkdirSync(OUT, { recursive: true });

/** The eight elements, clockwise from the top: Fire, Ice, Wind, Earth, Lightning, Water, Light, Dark. */
const ELEMENTS = ["#d8452f", "#3cb7d8", "#3fa45a", "#c79a1e", "#8b55c9", "#2f6fd8", "#f1ecd8", "#5a4a78"];

/** Point on a circle of radius r around (256, 256), angle in degrees from the top, clockwise. */
const at = (r: number, deg: number) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return `${(256 + r * Math.cos(a)).toFixed(2)} ${(256 + r * Math.sin(a)).toFixed(2)}`;
};

/**
 * `maskable`: full-bleed square, everything inside the safe circle (80% of the icon); otherwise a rounded square with a
 * little more room for the ring.
 */
function svg(maskable: boolean): string {
  const scale = maskable ? 0.8 : 1;
  const r = 160;
  const step = 360 / ELEMENTS.length;
  const gap = 8;
  const arcs = ELEMENTS.map((c, i) => {
    const from = i * step + gap / 2 - step / 2;
    return `<path d="M ${at(r, from)} A ${r} ${r} 0 0 1 ${at(r, from + step - gap)}" stroke="${c}"/>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
<defs>
  <radialGradient id="bg" cx="50%" cy="46%" r="70%">
    <stop offset="0" stop-color="#1f2c4a"/><stop offset="0.55" stop-color="#101829"/><stop offset="1" stop-color="#05070d"/>
  </radialGradient>
  <radialGradient id="glow" cx="50%" cy="50%" r="50%">
    <stop offset="0" stop-color="#bfe6ff" stop-opacity="0.7"/><stop offset="0.4" stop-color="#6cc3ff" stop-opacity="0.25"/>
    <stop offset="1" stop-color="#6cc3ff" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="crystal" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#f4fbff"/><stop offset="0.45" stop-color="#9fd8ff"/><stop offset="1" stop-color="#3a7fd0"/>
  </linearGradient>
  <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="7"/></filter>
</defs>
${maskable ? `<rect width="512" height="512" fill="url(#bg)"/>` : `<rect x="8" y="8" width="496" height="496" rx="112" fill="url(#bg)"/>`}
<g transform="translate(256 256) scale(${scale}) translate(-256 -256)">
  <circle cx="256" cy="256" r="${r}" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="56"/>
  <g fill="none" stroke-width="28" stroke-linecap="round" filter="url(#soft)" opacity="0.5">${arcs}</g>
  <g fill="none" stroke-width="24" stroke-linecap="round">${arcs}</g>
  <circle cx="256" cy="256" r="120" fill="url(#glow)"/>
  <path d="M256 140 L318 236 L256 372 L194 236 Z" fill="url(#crystal)"/>
  <path d="M256 140 L318 236 L256 252 Z" fill="#ffffff" opacity="0.45"/>
  <path d="M194 236 L256 252 L256 372 Z" fill="#0d2d5a" opacity="0.35"/>
</g>
</svg>`;
}

const plain = svg(false);
const maskable = svg(true);
writeFileSync(`${OUT}/icon.svg`, `${plain}\n`);
writeFileSync(`${OUT}/icon-maskable.svg`, `${maskable}\n`);

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size, source] of [
  ["favicon-32.png", 32, plain],
  ["apple-touch-icon.png", 180, maskable],
  ["icon-192.png", 192, plain],
  ["icon-512.png", 512, plain],
  ["icon-maskable-512.png", 512, maskable],
] as const) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}</style>${source.replace('width="512" height="512"', `width="${size}" height="${size}"`)}`,
  );
  writeFileSync(`${OUT}/${name}`, await page.locator("svg").screenshot({ omitBackground: true }));
}
await browser.close();
console.log(`Icons written to ${OUT}`);
