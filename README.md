# FinalCircle

A platform for playing the **Final Fantasy Trading Card Game** against an AI (three levels) and online against another player, in French or English. It is built on a **home-grown rules engine in TypeScript** that follows the Comprehensive Rules v3.3, and on the architecture of [Planecircle](https://github.com/DosPuppet/planecircle), the same author's Magic: The Gathering platform.

**Status: under construction.** Lot A0 of [PLAN-A](docs/plans/PLAN-A.md) is done (repository scaffold). Nothing is playable yet.

## Scope

- **Milestone 1:** the two **Starter Set 2025** decks (Vol. 1 Fire/Water, Vol. 2 Earth/Lightning, 50 cards and an 8-card Limit Break deck each), played under Standard rules; three-level AI, tutorial, deck builder, online duel.
- **Milestone 2:** the **L3** format (the latest three booster sets: Dreamlike Oceans, Blissful Eternity and Memories of Life from 13 November 2026), set by set, with prebuilt L3 decks.
- **Formats:** Standard (every set, official ban and restricted list) and L3, both limited to the cards the engine handles.

**Deck rules** (Comprehensive Rules 8.1): exactly 50 cards in the main deck, an LB deck of 0 to 8 Limit Break cards, at most 3 copies of a card number.

**Standard ban and restricted list** (official list of 8 August 2025, `packages/cards/data/formats.json`):

- **Banned:** 1-089H, 3-131H, 5-034C, 5-040C, 5-067R, 11-072R, 11-124H, 12-038H, 12-097H, 13-120H, 14-116H, 14-118H, 16-043H, 16-051L, 20-125R.
- **Restricted to 1 copy:** 13-119L, 19-102L, 25-104L.
- **Chaos (23-117L):** a deck with it has at most 3 cards named Chaos or Feral Chaos in total.
- **L3:** the latest three booster sets by serial number (sets 27–29 until 12 November 2026, then 28–30); no banned card.

## Getting started

```bash
npm install
npm run verify -- --ci
```

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | The game in the browser on http://localhost:5174 (card images through the local relay, cached in `data/cache/images`) |
| `npx tsx tools/ui-smoke.ts [dir] [maxActions] [level] [lang]` | Plays a whole game against the AI in a browser (Vite running), screenshots in `test-results/ui` |
| `npx tsx tools/tutorial-smoke.ts [fr\|en]` | Follows every tutorial lesson in a browser (Vite running) |
| `npx tsx tools/{lang,mobile,replay}-smoke.ts` | Both languages, phones in portrait and landscape, a saved game resumed after a reload (Vite running; run by `verify` when the client changed) |
| `npx tsx tools/bundle-size.ts` | Builds the client and checks each chunk against its budget |
| `npm run server` | The online server on port 8788: WebSocket /ws, card images /ffimg/, the built client (`npm run build` first); games saved in `data/rooms` |
| `npx tsx tools/rooms-check.ts [dir]` / `node --expose-gc --import tsx tools/load-test.ts` | Saved online games against the repository's engine (before a deployment) / memory per room |
| `npm run verify -- --group <group>` | Check of a lot: types, Biome, tests (then, as they are written: coverage, bundle budget, fuzz, interface tests) |
| `npm run verify -- --full` | Full check, at the end of a series or before a merge |
| `npm run verify -- --ci` | Continuous-integration check (GitHub Actions, on every push) |
| `npm test` | Vitest |
| `npm run import-cards -- <group>\|all [--fetch]` | Card data from Square Enix's official card browser (one request, cached outside Git) into `packages/cards/data/<group>.json`; cards missing from it come from `packages/cards/data/supplement.json` |
| `npm run coverage -- [--group <group>] [--text] [--card <code>] [--audit]` | Cards handled per group, texts of the remaining cards, one card in detail, gaps between texts and scripts |
| `npx tsx tools/fr-glossary.ts` | Checks the English–French glossary of `docs/rules.md` against the official texts |
| `npx tsx tools/rules-text.ts [--fetch]` | Text of the Comprehensive Rules PDF, for lookups by section (outside Git) |
| `npm run typecheck` / `npm run lint` | Strict TypeScript / Biome |

## Architecture

```
packages/
  engine/   pure, deterministic rules engine: JSON state, decisions, Comprehensive Rules v3.3 (lots A2, A4, A5)
  cards/    official card data, card scripts, text parsing, prebuilt decks, deck legality (A3, A6)
  ai/       three-level AI (heuristic, combat by simulation, ISMCTS), random and scripted agents (A7)
  client/   React + Vite + Zustand; the game runs in a Web Worker; game screen, deck builder, tutorial (A8–A10)
  server/   online duel: authoritative engine, rooms, reconnection, image relay (A11)
tools/      import, checks, fuzz, interface tests
docs/       plan, rules digest, approximations, history, backlog
```

## Legal notice

The project's code is under the [MIT](LICENSE) license. It does not cover what belongs to Square Enix.

FinalCircle is an **unofficial, free and non-commercial fan project**. It is not affiliated with, endorsed or sponsored by Square Enix. FINAL FANTASY and FINAL FANTASY TRADING CARD GAME are trademarks of Square Enix. Card names, texts and images are © SQUARE ENIX.

- Card images are **never stored in the repository**. They stay hosted by Square Enix and reach players through the server relay, cached by nginx.
- The card texts in the repository are limited to the playable cards.
- The element icons are the project's own drawings, not official art.
- Any content will be removed at the request of the rights holder.
