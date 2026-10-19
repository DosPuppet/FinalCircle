# History

Milestones and chronology of the project. The finished plan is `docs/plans/PLAN-A.md` (each lot's detail is in its tracking table); the current plan is `docs/plans/PLAN-B.md`; what is still open is in `docs/backlog.md`.

Conventions used below: "rules N" is the value of `RULES_VERSION` (`engine/src/record.ts`) after a lot; a lot marked **[rules]** changes engine behavior and advances that version. "Golden games" are the fixed-seed games of `tools/golden.ts`, replayed by `ai/test/golden.test.ts`.

## 1. Milestones

| Milestone | State |
|---|---|
| **Milestone 1 (PLAN-A):** the two Starter Set 2025 decks under Standard rules, AI, tutorial, deck builder, online duel | done (2026-10-19), merged into `master` |
| Rules engine following the Comprehensive Rules v3.3 (turn, priority and stack, CP payment, attacks and parties, Damage Zone and EX Burst, rule processes, abilities, Limit Break, Damage N) | done: rules 3, interpretations I1–I23 (`docs/rules.md`), four general approximations (`docs/approximations.md`) |
| Card data from Square Enix's official card browser, French and English; the 8 starter exclusives from a supplement | done: 42 / 42 starter cards scripted and tested, audit without a gap |
| Prebuilt decks: Starter Set 2025 Vol. 1 (Fire/Water) and Vol. 2 (Earth/Lightning) | done; the Vol. 2 list and both LB lists are reconstructed and marked unofficial (`docs/backlog.md`) |
| AI at three levels (beginner, medium, expert: combat by simulation, ISMCTS) | done: expert 63.3 % ± 3.9 against medium, medium 87.8 % ± 2.6 against beginner (600 games each, `docs/ai.md`) |
| Game screen (board, payment tray, attacks, parties and blocks, EX Burst, animations, sounds, phones), deck builder with sharing, replay viewer | done |
| Tutorial: ten lessons on the starter cards | done |
| Online duel (authoritative server, rooms, AI seat, reconnection, rematch, saved games resumed after a restart) and the image relay | done |
| Deployment (pm2 behind nginx next to Planecircle, PWA) | files and tools done, checked locally; the VPS is installed by the user (`docs/deployment.md`) |
| **Milestone 2 (PLAN-B):** the L3 format, sets 28–30, L3 prebuilt decks | planned |

## 2. Chronology

- **2026-10-18 — research and decisions.** Square Enix's official card browser (`get-cards`) gives every card with its French text and image file names in one request; the Starter Set 2025 exclusives are missing from it (and from the image CDN) and come from TCGCSV; the Comprehensive Rules v3.3 (2026-08-07) are the reference; in FFTCG, "Standard" does not rotate and L3 is the smallest rotating format. Decisions taken with the user: V1 with engine, AI, prebuilt decks, tutorial, deck builder and online duel; the starter decks first, then L3; images through a server relay with a cache; one commit per verified lot on `dev` without asking, the user pushes.
- **2026-10-18 — A0 to A3.** Repository built on Planecircle's (workspaces, strict TypeScript, Biome, Vitest, `verify`, CI); the rules digest (`docs/rules.md`, by CR section, interpretations I1–I23, glossary); the engine model and the infrastructure copied from Planecircle (texts, events, records, fingerprints, game host); the card importer and the text parser (markup repaired, French aligned on the English abilities, kinds of abilities, keywords, costs), the set registry, deck legality (Standard bans, restricted cards, the Chaos group, L3 by date). The Vol. 2 list is reconstructed from the best source available (Vol. 2 LB deck: 4 of 8 cards known).
- **2026-10-18 — A4 to A7.** Engine core [rules 1] (turn, priority, stack, CP payment, attacks, parties, First Strike, Damage Zone, EX Burst queue, rule processes, End Phase loop, `legalActions`, the player's view); abilities [rules 2] (effect handlers, triggers, field abilities with the order of CR 11.12.4.6, damage replacements, targets "choose" and "select", Limit Break, Damage N); the 42 starter cards scripted, each tested against its text; the AI (evaluation, combat by simulation, ISMCTS with a determinization that never reads hidden cards), the fuzz (identical results whatever `--jobs`), 8 golden games, the arena and the bench (19,000 decisions/s).
- **2026-10-18 — A8 to A10.** The game screen in React with the engine in a Web Worker: the board, the payment tray, the prompts, attacks and parties chosen on the board, blocks with a preview, EX Burst reveals, card movements, sounds (Kenney samples and synthesized cues), phones; the interface smokes (`ui`, `lang`, `mobile`, `replay`). The deck builder (search in both languages, filters, main and LB tabs, validation, sharing by link and as text), the home screen, the replay viewer. The tutorial: ten lessons, from the screen and the goal to a real game against the beginner AI.
- **2026-10-18 — A11.** The online server from Planecircle's design, duel only: rooms with a timer and a rope, a return delay after a disconnection, rematch, an AI seat in worker threads, games saved decision by decision with fingerprints and resumed after a restart (a game of other rules resumes only if its fingerprints still match), the `/ffimg/` image relay (allow list, one request at a time at least 1.1 s apart, circuit breaker); online play in the client. At the user's request (A11c): the images of the 8 exclusives from TCGplayer, kept on the server only, French falling back to the English image, and a description under every card preview. The scans showed Cloud 27-124S gives +3000 power, not +1000 [rules 3; no golden game changed].
- **2026-10-19 — A12.** Deployment: the compiled server (`npm run build:server`), the pm2 app on 127.0.0.1:8788 next to Planecircle, the nginx site (`/ws`, `/ffimg/` cached 60 days), the update script with its backup and its check of saved games, the image warm-up and the end-to-end deploy check; the PWA (icon, manifest, service worker). Checked locally behind the nginx site in Docker; the nginx `Host` became `$http_host` (the origin check failed on a non-default port).
- **2026-10-19 — A13, end of Milestone 1.** `npm run verify -- --full` passes in 113 s: tsc, Biome, coverage (42 / 42), bundle budget, 230 tests, fuzz (three seeds of 300 games, mixed levels, AI levels, chaos; no draw, no unfinished game), bench, deploy check on the compiled server, the seven interface smokes (deck, ui, replay, mobile, online, tutorial, lang). The 8 golden games, recorded at rules 2, replay identically at rules 3: they are the frozen reference of Milestone 1. PLAN-B written (`docs/plans/PLAN-B.md`, sized on the official data: sets 28 and 29 have 124 new cards each). `dev` merged into `master`.

## 3. Milestone 1 in numbers (2026-10-19)

| | |
|---|---|
| Lots | A0 to A13, 19 commits on `dev` |
| Cards | 42 (34 from the official data, 8 from the supplement), 2 prebuilt decks, 59 ability labels in French |
| Rules | `RULES_VERSION` 3, interpretations I1–I23, 4 approximations, none card by card |
| Tests | 230 Vitest tests in 6.6 s; 8 golden games; fuzz of 300 games per seed in about 3 s |
| AI | about 18,000–19,000 engine decisions/s (bench); expert > medium > beginner by tournament |
| Client bundle | worker 81 KB, interface 213 KB, cards 36 KB, French catalogs 47 KB, libraries 337 KB |
| Interface | French by default and English, ten tutorial lessons, phones in portrait and landscape |
