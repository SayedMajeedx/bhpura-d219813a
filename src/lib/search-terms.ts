/**
 * How a shopper's search becomes the database's filters. Arabic is written several ways for
 * one word: alef with or without hamza or madda (ا أ إ آ ٱ), a closing ta marbuta or ha (ة ه),
 * and a closing ya or alef maqsura (ي ى), with or without diacritics and the tatweel. A search
 * once matched the name as one exact run of letters, so "عبايه" found no "عباية", and "abaya
 * black" no "Black Abaya".
 *
 * Each word is now looked for on its own (all of them must be found, in any order), its
 * diacritics dropped, and each of those letters matched by any of its forms: ILIKE's `_` stands
 * for one character, so "عبايه" asks for "عب_ي_" and finds both spellings. Only an alef varies
 * anywhere; ta marbuta and alef maqsura only close a word, so a ha or a ya inside one stays
 * itself (a wildcard there would match far more than was meant).
 */

/** Characters that mean something inside a PostgREST `or=(…)` filter or an ILIKE pattern. */
const FILTER_SYNTAX = /[%_,()\\"*]/g;

/** Harakat, tanween, shadda, sukun, superscript alef and the tatweel. */
const DIACRITICS = /[ً-ٰٟـ]/g;

/** An alef in any of its forms, anywhere in a word. */
const ALEF = /[اأإآٱ]/g;
/** A closing ta marbuta or ha, or a closing ya or alef maqsura. */
const CLOSING_VARIANT = /[ةهيى]$/;

/** Words looked for at most: a pasted sentence still makes a bounded request. */
export const MAX_SEARCH_WORDS = 5;

/** The words of a search, cleaned of filter syntax and diacritics, each once. */
export function searchWords(term: string): string[] {
  const words = term
    .replace(FILTER_SYNTAX, " ")
    .replace(DIACRITICS, "")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);
  return [...new Set(words.map((word) => word.toLowerCase()))].slice(0, MAX_SEARCH_WORDS);
}

/** One word as an ILIKE pattern that finds any of its Arabic spellings. */
export function wordPattern(word: string): string {
  return `%${word.replace(ALEF, "_").replace(CLOSING_VARIANT, "_")}%`;
}

/**
 * One `or` filter per word, over the columns given: chained, they ask that every word be found
 * in one of the columns. Empty for a search with nothing to look for.
 */
export function searchFilters(term: string, columns: readonly string[]): string[] {
  return searchWords(term).map((word) => {
    const pattern = wordPattern(word);
    return columns.map((column) => `${column}.ilike.${pattern}`).join(",");
  });
}
