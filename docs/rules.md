# Rules digest: FFTCG Comprehensive Rules v3.3

The engine follows the **Final Fantasy TCG Comprehensive Rules, version 3.3**, effective 7 August 2026 (© SQUARE ENIX). This document restates them in our own words, section by section, with what the engine does with each. Where the text is unclear, the reading we take is in § Interpretations (I1…): one reading, one code path, a test.

- Source: `https://fftcg.cdn.sewest.net/2026-08/fftcg-comprules-v3.3.pdf`. Local copy and text, outside Git: `npx tsx tools/rules-text.ts --fetch` writes `data/cache/rules/fftcg-comprules-v3.3.{pdf,txt}` (grep a section number there for the exact wording).
- Sections updated in v3.3: 5.2.1.3.1, 10.1.2.3, 10.1.3.1.3, **11.2 (whole section)**, 11.3.7.1, 11.4.6.1, 11.4.7 (old 11.4.8 removed), 11.6.2.1, 11.7.2.1, 15.2.8.4.1, 15.2.9.3.1.
- No French version of the CR exists; French game terms come from the official French card texts (§ Glossary).
- Cite rules in code and tests as `CR 10.1.4.2.1`.

## 1–4. Game, general rules, end of the game, numbers

- **1.1** Two players. **2.1** Card text beats the rules; conceding is always possible. **2.2** A prohibition beats a permission. **2.3** The impossible part of a text is ignored.
- **3.1** A player loses with **7 or more damage** (6 in Limited; Limited is out of scope), when they must draw from an empty deck (3.1.2), or when they take damage with an empty deck (3.1.3). **3.2** Defeat beats victory. **3.3** Both defeated at once: draw.
- **4.1–4.2** Integers only; fractions round up. **4.3** A negative value (power) counts as 0, except as the starting point of a further change. **4.4** An undefined value is 0. **4.5** X, Y, Z: chosen by the card's controller unless the text defines them; never negative (4.1).
- Engine: `rules.ts` (losses through rule processes, 12.4), `winner: PlayerId | "draw"`; numbers in `chars.ts` (stored power may go negative, read as `max(0, p)`).

## 5. Cards

- **5.2.1.1 Elements:** Fire (red), Ice (cyan), Wind (green), Lightning (purple), Water (blue), Earth (yellow), Light (white), Dark (black). A rainbow crystal = Multi-Element (all the elements shown). A single-element Character given more elements by an effect becomes Multi-Element.
- **5.2.1.2** Using a card costs CP; at least one CP of the card's element. **5.2.1.3** Discarding a card makes **2 CP** of its element (a Multi-Element card declares one of its elements); dulling a **Backup** makes **1 CP** of its element; **Light and Dark cards cannot be discarded for CP.** Payment details: § 11.2.
- **5.2.2.1 Names:** without the **generic** icon, only one Character of that name on your field (7.7.3); with it, any number. The **EX** icon marks an EX Burst. **5.2.2.2** A card belongs to every category it shows.
- **5.2.3 Types:** Characters = Forward, Backup, Monster (deployed to the field); Summons (one-shot, never on the field). Forwards attack and block. Backups dull for 1 CP and **enter the field dull** as a rule. Characters almost always have jobs.
- **5.2.4.1** A card's own name in its text means that card. **5.2.5.1** "The same card" = the same **card number**; up to **3 copies** per card number in a deck. **5.2.6.1** Only Forwards have **power**; damage ≥ power puts a Forward into the Break Zone (by rule process, 12.4.5).
- Engine: `CardDef` (`model/cards.ts`): `id` (card number, identity), `elements`, `type`, `cost`, `power`, `jobs`, `categories`, `generic`, `exBurst`, `lb`.

## 6. Terms

- **6.1.3** Turn player / non-turn player. **6.1.4** Simultaneous actions: the turn player decides first, then the other; both are carried out together (also 11.11.6).
- **6.2** Owner = the player whose deck the card started in. A card put onto the field by an effect goes under its **owner's** control unless stated (6.2.4). **6.2.6** Control changes: not an entry (no enter triggers, 6.2.6.1), allowed even against the name or Light/Dark limit, which the rule processes then settle (6.2.6.2).
- **6.3** Active (upright) / Dull (sideways). **6.4.1** The source of an ability is its card; delayed abilities: 6.4.1.1–3 and 11.8.17. **6.4.2** An ability on the stack is independent of its source; information needed when it is put on the stack is read then, otherwise on resolution; a source that left its zone is read as it last was (last known information).
- **6.5 Damage to a player:** for each point, the top card of the main deck goes to the Damage Zone, one by one (6.5.2, 6.5.3). **EX Bursts** revealed this way are resolved **after all the damage**, in the order the cards arrived (6.5.2.1).
- **6.6** Types = card types and job types; only Characters have jobs. **6.7** Counters: by name; lost when the card changes zone (6.7.3). **6.8 Crystals:** a player resource made by abilities and Summons (the 《C》 symbol).
- Engine: `damage.ts` (`dealPlayerDamage`, EX Burst queue), `lki` snapshots, `PlayerState.crystals`.

## 7. Zones

- **7.1** Eight zones: field, Damage Zone, main deck, LB deck, Break Zone, hand, stack, removed from play. One field and one stack, shared; the others per player. **7.3** A card always goes to its **owner's** deck, Break Zone, hand or removed zone. **7.4** A card that changes zone is a new card (new object id; `uid` follows the physical card).
- **7.6** Hidden zones: main deck and hand (even if revealed). Public: field, Damage Zone, Break Zone, stack, removed from play, LB deck (face-down cards excepted).
- **7.7 Field:** public. **7.7.3** One Character per non-generic name per player; an effect that would put several of the same name (or too many Light/Dark) onto the field puts all of them into the Break Zone; an action that would *simultaneously* exceed a limit is forbidden. **7.7.3.1** A non-generic card may join a generic card of the same name. **7.7.4** At most **5 Backups**: casting a sixth is forbidden; if six or more arrive anyway, the controller puts the extras into the Break Zone (12.4.8). **7.7.5** At most **one Light or Dark Character** on your field; an action that exceeds it is forbidden; if it happens anyway, all of them go (12.4.7).
- **7.8 Damage Zone:** one card per point of damage; 7 cards loses; public, order fixed. **7.9 Main deck:** hidden, order fixed; "deck" on a card = main deck. **7.10 Break Zone:** public (broken cards, discarded cards, resolved Summons). **7.11 Hand:** hidden; its owner sees it. **7.12 Stack:** public; last in, first out. **7.13 Removed from play:** public; a card removed face down has no characteristics (7.13.3). **7.14 LB deck:** public, but face-down cards are seen by their owner only.
- Engine: `PlayerState { deck, hand, breakZone, damage, removed, lb }`, `GameState.field`, `GameState.stack`; limits checked in `legal.ts` (forbidden actions) and `rules.ts` (rule processes); hidden zones in `view.ts`.

## 8. Setting up the game

- **8.1.1.1** Main deck **exactly 50** cards (constructed); LB deck **0 to 8** cards. **8.1.1.2** At most 3 per card number. **8.1.2** A field ability about deck construction overrides these. **8.1.3** The LB deck holds only Limit Break cards; the main deck holds none.
- **8.2.1.1** Shuffle the main decks; LB decks face down, unshuffled. **8.2.1.2** A randomly chosen player **chooses** whether to play first. **8.2.1.3** Each player draws 5. **8.2.1.4** The first player may put the 5 cards on the bottom of their deck **in any order** and draw 5 new ones, **once**; then the second player may do the same. **8.2.1.5** The first player starts and draws **1 card** in their first Draw Phase.
- Engine: `decklist.ts` (`validateDeck`), `game.ts` (`createGame`: random chooser, `firstPlayer` choice, mulligans in order).

## 9. Phases

- **9.1 Active Phase:** the turn player activates all their dull cards (special action, no stack); except frozen ones (15.2.4). No priority; triggers wait for the next priority.
- **9.2 Draw Phase:** the turn player draws 2 (special action; 1 on the first player's first turn, 9.2.1.3). No priority.
- **9.3 Main Phase:** Main Phase 1 before the Attack Phase, Main Phase 2 after; any extra Main Phase counts as Main Phase 2 (9.3.1.1). "Beginning of the Main Phase" triggers go on the stack, then the turn player gets priority (9.3.1.3–4). The phase ends when the stack is empty and both players pass (9.3.1.2).
  - **9.3.1.5** The turn player, with priority and an empty stack, may cast Characters (special action, no stack).
  - **9.3.1.6–7** Either player with priority may cast Summons and use action and special abilities, in **Main and Attack Phases only**.
- **9.4 Attack Phase:** § 10.
- **9.5 End Phase:**
  - **9.5.1.1** "Beginning of the End Phase" and "end of the turn" triggers go on the stack; the turn player gets priority; no Summons or abilities in this phase.
  - **9.5.1.2** The turn player discards down to the hand size (usually **5**; special action).
  - **9.5.1.3** Simultaneously: all damage on Characters is removed, and "until the end of the turn" effects stop.
  - **9.5.1.4** Rule processes and new triggers are handled, the turn player gets priority; after both pass, back to 9.5.1.3.
  - **9.5.1.5** When nothing is left to do, the other player's turn begins.
- Engine: `turn.ts` (`advance` loop over `turn.phase`), `endPhase` loop (I8).

## 10. Attack Phase

1. **10.1.1 Preparation:** "beginning of the Attack Phase" triggers; the turn player gets priority; Summons and abilities allowed.
2. **10.1.2 Declaration:** the turn player declares **one Forward**, or **a party** (several Forwards sharing an element), or no attack.
   - Eligible Forwards (10.1.2.1): **active**; controlled **since the start of the turn** or with **Haste**; able to attack (not yet attacked this turn, no prohibition). Forwards that must attack keep the phase open until they have attacked (10.1.2.1.3).
   - Attackers are **dulled**, except those with **Brave** (10.1.2.2). An attack cost is locked when declared (10.1.2.3).
   - Attack triggers, then priority (10.1.2.5–6). No attack declared: skip Block and Damage (10.1.2.7) and go to Main Phase 2.
3. **10.1.3 Block:** the non-turn player may block with **one active Forward** of theirs, or not block.
   - Prohibitions on blockers apply (10.1.3.1.2); a forced block must be honored if possible; a block cost is locked (10.1.3.1.3).
   - Attacker(s) and blocker are **in battle**; a Forward that leaves the battle neither deals nor receives battle damage (10.1.3.2.1, 10.1.3.3).
   - A party is blocked as if it were one Character (10.1.3.4). Block triggers, then priority (10.1.3.5–6).
4. **10.1.4 Damage:**
   - **Unblocked:** the attack deals **1 point of damage** to the opponent (10.1.4.1).
   - **Blocked:** attacker(s) and blocker deal damage equal to their power to each other (**battle damage**, 10.1.4.2). Against a party, the blocker's controller splits its damage among one or more party members in amounts of at least 1000, in multiples of 1000 (10.1.4.2.1).
   - First Strike: § 15.2.3. Damage triggers, then priority (10.1.4.3–4). The party disbands (10.1.4.5).
   - Another attack: back to Declaration; otherwise Main Phase 2 (10.1.4.6).
- Blocking does not dull the blocker (I12).
- Engine: `attack.ts` (`AttackState`, steps, party, damage split), decisions `attack`, `endAttacks`, `block`; the split is a `divide` choice (step 1000).

## 11. Casting cards and using abilities

### 11.1 Priority

- **11.1.1** The player with priority may cast a card or use an ability. **11.1.2** The turn player gets priority once the triggers of the start of a phase or step are on the stack.
- **11.1.3–4** Before anyone gets priority: all rule processes, simultaneously and repeatedly until none are left; then all triggered auto-abilities go on the stack (11.8.7); repeat until stable. Then the player may cast, use an ability, take a special action or pass.
- **11.1.5** After a Summon or ability resolves, the **turn player** gets priority. **11.1.6** A pass gives priority to the opponent. **11.1.7** Two passes in a row: the top of the stack resolves, or, with an empty stack, the phase or step ends.
- After casting a Summon or using an ability, its player keeps priority (11.3.8, 11.6.11, 11.7.11); after casting a Character, the **turn player** gets priority (11.4.7).
- Engine: `priority: { holder, passes }` as in Planecircle; `passPriority` in `turn.ts`.

### 11.2 Paying CP (rewritten in v3.3)

- **11.2.2** The base cost (top-left number) must include **at least 1 CP of the card's element**; Light and Dark cards are paid with any elements.
- **11.2.2.1** A Multi-Element card needs at least 1 CP of **each** of its elements, so it always costs at least as many CP as it has elements; a cost reduced to 0 is not paid.
- **11.2.2.2** CP sources: **discard** a hand card (2 CP of its element; Multi-Element: one declared element; never Light/Dark cards), **dull** one of your **Backups** (1 CP of its element).
- **11.2.2.3** You may generate as much CP as you like, then choose which CP pays; you cannot pay more than the cost; **unused CP vanishes** (11.2.2.3.1).
- **11.2.2.4** A cost without CP ("Discard 1 card:") cannot be paid with CP.
- 11.2.1.1 still carries the pre-3.3 wording ("the exact amount, one excess CP per element from discards"); see I1, I2.
- Engine: `cp.ts` (`cpSources`, `checkPayment`, `suggestPayment`); a payment is part of the decision (`Payment { discard, dull, crystals }`), there is no CP pool in the state and no "tap for mana" decision.

### 11.3 Casting a Summon

- **11.3.1** From the hand or the LB deck to the stack, paying its cost; a casting that cannot be completed is rewound (14).
- **11.3.2** The card is revealed and put on top of the stack; its caster controls it.
- **11.3.3** "**Choose**" needs a legal target to cast; "**select**" is not choosing; a Summon cannot choose itself.
- **11.3.4** Modes are declared now; a variable number of modes is fixed now (11.3.4.1). **11.3.5** Costs that read other cards are fixed now; additional or alternative costs and X are declared now. **11.3.6** Effects that differ per card or player: assigned now; each assigned value at least 1.
- **11.3.7** The cost is locked and paid all at once (11.3.7.1).
- **11.3.8** "When cast" triggers happen now; the caster gets priority back.
- **11.3.9** If every chosen target is illegal on resolution, the Summon does nothing (also 11.11.2).
- **11.3.10** Setting a Forward's power to N sets its **base** power; other changes apply on top.
- **11.3.11** A Summon cast by an effect is cast right after that effect resolves.

### 11.4 Casting a Character

- **11.4.1** The player with priority, in the Main Phase, with an empty stack (in practice the turn player, 9.3.1.5), casts a Character from the hand or the LB deck: a **special action**, no stack, **no response possible**. **11.4.1.1** Cast by an effect: right after that effect, also without the stack.
- **11.4.2–6** Declared and revealed; modes, cost information, additional or alternative costs, X and per-target assignments are declared; the cost is locked and paid per § 11.2.
- **11.4.7** The Character is on the field; its enter triggers go on the stack; the **turn player** gets priority.
- Exception: **Back Attack** (15.2.5).

### 11.5 Abilities

- **11.5.2** Four kinds: **field**, **auto**, **action**, **special**. **11.5.3** Each paragraph of text is one ability.
- **11.5.4** An ability on the stack stays there and resolves even if its card leaves. **11.5.5** Information about a card that moved is read as it was before it moved.
- **11.5.6** Setting power to N sets base power (as 11.3.10).

### 11.6 Action abilities, 11.7 Special abilities

- Format "**cost: effect**" (11.6.2, 11.7.2); costs paid per § 11.2 (11.6.2.1, 11.7.2.1).
- **《ダル》 (Dull) in the cost** (11.6.2.2, 11.7.2.2): a Forward or Backup must have been under your control **since the start of your turn**, unless it has **Haste**; **Monsters** are exempt (unless they became Forwards).
- Costs that dull or break a Character use your own Characters (11.6.2.3); a cost that removes or returns a Character cannot use one that could not otherwise be removed or returned (11.6.2.4).
- **11.6.3–4** The ability goes on the stack with only its own text; a card in a hidden zone is revealed; its user controls it. A cost that reveals a hidden card needs that card to be there.
- **11.6.5** "Choose" needs a legal target; an ability cannot choose itself. **11.6.6–8** Modes, cost information, X and assignments declared at activation. **11.6.9–10** Cost locked, paid all at once. **11.6.11** Activation triggers go on the stack (not delayed ones); the user keeps priority. **11.6.12** All chosen targets illegal on resolution: nothing happens.
- **11.7.1 Special abilities:** like action abilities, plus **discarding a card with the same name** from your hand; they have a proper name and the **《S》** icon. Text form: `[[s]]Name[[/]] 《S》《ダル》: effect`.
- Abilities that work from a zone other than the field (hand, Break Zone) say so in their text; their card is revealed (11.6.4).

### 11.8 Auto-abilities

- **11.8.1–2** They trigger on an event: "When…", "Whenever…", "At the beginning of…", "At the end of…". **11.8.3** They trigger even in phases where nothing can be cast.
- **11.8.4** An auto-ability that chooses still triggers with no legal target, and is removed from the stack at once (no response) (I16).
- **11.8.5** Controlled by the controller of its source. **11.8.6** Once per event (an event made of several occurrences triggers that many times).
- **11.8.7 Ordering:** they do nothing until a player would get priority; then rule processes and triggers are settled repeatedly; the **turn player** puts all of theirs on the stack in the order they choose, then the **non-turn player** (so the non-turn player's resolve first).
- **11.8.8–12** Cost information locked when put on the stack; "choose" needs a legal target (11.8.9); modes declared then, a variable number fixed then (11.8.10.1); no selectable mode: it does not trigger (11.8.10.2); X and assignments declared then.
- **11.8.13 Conditional auto-abilities** ("When X, if Y, do Z"): Y is checked when it would trigger (no trigger otherwise) and again on resolution (nothing otherwise, 11.11.3).
- **11.8.14** "You may": decided on resolution. **11.8.15** A replaced event triggers nothing.
- **11.8.16 Zone-movement triggers:** the ability fails if the card did not really arrive (11.8.16.1). Enter triggers fire right after the cards arrive, and every card on the field, including those just arrived, checks its trigger (11.8.16.2.1).
- **11.8.17 Delayed auto-abilities:** created by resolving effects (or replacements); trigger once unless they have a duration; follow their card until it leaves its zone; source and controller: 11.8.17.4–6.
- **11.8.18 State triggers:** trigger when a state holds; do not trigger again until resolved; may trigger again afterwards if the state still holds.
- **11.8.19** All chosen targets illegal on resolution: nothing happens.
- Engine: `triggers.ts` (detection at the event with last known information, ordering choice per player, conditions twice, delayed, state triggers).

### 11.9 Field abilities

- **11.9.1** Ongoing effects while the card is on the field (or in the zone its text names). **11.9.2** A characteristic change applies from the moment the card arrives. **11.9.3** No stack.
- Engine: `chars.ts` (characteristics computed from field abilities and ongoing effects, cached by `version`).

### 11.10 EX Burst

- **11.10.1** The effect carries the card's information (element, cost, job, category…). **11.10.2** When a card with the EX icon is put into the Damage Zone by damage, its owner **may** apply its effect at once; optional; **no response**.
- **11.10.3** A Summon applies all its effects; a Character applies only its auto-abilities marked EX BURST.
- Timing: after all the damage of that damage resolution, in order of arrival (6.5.2.1); Damage N gating (15.2.6.3).
- Engine: `exBursts` queue, resolved off the stack; a yes/no choice for the damaged player (I23 for targets).

### 11.11 Resolution

- **11.11.1** Two passes: the top of the stack resolves. **11.11.2** All its chosen targets illegal: cancelled; at least one legal: it applies to the legal ones (11.11.2.1). **11.11.3** Conditional auto-abilities rechecked.
- **11.11.4, 11.11.7** A source or referenced card that moved is read as it was. **11.11.5** Effects follow the text, modified by replacements; a later sentence may modify an earlier one. **11.11.5.1** Choices not declared earlier are made on resolution by the player the text names, with legal targets.
- **11.11.6** Simultaneous choices: the turn player chooses and acts first, then the other, then everything happens together.
- **11.11.8** An action ordered by an ability is done by the ability's source card. **11.11.9** A variable declared on resolution is fixed. **11.11.10** A resolved Summon goes to its owner's Break Zone; an ability ceases to exist.
- Engine: resumable `Resolution` interpreter (Planecircle), `targets.ts` (legality on resolution).

### 11.12 Effects

- **11.12.2** Single effects, ongoing effects, replacement effects.
- **11.12.4 Ongoing effects:** for a duration, or the rest of the game. Ongoing effects from **Summons and abilities** that change card information affect only the cards present when they resolve (11.12.4.2; the engine records the affected objects); their variables are fixed on resolution (11.12.4.3). Ongoing effects from **field abilities** apply while their card is in the right zone, including to cards that arrive later (11.12.4.4–5).
- **11.12.4.6 Order of application:** 1) control, 2) text, 3) card type and job, 4) other information (element, name, cost, abilities…), 5) power. **11.12.4.7** Within one kind, effects of the card on itself first, then the others. **11.12.4.8–11** Timestamps: a field ability's effect takes the later of its ability's and its card's; a resolved effect, its own; a card's, when it entered its zone; ties: the turn player orders them. **11.12.4.12–13** Dependency first, otherwise timestamps.
- **11.12.5 Replacement effects** ("instead"): must exist before the event; a replaced event did not happen; the same replacement applies once per event (11.12.5.5); **self-replacements first** (11.12.5.6); then a replacement that changes who controls a card entering the field (chosen by the player deploying it); then the **controller (or owner) of the affected card, or the affected player, orders the rest** (11.12.5.7).
- Engine: `chars.ts` passes in the 11.12.4.6 order (this replaces Planecircle's MTG layers), `effects[]` with timestamps and affected ids, `replacement.ts` (damage, zone moves), `modifiers.ts` ordering.

## 12. Rule processes

**12.2** No one controls them. **12.3** Checked whenever a player would get priority: all applicable processes are performed simultaneously as one event, repeated (with triggers) until none are left; then triggers go on the stack; then priority.

| § | Rule process |
|---|---|
| 12.4.1 | A player with 7 or more cards in their Damage Zone loses. |
| 12.4.2 | A player who tried to draw from an empty main deck loses. |
| 12.4.3 | A player who took more damage than the cards left in their main deck loses. |
| 12.4.4 | A Character with power 0 or less is put into its owner's Break Zone (not "broken", 15.1.1.3.2; I18). |
| 12.4.5 | A Character with power 1000 or more and damage ≥ its power is **broken**; if this follows right after it took damage, the damage source broke it. |
| 12.4.6 | Two or more Characters of the same non-generic name under one player's control: **all** go to their owners' Break Zones. |
| 12.4.7 | Two or more Light and/or Dark Characters under one player's control: **all** go. |
| 12.4.8 | Six or more Backups under one player's control: that player puts the extras into the Break Zone, keeping five (I19). |

- Engine: `rules.ts` (`ruleProcesses(s)` returns the set of moves, applied as one event; repeated in `advance` before priority).

## 13–14. Infinite loops, illegal actions

- **13.1** A loop no one can stop: draw. **13.2** One player can stop it: they declare a number of repetitions. **13.3** Both can: the smaller declared number.
- **14.1–4** An action that cannot be completed legally is rewound: payments undone, nothing triggers from it, the player who had priority keeps it.
- Engine: `watchLoop` (mandatory loops → draw, as in Planecircle); an illegal decision throws `RulesError` and leaves the state unchanged (`submit` works on a copy), which is the rewind of 14.

## 15. Keywords

### 15.1 Keyword actions

- **Activate / Dull** (15.1.1.1–2): turning a card upright / sideways; doing it to a card already in that state is allowed.
- **Break** (15.1.1.3): from the field to its owner's Break Zone. Being put into the Break Zone by a cost, by "put into the Break Zone" or by a rule process is **not** breaking unless the text says so (15.1.1.3.2).
- **Discard** (15.1.1.4): from the hand to the Break Zone. **Remove from the game** (15.1.1.5): to the owner's removed-from-play zone. **Shuffle** (15.1.1.6). **Cast** (15.1.1.7): play a card by paying its cost.
- **Search** (15.1.1.8): find the cards in your main deck, reveal them, set them aside, shuffle, then follow the text. A search whose follow-up is impossible is not allowed (example: searching for a Backup to put onto the field with 5 Backups). You may fail to find (only shuffle), except for "any card" searches, which must find the number asked.
- **Form a party** (15.1.1.9): two or more Forwards attacking as one; same element; each must be able to attack (10.1.2.1); any number. One member left on the field: no longer a party (15.1.1.9.5). A Forward that could legally block one member blocks the whole party (15.1.1.9.6). First Strike only if every member has it (15.1.1.9.7). Each member checks it may damage the blocker; if the blocker is broken, every member broke it (15.1.1.9.8). Disbands on returning to Declaration or when the phase ends (15.1.1.9.9). Damage by a member's ability is party damage, with that member as the source (15.1.1.9.10).
- **Remove a counter** (15.1.1.10). **Groups** (15.1.1.11): splitting a zone's cards into groups (empty groups allowed).

### 15.2 Keyword abilities

- **Brave** (15.2.1): does not dull when attacking; still one attack per turn.
- **Haste** (15.2.2): may attack, and use 《ダル》 abilities, without having been controlled since the start of the turn.
- **First Strike** (15.2.3): at the start of the Damage step, attacking or blocking Forwards with First Strike deal their damage first, then the others. Between the two, the turn player gets priority, but no Summons or abilities may be used (I8). Triggers from First Strike damage wait until normal damage is dealt. A party needs every member to have it.
- **Freeze** (15.2.4): an ongoing effect from Summons and abilities; a frozen Character does not activate during its controller's next Active Phase (I7).
- **Back Attack** (15.2.5): a Character with it can be cast whenever you have priority during **either player's Main or Attack Phase**, even in response; it still does not use the stack.
- **Damage N** (15.2.6): the Character has the ability written after "Damage N" while its controller has received N damage (I9). An EX Burst gated by Damage N works only if the condition is met when the card arrives in the Damage Zone, counting the cards placed earlier in the same damage resolution (15.2.6.3, 15.2.6.3.1).
- **Warp** (15.2.7): "Warp X -- cost". From the hand, by the turn player with priority in their Main Phase with an empty stack, pay the cost: the card is removed from play with X Warp counters (no stack). At the start of your Main Phase 1, an auto-ability removes one counter; when the last one is removed, an auto-ability puts the card onto the field. It fails if a same-name non-generic card is already on the field or an effect forbids it, and the card then stays removed (15.2.7.5.1–2). Milestone 2.
- **Limit Break** (15.2.8): "Limit Break -- X", LB icon. Cast from the LB deck following the rules of its card type, paying its base cost **plus** the LB cost: turning **X face-down LB cards face up** (15.2.8.3; I5). On the field it is a normal Character. Whenever it would go to the hand, Break Zone, main deck or removed from play (or a Summon from the stack to any zone), it goes there and then immediately to the LB deck **face up**; triggers about the first destination still apply; this return uses no stack and no replacement (15.2.8.4).
- **Priming** (15.2.9): "Priming [name] -- cost". The turn player with priority, Main Phase, empty stack, pays the cost of a Character they control: search the deck for a Character of that name and put it **on top** of that Character (no stack; not an entry). Not possible if you already control a Character with that name. The pair is one Character with both names; everything else is the top card's; damage, status and gained abilities are kept; base power becomes the top card's. When it leaves the field, both cards move, then the top card is removed from play by rule (no stack, no replacement); it counts as one Character leaving. Milestone 2.

## Interpretations

| # | Question | Reading taken | Basis |
|---|---|---|---|
| I1 | Excess CP: 11.2.1.1 (exact payment, one extra CP per element from discards) vs 11.2.2.3 (generate any amount, choose what pays, the rest vanishes) | 11.2.2.3, the v3.3 rewrite. The engine accepts any set of discards and dulls whose CP can cover the cost; the surplus vanishes. `legalActions` and the AI propose minimal payments only. | 11.2.2.3, 11.2.2.3.1 |
| I2 | "Discard / dull a card of the same colour as the card being played" (11.2.1.1, 11.2.2.2) | Any card or Backup may give CP of its own element; the element requirement applies to the payment as a whole (≥1 CP of the card's element, each element for Multi-Element). | 5.2.1.2–3, 11.2.2, 11.2.2.1 |
| I3 | Multi-Element Backup dulled for CP | It declares one of its elements, like a discarded Multi-Element card. | 5.2.1.3 by analogy |
| I4 | Unblocked party | 1 point of damage in total. | 15.1.1.9.1, 10.1.4.1 |
| I5 | Which LB cards can be cast and turned face up | Only a face-down LB card can be cast; the X cards turned face up are other face-down LB cards, chosen by the caster. Face-up LB cards are used. | 15.2.8.3.2, 15.2.8.4.1 |
| I6 | "Play X onto the field" by an effect | The card enters the field without being cast and without paying a cost: "when cast" triggers do not fire, enter triggers do. Its owner controls it unless stated (6.2.4). | 11.4.1.1, 6.2.4 |
| I7 | Freeze scope | Any Character can be frozen (15.2.4.1); it skips its controller's next Active Phase activation, then the freeze ends; it also ends if the card leaves the field. | 15.2.4.1–2 |
| I8 | Priority windows where nothing can be done (End Phase, between First Strike and normal damage) | No Summon, ability or Back Attack can be used there, so the engine passes them without asking anyone; rule processes and triggers are still handled. Back Attack is allowed only in Main and Attack Phase windows where Summons are allowed. | 9.5.1.1, 9.5.1.4, 15.2.3.3, 15.2.5.2 |
| I9 | "Damage N" | The controller has N or more cards in their Damage Zone. | 15.2.6.2 |
| I10 | EX Burst on the 7th damage | EX Bursts of that damage resolution still resolve; the loss is applied by the next rule process check. Both players losing at once: draw. | 6.5.2.1, 12.3, 3.3 |
| I11 | Dulling a Backup for CP | No "controlled since the start of the turn" requirement (that is for 《ダル》 in ability costs and for attacking); the Backup must be active. | 11.6.2.2, 10.1.2.1.1 |
| I12 | Does blocking dull the blocker? | No (no rule says so). | 10.1.3 |
| I13 | Priority after a Back Attack cast by the non-turn player | The turn player gets priority, as after any Character. | 11.4.7 |
| I14 | "When X enters the field or attacks" | One auto-ability with two trigger events. | 11.8.2 |
| I15 | "Choose" vs "select" | "Choose": targets fixed when cast, activated or put on the stack, rechecked on resolution, subject to "cannot be chosen". "Select": decided on resolution, not targeting, not subject to "cannot be chosen". | 11.3.3, 11.6.5, 11.8.9, 11.11.2 |
| I16 | 11.8.4 (triggers without target, removed at once) vs 11.8.9 (needs a target) | The ability triggers, is put on the stack and removed at once; no one can respond; nothing happens. | 11.8.4 |
| I17 | Order of the 5 cards put on the bottom after a mulligan | Their owner orders them (a choice with a suggested answer, answered by the autopilot unless in full control). | 8.2.1.4 |
| I18 | Rule 12.4.4 for Characters without power (Backups, Monsters) | It applies only to Characters that have a power value (Forwards, and Monsters that became Forwards). | 5.2.6.1, 12.4.4 |
| I19 | Who chooses the extra Backups (12.4.8), and duplicates (12.4.6–7) | Extra Backups: their controller chooses which ones go. Duplicate names and Light/Dark: all of them go, no choice. | 12.4.6–8 |
| I20 | Several damage modifications on one event | Self-replacements first; then the controller of the affected card (or the affected player) orders the rest; the result is never below 0. | 11.12.5.6–7, 4.1 |
| I21 | Party with Multi-Element Forwards | A party is valid when one element is shared by every member. | 10.1.2.1, 15.1.1.9.2 |
| I22 | Element requirement for ability costs | An ability's cost requires exactly the element CP its symbols show (《火》 = 1 Fire CP, 《1》 = 1 CP of any element); the "same element as the card" rule applies only to a card's base cost. | 11.2.2, 11.6.2.1 |
| I23 | EX Burst that chooses a target | It can be used only if a legal target exists when it is applied; the target is chosen then. | 11.10.2, 11.8.9 |

## Glossary (English → French)

The French interface uses the words of the official French card texts. To be completed from the cards' parallel texts by `tools/fr-glossary.ts` (lot A3).

| English | French |
|---|---|
| Forward | Avant |
| Backup | Soutien |
| Monster | Monstre |
| Summon | Invocation |
| Character | Personnage (to confirm) |
| Crystal | Cristal (type name in the official data) |
| Haste | Booster |
| Brave | Bravoure |
| First Strike | Initiative |
| Back Attack | Attaque Arrière |
| Freeze | Gelez (verb on cards) |
| Dull / Active | « Dullez » on cards; Active: to confirm |
| Break Zone, Damage Zone, EX BURST | kept in English inside French card texts |
