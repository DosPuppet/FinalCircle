# AI

Planecircle's AI design (`packages/ai`), with an FFTCG evaluation, policy and combat. Every agent is a function `(state, player) => Decision`; the engine refuses an illegal decision with a `RulesError` and the host plays the fallback decision instead.

## Levels (`levels.ts`)

| Level | How it decides |
|---|---|
| beginner | The heuristic with noise: a correct option at random 40 % of the time, nothing cast 20 % of the time, no responses in the opponent's turn, naive attacks and blocks, keeps any hand |
| medium | The heuristic (`heuristic.ts`): every option of `legalActions` (with a few variants of targets and modes) is tried on a copy, played on with the fast policy until the stack is empty and the AI decides again, and evaluated; attacks and blocks by simulation through the Damage Resolution Step (`combat.ts`) |
| expert | The medium AI, plus ISMCTS for its priority decisions (`ismcts.ts`): root-only search over the best options of the heuristic, determinized playouts until the start of its next turn; a time budget in the interface, iterations in tests and tournaments |

`fair: true` (interface and server): the AI decides on the state as its seat may know it (`forAgent`): the opponent's hand, main deck and face-down LB cards are redrawn from the cards seen of them. With nothing seen yet (the first turns), their cards are kept: the prebuilt decks are public lists (an approximation of hidden information; `docs/approximations.md`).

## Scripted opponent (`scripted.ts`)

The tutorial's opponent: it plays the actions of its script (cards by card number: a cast, an ability, in a phase or in response, an attack with one Forward or a party, a block), with the payment the engine suggests and the first legal targets unless the script names them; outside the script it passes, does not attack or block, and answers with the engine's suggestion.

## Evaluation (`evaluate.ts`)

Damage taken (growing weight up to the seventh, which loses), Forwards (power, Brave, First Strike, "cannot be broken", damage already on them), Backups (CP), Monsters, cards in hand, face-down LB cards, Crystals, a short main deck.

## Measures (2026-10-18, starter decks, 600 games, `npm run arena`)

| Pair | Win rate of the first |
|---|---|
| expert (100 iterations) vs medium | 63.3 % ± 3.9 |
| medium vs beginner | 87.8 % ± 2.6 |

`npm run bench`: about 19,000 engine decisions per second (random games); medium 0.1 ms, expert 14 ms per decision with a 150 ms budget (most decisions have one sensible option).

## Tools

- `npm run fuzz -- --games 300 --pool decks|starter25|all --ai random|mixed|levels|chaos --offers 4 --jobs 10`: invariants at every decision; identical results for the same seed whatever `--jobs`.
- `npm run golden [-- --update]`: the golden games (`packages/ai/test/golden/`).
- `npm run arena -- --a expert --b medium --games 600 [--budget 100] [--pool decks]`: tournament with a 95 % interval.
- `npm run bench`: engine and AI speed (compare before and after, on mains power).
