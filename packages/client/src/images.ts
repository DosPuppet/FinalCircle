/**
 * Card images: always through the relay (`/ffimg/…`, the game server in production, Vite in development), never
 * straight from Square Enix's CDN (Cloudflare bans fast clients; images are never stored in the repository). The
 * French printing first, then the English one, then the card drawn from its text (`TextFrame`).
 */
import type { CardFace } from "@finalcircle/engine";
import { fastMode } from "./fast";
import type { Lang } from "./translate";

export type ImageSize = "full" | "thumbs";

const KEY = "finalcircle.images";

/** Images can be switched off (slow network): cards are then drawn from their text. */
export function imagesOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setImagesOn(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    // storage unavailable: the setting lasts for the session only
  }
}

/** The image URLs to try for a face, in order (French then English in French; English only in English). */
export function imageUrls(face: CardFace | undefined, lang: Lang, size: ImageSize = "thumbs"): string[] {
  if (!face?.image || fastMode() || !imagesOn()) return [];
  const files = lang === "fr" ? [face.image.fr, face.image.en] : [face.image.en];
  return [...new Set(files.filter((f): f is string => !!f))].map((f) => `/ffimg/${size}/${f}`);
}
