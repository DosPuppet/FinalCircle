/** The format decks are checked against, kept from one visit to the next (`finalcircle.format`). */
import type { Format } from "@finalcircle/cards";

const FORMAT_KEY = "finalcircle.format";

/** Storage can be unavailable (private browsing, preview): Standard then. */
export function loadFormat(): Format {
  try {
    return localStorage.getItem(FORMAT_KEY) === "l3" ? "l3" : "standard";
  } catch {
    return "standard";
  }
}

export function saveFormat(format: Format): void {
  try {
    localStorage.setItem(FORMAT_KEY, format);
  } catch {
    // setting not kept
  }
}
