# Backlog: everything still open

Each item cites its origin (plan, lot). What was done is told in `docs/history.md`; known approximations live in `docs/approximations.md`.

## Data

| Item | Why | Needed by | Status |
|---|---|---|---|
| Starter Set 2025 **Vol. 2 decklist** and **both LB deck lists** | Square Enix does not publish starter lists; Materia Hunter (product 230) is a JavaScript app that could not be read headless; the delerium22 Vol. 2 file was edited for tests | A3 (deck file), A6b (scripts) | main deck: reconstructed (source in the deck file); Vol. 2 LB deck: 4 of 8 cards known; open for the user to correct |
| French name and text of the 8 exclusives 27-122S…27-129S | missing from the official data; TCGCSV is English only (23-130H Luso is "Lusso" in French, 27-125S may be too) | A3 (`supplement.json`, `verified: false` until checked) | English checked against the card scans (2026-10-18: Cloud gives +3000, not +1000); French written by hand, to check against the French printings |
| French images of the 8 exclusives | the official CDN has none; TCGplayer's images are English | images | the French interface shows the English image with the French description under it; open: French scans (the user's own, `data/images/<size>/<code>_fr.jpg`) |
| Set 30 Memories of Life (2026-11-13) | enters L3, set 27 leaves | B0 | after release |
| French set names | not in the official data | A3 (`setRegistry.ts`) | open |
| L3 status of the 27-xxxS starter cards | not stated by the official format page | A3 (override list) | open |
| URLs of the official format and ban pages | for the weekly legality check | B4 | open |
| L3 and reprints | some booster sets reprint older card numbers (Dreamlike Oceans has 7- and 24- cards); `validateDeck` reads L3 by serial number (the official wording) | B0 | to confirm with the official format page |

## Interface

| Item | Why | Needed by | Status |
|---|---|---|---|
| Card names in the log | hovering a card named in the log would show its preview (Planecircle's log does) | A8 polish | open |
| Block preview with First Strike and effects | the preview compares powers only; First Strike, damage replacements and power changes on blocking are left out (labelled a preview) | after A10 | open |
| Opponent's cards flying from their hand | hidden cards have no shared `uid` with the field, so they appear without a move | polish | open |
| Image warm-up (`tools/warm-images.ts`) | the relay fetches one image every 1.1 s, so a card seen for the first time shows its text frame for a while; the 8 starter exclusives have no official image at all | A12 (possibly earlier) | open |
