/**
 * A deck's art, as in Planecircle's deck tiles: a band of its cover card's illustration (`deckCover`), from the full
 * image through the relay (French printing, then English), cropped to the art. Without an image (images off, unknown
 * card, both printings missing), a band of the deck's element colors.
 */
import { type DeckList, findCard } from "@finalcircle/cards";
import { cardFace } from "@finalcircle/engine";
import { useState } from "react";
import { ELEMENT_COLOR } from "../board/ElementIcon";
import { imageUrls } from "../images";
import { useGame } from "../store";
import { deckCover } from "./store";

export function DeckArt({ deck }: { deck: DeckList }) {
  const lang = useGame((s) => s.lang);
  const cover = deckCover(deck);
  const def = cover ? findCard(cover) : undefined;
  const urls = def ? imageUrls(cardFace(def), lang, "full") : [];
  const [failed, setFailed] = useState(0);
  const url = urls[failed];
  const colors = deck.elements.map((e) => ELEMENT_COLOR[e]);
  const band = colors.length > 1 ? `linear-gradient(110deg, ${colors.join(", ")})` : colors[0];
  return (
    <span className="deck-art" style={{ background: band }} aria-hidden="true">
      {url ? (
        <img
          key={url}
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailed((n) => n + 1)}
        />
      ) : null}
    </span>
  );
}
