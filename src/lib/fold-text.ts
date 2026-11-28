/**
 * Text as a search compares it: lower case, and Arabic written one way. People type an alef with
 * or without its hamza or madda, a word's closing ة as ه and its closing ى as ي, with or without
 * diacritics and the tatweel; folded, "اعدادات الضريبه" and "إعدادات الضريبة" are the same.
 * (The storefront's database search has its own reading, `search-terms.ts`, as ILIKE patterns.)
 */

/** Harakat, tanween, shadda, sukun, superscript alef and the tatweel. */
const DIACRITICS = /[ً-ٰٟـ]/g;
const ALEF = /[أإآٱ]/g;

export function foldWord(text: string): string {
  return text
    .toLowerCase()
    .replace(DIACRITICS, "")
    .replace(ALEF, "ا")
    .replace(/ة(?=\s|$)/g, "ه")
    .replace(/ى(?=\s|$)/g, "ي");
}

/** Whether every word of a search is in the text, in any order. */
export function matchesWords(text: string, query: string): boolean {
  const folded = foldWord(text);
  return foldWord(query)
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => folded.includes(word));
}
