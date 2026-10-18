# FinalCircle

A platform for playing the **Final Fantasy Trading Card Game** against an AI (three levels) and online against another player, in French or English. It is built on a **home-grown rules engine in TypeScript** that follows the Comprehensive Rules v3.3, and on the architecture of [Planecircle](https://github.com/DosPuppet/planecircle), the same author's Magic: The Gathering platform.

**Status: under construction.** Lot A0 of [PLAN-A](docs/plans/PLAN-A.md) is done (repository scaffold). Nothing is playable yet.

## Scope

- **Milestone 1:** the two **Starter Set 2025** decks (Vol. 1 Fire/Water, Vol. 2 Earth/Lightning, 50 cards and an 8-card Limit Break deck each), played under Standard rules; three-level AI, tutorial, deck builder, online duel.
- **Milestone 2:** the **L3** format (the latest three booster sets: Dreamlike Oceans, Blissful Eternity and Memories of Life from 13 November 2026), set by set, with prebuilt L3 decks.
- **Formats:** Standard (every set, official ban and restricted list) and L3, both limited to the cards the engine handles.

## Getting started

```bash
npm install
npm run verify -- --ci
```

## Commands

| Command | Purpose |
|---|---|
| `npm run verify -- --group <group>` | Check of a lot: types, Biome, tests (then, as they are written: coverage, bundle budget, fuzz, interface tests) |
| `npm run verify -- --full` | Full check, at the end of a series or before a merge |
| `npm run verify -- --ci` | Continuous-integration check (GitHub Actions, on every push) |
| `npm test` | Vitest |
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
