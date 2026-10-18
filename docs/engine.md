# Engine guide

Read `docs/rules.md` (the Comprehensive Rules digest and its interpretations) first. The engine is Planecircle's design applied to FFTCG: a pure, deterministic engine on a JSON state, `submit(state, player, decision) → { state, events }`, an illegal decision is a `RulesError` and leaves the state unchanged (CR 14).

## Files of `packages/engine/src`

| File | What |
|---|---|
| `model/*.ts`, `types.ts` | Types: cards and abilities (`cards.ts`), filters, references, amounts, conditions (`rules.ts`), effects (`effects.ts`), state (`state.ts`), decisions, options and events (`decisions.ts`) |
| `game.ts` | `createGame` (first player, LB decks, mulligans), `submit`, `applyMutable`, the decision dispatcher, the loop watch (CR 13.1) |
| `turn.ts` | `advance`: phases (CR 9), the priority step (rule processes, EX Bursts, triggers, then priority; CR 11.1), the Attack Phase steps, the End Phase (9.5.1) |
| `attack.ts` | Attack candidates and parties, blocks, the Damage Resolution Step with First Strike and the party split (CR 10, 15.1.1.9, 15.2.3) |
| `stack.ts` | Casting Characters and Summons, CP payment, action and special abilities, resolving the stack (CR 11.3–11.7, 11.11) |
| `cp.ts` | CP costs, sources, payment check, suggested payment (CR 11.2); shared with the client and the AI |
| `damage.ts` | Damage to Forwards (replacements, shields) and to players (Damage Zone, EX Burst queue) (CR 6.5) |
| `exburst.ts` | EX Bursts: asked, targets chosen, applied off the stack (CR 11.10) |
| `rules.ts` | Rule processes (CR 12.4) and the end of the game (CR 3) |
| `triggers.ts` | Auto-abilities: detection at their event (`rulesEvent`), ordering, modes and targets, onto the stack (CR 11.8) |
| `effects.ts` | The resumable effect interpreter (Planecircle's): references, amounts, conditions; the `op` handlers are in `ops/` |
| `chars.ts` | Characteristics: printed, then ongoing effects, then field abilities (CR 11.12.4.6), cached by `version` (`bump`) |
| `targets.ts`, `filters.ts`, `conditions.ts` | "Choose" (CR 11.3.3) and its protections, card filters, conditions and counts |
| `zones.ts` | Objects and zone moves (a new object per move, CR 7.4; the Limit Break return, 15.2.8.4) |
| `legal.ts` | `legalActions`: the options of the pending decision, with a suggested payment |
| `view.ts` | A player's view, filtered events, the faces they know (CR 7.6) |
| `autopilot.ts`, `host.ts` | The autopilot and `GameHost` (AI, autopilot, human), from Planecircle |
| `record.ts`, `fingerprint.ts` | Records, replays, `RULES_VERSION` and its history, checkpoints |
| `scenario.ts` | Staged games (tests, tutorial) |
| `text.ts`, `choices.ts`, `errors.ts`, `events.ts`, `limits.ts`, `opRegistry.ts`, `state.ts` | Planecircle's infrastructure (player-facing text, generic choices, safety caps, the op registry, state primitives) |

## Rules of the code

- Every rule is cited by its CR section; an unclear rule follows an interpretation (I1…) of `docs/rules.md`, an approximation goes to `docs/approximations.md`.
- `legalActions` offers exactly what the engine accepts: `engine/test/offers.test.ts` plays random games and submits every option with its suggested payment and first targets.
- Anything that may change characteristics calls `bump(s)`; a new `GameState` field is initialized in `blankState` (`game.ts`) and the test state of `engine/test/state.test.ts`.
- A [rules] lot advances `RULES_VERSION` (`record.ts`) with a line of history.
