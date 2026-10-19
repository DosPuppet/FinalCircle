# PLAN-B — FinalCircle Milestone 2: the L3 format

## Context

Milestone 1 (PLAN-A, closed on 2026-10-19) delivered the engine (Comprehensive Rules v3.3, rules 3), the 42 cards of the two Starter Set 2025 decks, a three-level AI, the game screen, the deck builder, the replay viewer, a ten-lesson tutorial, the online duel and the deployment files. Milestone 2 makes the **L3** format playable: the latest three booster sets by serial number, set by set, with prebuilt L3 decks (scope decided with the user on 2026-10-18, `CLAUDE.md` § Goal and scope).

L3 is sets 27–29 until 2026-11-12 and **28–30 from 2026-11-13** (`l3Sets(date)`, `packages/cards/src/decklist.ts`, already reads the window by date). Set 27 (Journey of Discovery, 121 cards) leaves L3 that day, so it is not in this plan; the starter cards it shares numbers with stay Standard-legal.

Everything below follows PLAN-A's conventions (`CLAUDE.md`): one commit per lot or sub-lot on `dev` once `verify` passes, `RULES_VERSION` and golden games on [rules] lots, every rule cited by its CR section, approximations in `docs/approximations.md`, no card-specific shortcut without a justification.

## The three sets (official card browser, dump of 2026-10-18)

| Set | Released | Cards | Abilities to script | What stands out (cards whose text has it) |
|---|---|---|---|---|
| 28 Dreamlike Oceans | 2026-03-27 | 124 new + 2 reprints (7-067L, 24-110L) | about 215 | Crystals (37), Damage N (10), cost changes (10), damage replacements (10), Monsters that become Forwards (6), 20 Mobius cards (Category MBM), one Warp |
| 29 Blissful Eternity | 2026-08-07 | 124 | about 229 | Priming (8), special abilities (13), Crystals (13), Monsters (12, 6 that become Forwards), counters (3), Chocobos (9), one Warp |
| 30 Memories of Life | 2026-11-13 | not in the official data yet | (about 220 if like the others) | to measure after its release |

For scale: Milestone 1 scripted 42 cards. Each set is three times that, and set 28 plus set 29 are already 248 cards. Counts from a regular-expression pass over the English texts (`fftext.ts` abilities, without reminders, Limit Break lines and keyword lines); B0 replaces them with `npm run coverage`.

Already in the engine from Milestone 1: Freeze, Back Attack, Haste, Brave, First Strike, Damage N, Limit Break, EX Burst, special abilities, damage replacements, Crystals in the state, in ability costs (`《C》`) and as an effect (`gainCrystals`), counters in the state. Missing: Warp (CR 15.2.7) and Priming (15.2.9), both already restated in `docs/rules.md`; Monsters that become Forwards; Crystal costs on casting and conditions on Crystals; named counters as effects and conditions; cost changes; "must attack / must block"; random choices; whatever B2 finds.

## Lots

| Lot | Size | Content | Done when |
|---|---|---|---|
| **B0** Foundation | M | Card groups `s28`, `s29` in `CARD_GROUPS` (`s30` in B2.30) and their import by set membership (the `set` field, so reprints such as 7-067L belong to set 28), scripts in `cards/src/s<set>/`, French ability labels in `cards/locales/fr/s<set>.json`. Debt guard copied from Planecircle (`cards/test/debt.test.ts`, `debtSurface.ts`, `data/debt-baseline.json`, `tools/debt-ceilings.ts`): no new flag, keyword, operation or field specific to one card without a justification, and the baseline only goes down. Coverage, audit and smoke tests per group; `verify --group s<set>` runs the group's own smoke test. Card data chunk: loaded per group if the budget requires it (36 KB for 42 cards today; about 400 KB expected for 414, under its 1.5 MB budget). The L3 window across the rotation tested on both dates. Deck builder: a set filter, with the L3 sets on top. `fr-glossary` on the new texts. | `verify --group s28` passes with 0 / 124 handled; the debt guard passes |
| **B1** L3 mechanics [rules] | L | The mechanics shared by the sets, each on synthetic test cards with its CR section: Crystals (costs on casting, "if you have N Crystals", counting), Warp (15.2.7: removed from play with X Warp counters, one removed at the start of each Main Phase 1, onto the field after the last), Priming (15.2.9: search the deck for the named Character and put it on top of the one paid for; the pair is one Character; the top card is removed when it leaves), Monsters that become Forwards (until end of turn, with power), named counters (6.7) as effects and conditions, cost changes (fixed when casting, 11.3.5), "must attack / must block" (offered and enforced in `legalActions`), random choices (seeded), abilities usable in the opponent's turn. Interface for each: payment tray (Crystals), warped cards and their counters on the board, counters on cards, primed pairs. Interpretations I24+ for what the CR leaves open. | strict fuzz `--offers` passes with the test cards; `RULES_VERSION` advanced, golden games regenerated only where they diverge |
| **B2.28** Dreamlike Oceans | L | Batches as in Planecircle's sets: **a** the cards the engine already handles, **b** the set's mechanics (Crystals), **c** and following the unique cards, up to 124 / 124 + the 2 reprints. `engine/test/s28*.test.ts` (each card's text checked), smoke file, `docs/sets/s28.md`, French labels. One commit per batch. | coverage 126 / 126, `coverage --audit` without a gap, strict fuzz on the set's cards |
| **B2.29** Blissful Eternity | L | Same batches: **b** Priming, Monsters, counters. | coverage 124 / 124, audit without a gap |
| **B2.30** Memories of Life | L | From its release (2026-11-13): `npm run import-cards -- all --fetch`, `s30` group, measure, then the same batches. The new set may come with a new Comprehensive Rules version: diff it against `docs/rules.md` first (`tools/rules-text.ts --fetch`). | coverage complete, audit without a gap |
| **B3** L3 prebuilt decks | M | 4 to 6 decks from L3 tournament lists of the 28–30 window (ffdecks; lists are facts, cited with their date in the deck file), French and English names, offered in the format choice and the deck builder. AI: evaluation of Crystals, Monsters, primed and warped cards (`docs/ai.md`), then a tournament per pair of decks (`npm run arena`, 600 games) to check none is out of reach. Golden games: two or more L3 games added (beginner and medium levels). | every deck validates in L3 on 2026-11-13; arena measures in `docs/ai.md`; golden games recorded |
| **B4** Legality check | S | `tools/check-legality.ts` (from Planecircle's design): the official format and ban pages and the official card browser's set list against `formats.json` and `setRegistry.ts` (a new ban, a new set, the L3 window); weekly CI job. Needs the URLs of the official pages (backlog). | the tool passes on the current lists and fails on a doctored copy |
| **B5** Close | S | `verify --full`, golden games frozen, `docs/history.md`, merge `dev` into `master`; the user deploys (`deploy/update.sh`, then `tools/warm-images.ts` for the new cards' images). | |

Order: B0 and B1 now; B2.28 and B2.29 before 2026-11-13 if possible; B2.30 from the release; B3 once players publish lists with set 30 (a few weeks after release; until then, decks built from sets 28–29 can stand in, marked as such); B4 at any point; B5 last.

## Risks and handling

- **Volume:** 372 new cards against 42 in Milestone 1. Batches of about 30 cards, one commit each; every mechanic generic first (B1, debt guard), a single-card shortcut only with a justification in the baseline.
- **Set 30 data:** absent from the official card browser until about its release; its French texts may come later than the English ones (the importer reports the cards whose French is missing or not aligned).
- **A new Comprehensive Rules version with set 30:** compared section by section with `docs/rules.md` before B2.30; a change of behavior is a [rules] lot.
- **French texts:** the official French markup is sometimes inconsistent (PLAN-A, data sources); `french-overrides.json` takes the corrections, `fr-glossary` keeps the interface's terms aligned with the cards'.
- **AI strength with new mechanics:** the evaluation knows nothing of Crystals, Monsters or Priming yet; B3 measures it by tournament, not by impression.
- **Images:** 372 cards × 2 sizes × 2 languages through the relay at most once every 1.1 s: warm the cache after each deployment (`tools/warm-images.ts`, about 40 minutes for the three sets).
- **Bundle size:** the card data chunk grows tenfold; loaded by group if it nears its budget (B0).

## Verification

- **Per batch:** `npm run verify -- --group s<set>` (tsc, Biome, coverage, bundle budget, vitest, fuzz with `--offers` and chaos, the group's smoke test; interface tests when the client, the view or the protocol changed, Vite running).
- **Per [rules] lot:** `RULES_VERSION` advanced, `npm run golden -- --update` regenerates only the games that diverge, the commit says which.
- **AI:** `npm run arena` (600 games) for B3 and for any change of the evaluation.
- **End of Milestone 2:** `npm run verify -- --full`.

## Tracking

| Lot | Status | Date | Notes |
|---|---|---|---|
| B0 | to do | | |
| B1 | to do | | |
| B2.28 | to do | | |
| B2.29 | to do | | |
| B2.30 | waiting for the release (2026-11-13) | | |
| B3 | to do | | |
| B4 | to do | | |
| B5 | to do | | |
