/**
 * What the public option-translation function accepts and what it keeps of the model's answer.
 *
 * The function is called from a shopper's page for the option values it has not seen, so anyone
 * can call it. It used to send whatever it was given to the paid translation model and store
 * whatever came back in a cache every storefront reads.
 */

/** The longest option value worth translating: a colour, a fabric, a flavour, not a paragraph. */
export const MAX_TERM_LENGTH = 60;
/** The most words one call may ask for (a product page has a handful). */
export const MAX_TERMS = 30;
/** The longest translation kept. */
export const MAX_TRANSLATION_LENGTH = 120;

/** The words of a request that will be looked at: trimmed, once each, short, and not too many. */
export function translatableTerms(raw: readonly unknown[]): string[] {
  const seen = new Set<string>();
  for (const value of raw) {
    if (typeof value !== "string") continue;
    const term = value.trim();
    if (!term || term.length > MAX_TERM_LENGTH) continue;
    seen.add(term);
    if (seen.size >= MAX_TERMS) break;
  }
  return [...seen];
}

/**
 * The model's translations that are kept: only for the words that were asked, only plain short
 * text. Anything else in its answer (another key, an object, a long passage) is dropped, so a
 * word that carries instructions cannot write a row of its own choosing into the cache.
 */
export function acceptedTranslations(
  asked: readonly string[],
  answer: unknown,
): Record<string, string> {
  const kept: Record<string, string> = {};
  if (!answer || typeof answer !== "object" || Array.isArray(answer)) return kept;
  const map = answer as Record<string, unknown>;
  for (const term of asked) {
    const value = map[term];
    if (typeof value !== "string") continue;
    const translation = value.trim();
    if (translation && translation.length <= MAX_TRANSLATION_LENGTH) kept[term] = translation;
  }
  return kept;
}
