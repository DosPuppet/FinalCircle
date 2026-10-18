# CLAUDE.md — tracking and conventions for FinalCircle

This file tracks the project between sessions: current state, working rules, pitfalls. The README presents the project; the current plan is `docs/plans/PLAN-A.md`; the history is in `docs/history.md`; open items are in `docs/backlog.md`.

## Goal and scope

- **Final Fantasy Trading Card Game** (Square Enix) platform against the AI and online (duel, one game per match), home-grown rules engine in TypeScript following the **Comprehensive Rules v3.3** (2026-08-07), fluid Arena-style interface, bilingual French/English.
- **Built on Planecircle** (`/home/dospu/MTGX`, same author, MIT): architecture, conventions, tooling and the game-agnostic code are copied from there and adapted; the MTG rules are not. When a Planecircle file is copied, keep its design and adapt the names (`@finalcircle/*`, `finalcircle.*` storage keys, `FC_*` variables).
- **Scope:**
  - Milestone 1 (PLAN-A): the two **Starter Set 2025** decks (Vol. 1 Fire/Water, Vol. 2 Earth/Lightning; 50 main + 8 LB cards each) under Standard rules;
  - Milestone 2 (PLAN-B): **L3** (the latest three booster sets: 28–30 from 2026-11-13), set by set, with L3 prebuilt decks;
  - formats: "Standard" (all sets, official ban/restricted list) and "L3", both limited to the implemented cards.
- Out of scope: Limited (sealed, draft), Title format, more than two players, best-of-three.

## State (2026-10-18)

- PLAN-A lots **A0** (scaffold), **A1** (rules digest), **A2** (engine model and infrastructure), **A3** (card data and deck legality), **A4** (engine core), **A5** (abilities, rules 2), **A6** (the 42 starter cards scripted and tested), **A7** (AI levels, fuzz, golden games), **A8** (game screen: board, payment, prompts, attacks and blocks, EX Burst, animations, sounds, phones; interface smokes), **A9** (deck builder, sharing, home screen, replay viewer), **A10** (tutorial: ten lessons) and **A11** (online duel: server and client; A11c: images of the exclusives, card descriptions) done. Next: A12 (deployment).

## Documents

- `docs/plans/PLAN-A.md`: Milestone 1, lots A0 to A13; tracking at the end.
- `docs/rules.md`: digest of the Comprehensive Rules v3.3 by section, the interpretations taken where the rules are unclear (I1…), the English–French glossary. **Read before changing the engine.** Exact wording: `npx tsx tools/rules-text.ts [--fetch]` writes the PDF and its text to `data/cache/rules/` (outside Git).
- `docs/engine.md`: map of the engine files and the rules of its code. **Read before changing the engine.**
- `docs/approximations.md`: known approximations. **Every new approximation is added there**; every approximation lifted is removed from it.
- `docs/ai.md`: AI levels, evaluation, measures, the fuzz, golden, arena and bench tools.
- `docs/history.md`: milestones and chronology; `docs/backlog.md`: open items.

## Conventions

- **Language:**
  - code, comments, tests and documents in **English**; the user writes in French or English;
  - the interface is **bilingual, French by default**: one setting (`finalcircle.lang`) for the interface and the cards (name, text, image);
  - every player-facing text is English in the source: `msg("…", { args })` in the engine, the cards and the server, `t("…")` / `useT()` in the client, always with a string literal; never compare a displayed text in code;
  - its French goes into a catalog keyed by the English text (`engine/locales/fr.json`, `server/locales/fr.json`, `cards/locales/fr/<group>.json`, `client/locales/fr.json`); one English id = one French text everywhere (otherwise a `ctx:<word>|` prefix);
  - French keeps the **vouvoiement**; game terms follow the official French card texts (Avant, Soutien, Invocation, Monstre, Zone de dommages, Booster, Bravoure, Initiative, Attaque Arrière, Gelez…).
- **Engine:**
  - pure and deterministic (seed); effects = serializable data (DSL), never functions in the state;
  - an illegal decision throws a **`RulesError`**: the AI and the fuzz depend on it, an ordinary `Error` crashes a game;
  - any change that may alter characteristics calls `bump(s)`;
  - a new `GameState` field is initialized in `game.ts` and, if needed, in the test helpers;
  - every rule is cited by its CR section in a comment or test name; an unclear rule follows an interpretation of `docs/rules.md`.
- **Cards:**
  - data from Square Enix's official card browser (`tools/import-cards.ts`: one POST, raw dump in `data/cache/`, outside Git); only the implemented pool is written to `packages/cards/data/`;
  - a card's identity is its card number; reprint codes (`Re-174L/19-102L`) map to the oldest printing;
  - cards missing from the official data (Starter Set 2025 exclusives) are in `cards/data/supplement.json` with their source;
  - whatever can be read in the text (keywords, EX Burst, Limit Break, Damage N, Warp, Priming, costs) is deduced by the text parser, not written in scripts.
- **Card data commands:** `npm run import-cards -- <group>|all [--fetch]`; `npm run coverage -- [--group <g>] [--text] [--card <code>] [--audit]`; `npx tsx tools/fr-glossary.ts` (French terms vs the official texts).
- **Images:** never stored in the repository. Every URL goes through the server relay (`/ffimg/`), never straight to Square Enix's CDN (Cloudflare bans fast clients). Any tool that calls Square Enix's site or CDN (or another image host) is serial (at least 1.1 s between requests) and caches what it gets. Images the CDN lacks (the 8 starter exclusives) are kept on the server in `data/images` (`tools/missing-images.ts`, from TCGplayer; `imageSource` in the card data), served by the relay before the CDN; French falls back to the English image.
- **Online play:** the server is authoritative (it validates the deck and every decision); a player receives only their view (`projectView`), their filtered events and the faces they know; the handshake carries `{ protocol, rules }` versions.
- **Third-party code:** `github.com/delerium22/fftcg-game` has no license: read it for learning only, never copy its code (its deck lists are facts, cited as such).
- **Commits:** one commit per lot (or sub-lot) on `dev`, made at the end of the lot once `verify` passes, without asking (user decision, 2026-10-18); message in English, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; `master` for the stable version; the user pushes.
- **Unconfirmed card lists:** the Starter Set 2025 Vol. 2 list and both LB lists are reconstructed from the best available source and marked unofficial (source in the deck file); the user corrects them later.

## Checks before handing in a lot

- **Per lot:** `npm run verify -- --group <group>` (`tsc`, Biome, vitest; then, as their tools are written: coverage and bundle budget, fuzz from lot A7, interface tests from lot A8 when the client, `view.ts` or the protocol changed, Vite running).
- **At the end of a series or before a merge:** `npm run verify -- --full`. **CI** (`.github/workflows/ci.yml`): `verify --ci` on every push to `dev` or `master`; `verify --full --no-ui --no-bench` every night.
- **Result:** one line per step with its duration; detail only on failure; logs in `test-results/verify/`.
- **[rules] lot**: advance `RULES_VERSION` (`engine/src/record.ts`, history line); `npm run golden -- --update` regenerates only the golden games that diverge, and the commit says which; `ai/test/golden.test.ts` fails on a divergence at equal version.
- **Fuzz by hand:** `npm run fuzz -- --games 300 --pool starter25 --offers 4 --jobs 10` (identical results for the same seed, whatever `--jobs`); judge an AI change by tournament (`npm run arena`, 600 games).

## Known pitfalls (carried over from Planecircle)

- **Vite under WSL** may serve a stale version of an engine module: restart `npm run dev` before any browser test.
- **Vitest 5.0.1 and `/tmp`:** each run creates `/tmp/<nanoid>/ssr` (about 60 MB) without deleting it; the plugin in `vitest.config.ts` deletes it on close.
- **Biome:** `npx biome check . | tail -1` hides errors (grep "Found"); a `*/` in a JSDoc comment closes it.
- **`pgrep -f` / `pkill -f`** with a pattern present in the command line may kill the current shell.
- **Client heights** in `dvh`, never `100vh` (tablets and phones).
