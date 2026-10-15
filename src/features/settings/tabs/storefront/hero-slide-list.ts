import { headlinePhrases, type HeroHeadlineFields } from "@/lib/hero-headline";

/**
 * The hero's slides as a list a merchant can scan: each slide folds to one row (its picture, its
 * first phrase, its kind) and opens when tapped, and the order is changed by dragging a row or with
 * its up and down buttons. Five open slides were a page several screens long.
 */

/** The slides with one moved from one place to another (unchanged when either is out of range). */
export function moveSlide<T>(slides: readonly T[], from: number, to: number): T[] {
  const list = [...slides];
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const [moved] = list.splice(from, 1);
  list.splice(to, 0, moved);
  return list;
}

/** What a folded row says: the first phrase in the reader's language, else in the other one. */
export function slideRowTitle(slide: HeroHeadlineFields, lang: "ar" | "en"): string | null {
  const other = lang === "ar" ? "en" : "ar";
  return headlinePhrases(slide, lang)[0] ?? headlinePhrases(slide, other)[0] ?? null;
}

/** The slide that stays open after a move: the one that was open, wherever it went. */
export function openAfterMove(open: number | null, from: number, to: number): number | null {
  if (open === null) return null;
  if (open === from) return to;
  if (from < open && to >= open) return open - 1;
  if (from > open && to <= open) return open + 1;
  return open;
}

/** The slide that stays open after one is deleted. */
export function openAfterDelete(open: number | null, removed: number): number | null {
  if (open === null || open === removed) return null;
  return open > removed ? open - 1 : open;
}
