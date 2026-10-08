import { editDraftField } from "./draft-edits";
import { normalizeCaption } from "./group-suggestions";
import { isDraftReady, type MergeableDraft } from "./merge-drafts";

/**
 * What the review screen shows and the bulk things it does: filter, search and sort the drafts,
 * set a field on several at once, remove some, and reorder a draft's pictures. All plain functions
 * of the list.
 */

export type FilterTab = "all" | "ready" | "needs_review" | "image_failed" | "sold_out";
export type SortMode = "feed" | "needs_review" | "price_asc" | "price_desc" | "name";

export type ReviewCounts = {
  all: number;
  ready: number;
  needsReview: number;
  imageFailed: number;
  soldOut: number;
};

const imageFailed = (draft: MergeableDraft) => draft.imageUploadStatus === "failed";

export function reviewCounts(drafts: MergeableDraft[]): ReviewCounts {
  let ready = 0;
  let needsReview = 0;
  let failed = 0;
  let soldOut = 0;
  for (const draft of drafts) {
    const isReady = isDraftReady(draft);
    if (isReady) ready++;
    if (!isReady && !imageFailed(draft)) needsReview++;
    if (imageFailed(draft)) failed++;
    if (draft.isSoldOut) soldOut++;
  }
  return { all: drafts.length, ready, needsReview, imageFailed: failed, soldOut };
}

export function filterDrafts(drafts: MergeableDraft[], tab: FilterTab): MergeableDraft[] {
  switch (tab) {
    case "ready":
      return drafts.filter((draft) => isDraftReady(draft));
    case "needs_review":
      return drafts.filter((draft) => !isDraftReady(draft) && !imageFailed(draft));
    case "image_failed":
      return drafts.filter(imageFailed);
    case "sold_out":
      return drafts.filter((draft) => draft.isSoldOut);
    default:
      return drafts;
  }
}

const haystack = (draft: MergeableDraft) =>
  normalizeCaption(
    [draft.title, draft.description, draft.category, draft.sizes.join(" "), draft.caption].join(
      " ",
    ),
  );

/** Drafts whose name, description, category, sizes or caption contain every word typed. */
export function searchDrafts(drafts: MergeableDraft[], query: string): MergeableDraft[] {
  const words = normalizeCaption(query).split(" ").filter(Boolean);
  if (words.length === 0) return drafts;
  return drafts.filter((draft) => {
    const text = haystack(draft);
    return words.every((word) => text.includes(word));
  });
}

/** A new, sorted list: the order of the feed is kept for ties, and a draft without a price goes last. */
export function sortDrafts(drafts: MergeableDraft[], mode: SortMode): MergeableDraft[] {
  if (mode === "feed") return drafts;
  const indexed = drafts.map((draft, index) => ({ draft, index }));
  const price = (draft: MergeableDraft) =>
    typeof draft.price === "number" && draft.price > 0 ? draft.price : null;
  const compare = (a: (typeof indexed)[number], b: (typeof indexed)[number]): number => {
    if (mode === "needs_review") {
      return Number(isDraftReady(a.draft)) - Number(isDraftReady(b.draft));
    }
    if (mode === "name") {
      const first = a.draft.title.trim();
      const second = b.draft.title.trim();
      if (!first || !second) return Number(!first) - Number(!second);
      return first.localeCompare(second, "ar");
    }
    const first = price(a.draft);
    const second = price(b.draft);
    if (first === null || second === null) return Number(first === null) - Number(second === null);
    return mode === "price_asc" ? first - second : second - first;
  };
  return indexed.sort((a, b) => compare(a, b) || a.index - b.index).map((entry) => entry.draft);
}

export function viewDrafts(
  drafts: MergeableDraft[],
  view: { tab: FilterTab; query: string; sort: SortMode },
): MergeableDraft[] {
  return sortDrafts(searchDrafts(filterDrafts(drafts, view.tab), view.query), view.sort);
}

/** Sets the category, the sizes or the price on every draft with these ids, as if typed on each. */
export function bulkSetField(
  drafts: MergeableDraft[],
  ids: ReadonlySet<string>,
  field: "category" | "sizes" | "price",
  value: unknown,
): MergeableDraft[] {
  return ids.size === 0
    ? drafts
    : [...ids].reduce((list, id) => editDraftField(list, id, field, value), drafts);
}

export function removeDrafts(drafts: MergeableDraft[], ids: ReadonlySet<string>): MergeableDraft[] {
  return drafts.filter((draft) => !ids.has(draft.id));
}

/** Moves one of a draft's pictures to another place in its order (the cover stays the cover). */
export function moveDraftImage(
  drafts: MergeableDraft[],
  id: string,
  from: number,
  to: number,
): MergeableDraft[] {
  return drafts.map((draft) => {
    if (draft.id !== id) return draft;
    const last = draft.images.length - 1;
    if (from === to || from < 0 || to < 0 || from > last || to > last) return draft;
    const images = [...draft.images];
    const [moved] = images.splice(from, 1);
    images.splice(to, 0, moved);
    return { ...draft, images };
  });
}

/** Puts removed drafts back where they were (an Undo), skipping any that is already there. */
export function restoreDrafts(
  drafts: MergeableDraft[],
  removed: Array<{ draft: MergeableDraft; index: number }>,
): MergeableDraft[] {
  const result = [...drafts];
  for (const { draft, index } of [...removed].sort((a, b) => a.index - b.index)) {
    if (result.some((existing) => existing.id === draft.id)) continue;
    result.splice(Math.min(index, result.length), 0, draft);
  }
  return result;
}
