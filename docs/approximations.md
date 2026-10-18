# Known approximations

Where the engine departs from the Comprehensive Rules v3.3 or from a card's text. Every new approximation is added here; every approximation lifted is removed. Interpretations of unclear rules (not approximations) are in `docs/rules.md` § Interpretations.

## General

- **EX Bursts after damage dealt by an effect** (CR 6.5.2.1, 11.10): they are applied once the whole resolution of that Summon or ability is over, not right after its damage effect. Battle damage is not concerned (`exburst.ts`).
- **Field abilities that depend on field abilities** (CR 11.12.4.12–13): the conditions of field abilities and the cards they affect are read on the characteristics without field abilities (`chars.ts`, `baseChars`).
- **Order of several damage replacements** (CR 11.12.5.7): the controller of the affected card is not asked; the engine takes the order that leaves the least damage, the one that player would choose (`damage.ts`).

## Card by card

None yet.
