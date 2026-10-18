# Starter Set 2025 (group `starter25`)

The cards of the two Starter Set 2025 decks (`packages/cards/decks/starter-2025-vol{1,2}.json`): 42 card numbers, all scripted (`packages/cards/src/starter25/{vol1,vol2}.ts`), each with a rules test that checks its text (`packages/engine/test/starter25-vol{1,2}.test.ts`). Lot A6 of PLAN-A.

## Sources

- Official data (Square Enix's card browser) for 34 cards; the 8 starter exclusives 27-122S…27-129S are missing from it and come from `packages/cards/data/supplement.json` (TCGplayer data through TCGCSV, English corrected to the official wording; French written by hand, `verified: false`).
- Deck lists: unofficial (see each deck file's `source`); the Vol. 2 LB deck has 4 of its 8 cards (Noctis 23-125R, Maat 22-119R).

## Mechanics used

- Auto-abilities on entering, attacking, being chosen, dealing damage to a Forward or to the opponent, the beginning of the Attack Phase, a Forward entering your field, an opposing Forward put into the Break Zone; conditional auto-abilities (24-126H).
- Action abilities with 《ダル》, "put it into the Break Zone", from the hand (discard it), from the Break Zone (remove it), 《0》 with "your turn" and "once per turn"; the special ability Jecht Beam (18-129C).
- Field abilities: power (Damage 3, 20-106R), keywords (27-123S), damage replacements (13-125R, 27-122S, 27-128S), "cannot be chosen by cost-1 Summons", "cannot use action abilities" (27-128S), Lightning CP (9-074C), the Break Zone protected (27-126S); cast rules (21-001R pay with Fire CP only, 13-072R cost reduced).
- Effects: damage (to one, to all, scaled by a count), power and keywords until the end of the turn, protections gained (27-124S, 12-120C), dull, activate, break, put into the Break Zone, back to the hand, search (to the hand, onto the field), look at or reveal the top cards, play from the hand, draw, discard and read the discarded card (11-121C), select by the opponent (20-106R, 24-126H), "When you do so" (23-119R), modes (12-120C, 20-103H, 27-125S), a one-time shield (11-121C).
- Limit Break: 22-112R, 22-123R, 23-119R, 23-130H, 24-126H, 23-125R, 22-119R. EX Burst: 1-170C, 3-143C, 12-005C, 21-001R, 16-092C, 20-105C, 13-072R, 27-127S.

## Corrections

- 27-124S Cloud: "+3000 power and Brave", as printed (read on the card scan, 2026-10-18); the TCGplayer listing the English text came from said +1000 (`RULES_VERSION` 3). The seven other exclusives match their scans.

## Approximations

- 27-122S Wuk Lamat: "gains 'If a Forward you control deals damage to a Forward, the damage increases by 2000 instead'" is written as a field ability of Wuk Lamat with the same condition (no observable difference).
