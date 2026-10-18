# History

Milestones and chronology of the project. The current plan is `docs/plans/PLAN-A.md`.

## 2026-10-18 — Project start (PLAN-A, A0)

- Research: Square Enix's official card browser (`get-cards`) gives every card with its French text and image file names; the Starter Set 2025 exclusives are missing from it (and from the image CDN) and come from TCGCSV; the Comprehensive Rules v3.3 (2026-08-07) are the reference; in FFTCG "Standard" does not rotate, L3 is the smallest rotating format.
- Decisions taken with the user: V1 with engine, AI, prebuilt decks, tutorial, deck builder and online duel; the starter decks first, then L3; images through a server relay with cache.
- A0: repository scaffold built on Planecircle's (workspaces, strict TypeScript, Biome, Vitest, verify, CI).
