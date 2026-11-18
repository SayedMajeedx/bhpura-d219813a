/*
 * Stretching Arabic words with the tatweel (ـ), as a voice draws a word out: «بتنـــزل باچـــر».
 * The tatweel only belongs between two letters that join, so it goes after a letter that joins
 * the next, near the middle of the word, in the last two words that can take it.
 */

export const TATWEEL = "ـ";

/** Letters that join the letter after them. */
const JOINS_NEXT = /[بتثجحخسشصضطظعغفقكلمنهيئپچگڤ]/;
/** A letter of an Arabic word, diacritics apart. */
const LETTER = /[ء-غف-يپچڤگ]/;

/** Where a word can be drawn out: after the joining letter nearest the word's middle, or none. */
function stretchAt(chars: string[]): number {
  const spots: number[] = [];
  for (let i = 0; i < chars.length - 1; i++) {
    if (JOINS_NEXT.test(chars[i]) && LETTER.test(chars[i + 1])) spots.push(i);
  }
  if (!spots.length || chars.filter((ch) => LETTER.test(ch)).length < 3) return -1;
  const middle = (chars.length - 1) / 2;
  return spots.reduce((best, i) => (Math.abs(i - middle) <= Math.abs(best - middle) ? i : best));
}

/** The words with the last two that can take it drawn out, `count` tatweels each. */
export function stretched(text: string, count = 8): string {
  const parts = text.split(/(\s+)/);
  let left = 2;
  for (let p = parts.length - 1; p >= 0 && left > 0; p--) {
    const chars = [...parts[p]];
    const at = stretchAt(chars);
    if (at < 0) continue;
    chars.splice(at + 1, 0, TATWEEL.repeat(count));
    parts[p] = chars.join("");
    left -= 1;
  }
  return parts.join("");
}

export const isStretched = (text: string | undefined) => Boolean(text?.includes(TATWEEL));

export const unstretched = (text: string) => text.split(TATWEEL).join("");

/** One press draws the words out, the next puts them back. */
export const toggleStretch = (text: string) =>
  isStretched(text) ? unstretched(text) : stretched(text);
