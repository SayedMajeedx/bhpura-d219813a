/**
 * How a value that changed in place is split for its animation (transitions.dev's number
 * pop-in and text morph): what the old and new texts share stays still, only the rest moves.
 *
 * Arabic letters join their neighbours, and a letter set in a box of its own loses its
 * joined form; and boxes in a row are laid out in the row's direction, not by the text's own
 * order. So only digits and their separators are ever split one by one (in a run kept left to
 * right, as digits read), and Arabic text changes by whole words.
 */

export interface Digit {
  char: string;
  /** Shared with the old value at the same place, from the start: it does not move. */
  same: boolean;
  /** The last two digits ride in one and two beats behind the others. */
  stagger: 0 | 1 | 2;
}

export type NumberRun = { kind: "digits"; digits: Digit[] } | { kind: "text"; text: string };

const DIGIT_RUN = /[0-9٠-٩۰-۹](?:[0-9٠-٩۰-۹.,٫٬\s]*[0-9٠-٩۰-۹])?/gu;

function sharedStart(a: string[], b: string[]): number {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
}

/**
 * Number pop-in: "1,299" to "1,305" keeps "1," still and pops "305". A value's words and
 * currency ("23.000 د.ب") stay as plain text beside its digit runs.
 */
export function numberRuns(prev: string | null, next: string): NumberRun[] {
  const all = Array.from(next);
  const same = prev === null ? 0 : sharedStart(Array.from(prev), all);
  const runs: NumberRun[] = [];
  let at = 0; // code-unit index into next
  let charAt = 0; // code-point index into next
  const pushText = (text: string) => {
    if (!text) return;
    runs.push({ kind: "text", text });
    charAt += Array.from(text).length;
  };
  for (const match of next.matchAll(DIGIT_RUN)) {
    pushText(next.slice(at, match.index));
    const chars = Array.from(match[0]);
    runs.push({
      kind: "digits",
      digits: chars.map((char, i) => ({
        char,
        same: prev !== null && charAt + i < same,
        stagger: i === chars.length - 1 ? 2 : i === chars.length - 2 ? 1 : 0,
      })),
    });
    charAt += chars.length;
    at = match.index + match[0].length;
  }
  pushText(next.slice(at));
  return runs;
}

export interface MorphParts {
  head: string;
  from: string;
  to: string;
  tail: string;
}

const JOINING_SCRIPT = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻾]/u;

/**
 * Text morph: "Copy link" to "Copied" keeps "Cop" and cross-blurs "y link" into "ied".
 * Arabic ("انسخ الرابط" to "تم النسخ") changes by whole words, so no letter is cut from its word.
 */
export function morphParts(prev: string, next: string): MorphParts {
  const byWord = JOINING_SCRIPT.test(prev) || JOINING_SCRIPT.test(next);
  const units = (text: string) =>
    byWord ? text.split(/(\s+)/u).filter(Boolean) : Array.from(text);
  const a = units(prev);
  const b = units(next);
  const head = sharedStart(a, b);
  let tail = 0;
  while (
    tail < a.length - head &&
    tail < b.length - head &&
    a[a.length - 1 - tail] === b[b.length - 1 - tail]
  )
    tail++;
  return {
    head: b.slice(0, head).join(""),
    from: a.slice(head, a.length - tail).join(""),
    to: b.slice(head, b.length - tail).join(""),
    tail: b.slice(b.length - tail).join(""),
  };
}
