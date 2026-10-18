/** Illegal decision: the original state is left unchanged. */
export class RulesError extends Error {}

/**
 * Rethrows an error caught around a step that may be illegal (payment, targets): a RulesError becomes a RulesError
 * with the given message; any other error is an engine bug and propagates unchanged (never disguised as an illegal
 * decision, otherwise the AI and the fuzz would hide it).
 */
export function rethrowAsRules(e: unknown, message?: string): never {
  if (e instanceof RulesError) throw message === undefined ? e : new RulesError(message);
  throw e;
}
