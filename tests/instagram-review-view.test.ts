import { describe, expect, it } from "vitest";
import {
  bulkSetField,
  filterDrafts,
  moveDraftImage,
  removeDrafts,
  restoreDrafts,
  reviewCounts,
  searchDrafts,
  sortDrafts,
  viewDrafts,
} from "../src/features/instagram-import/lib/review-view";
import { parseSizes } from "../src/features/instagram-import/components/BulkEditBar";
import type { MergeableDraft } from "../src/features/instagram-import/lib/merge-drafts";

// What the review shows and the bulk things it does.

const image = (n: number, over: Partial<MergeableDraft["images"][number]> = {}) => ({
  url: `${n}.jpg`,
  r2Url: `r2/${n}.jpg`,
  isCover: false,
  selected: true,
  status: "success" as const,
  ...over,
});

function draft(id: string, over: Partial<MergeableDraft> = {}): MergeableDraft {
  return {
    id,
    url: `https://instagram.com/p/${id}/`,
    isSoldOut: false,
    postType: "image",
    images: [image(1, { isCover: true })],
    coverImageUrl: "r2/1.jpg",
    imageUploadStatus: "all_success",
    title: "",
    price: null,
    description: "",
    sizes: [],
    colors: [],
    category: null,
    fieldConfidence: { name: 0, price: 0, description: 0, sizes: 0 },
    fieldSources: { name: "ai", price: "ai", description: "ai", sizes: "ai", category: "ai" },
    issues: [],
    ...over,
  };
}
/** Complete enough to approve. */
const ready = (id: string, title: string, price: number, over: Partial<MergeableDraft> = {}) =>
  draft(id, {
    title,
    price,
    fieldConfidence: { name: 1, price: 1, description: 0, sizes: 0 },
    ...over,
  });

const list = [
  ready("a", "عباية مرجان", 28, {
    category: "عبايات",
    description: "قماش كريب",
    sizes: ["52", "54"],
  }),
  draft("b", { title: "فستان طيف", price: null }),
  ready("c", "عباية سحاب", 30, { isSoldOut: true, caption: "عباية سحاب نفدت الكمية" }),
  draft("d", {
    imageUploadStatus: "failed",
    images: [image(1, { status: "failed", r2Url: null })],
  }),
  ready("e", "حقيبة", 12),
];
const ids = (drafts: MergeableDraft[]) => drafts.map((d) => d.id);

describe("counts and tabs", () => {
  it("counts ready, needing review, image failures and sold out", () => {
    expect(reviewCounts(list)).toEqual({
      all: 5,
      ready: 3,
      needsReview: 1,
      imageFailed: 1,
      soldOut: 1,
    });
  });

  it("filters by tab", () => {
    expect(ids(filterDrafts(list, "all"))).toEqual(["a", "b", "c", "d", "e"]);
    expect(ids(filterDrafts(list, "ready"))).toEqual(["a", "c", "e"]);
    expect(ids(filterDrafts(list, "needs_review"))).toEqual(["b"]);
    expect(ids(filterDrafts(list, "image_failed"))).toEqual(["d"]);
    expect(ids(filterDrafts(list, "sold_out"))).toEqual(["c"]);
  });
});

describe("search", () => {
  it("finds by name, description, category, sizes and caption, ignoring Arabic marks and letter variants", () => {
    expect(ids(searchDrafts(list, "مرجان"))).toEqual(["a"]);
    expect(ids(searchDrafts(list, "مَرجان"))).toEqual(["a"]);
    expect(ids(searchDrafts(list, "عبايه"))).toEqual(["a", "c"]);
    expect(ids(searchDrafts(list, "كريب"))).toEqual(["a"]);
    expect(ids(searchDrafts(list, "عبايات"))).toEqual(["a"]);
    expect(ids(searchDrafts(list, "54"))).toEqual(["a"]);
    expect(ids(searchDrafts(list, "نفدت"))).toEqual(["c"]);
  });

  it("needs every word typed, and everything shows for an empty search", () => {
    expect(ids(searchDrafts(list, "عباية سحاب"))).toEqual(["c"]);
    expect(ids(searchDrafts(list, "عباية فستان"))).toEqual([]);
    expect(searchDrafts(list, "   ")).toBe(list);
    expect(searchDrafts(list, "")).toBe(list);
  });
});

describe("sort", () => {
  it("keeps the feed order, and never changes the list it was given", () => {
    expect(sortDrafts(list, "feed")).toBe(list);
    const before = ids(list);
    sortDrafts(list, "price_asc");
    expect(ids(list)).toEqual(before);
  });

  it("puts what needs a look first, in feed order within each part", () => {
    expect(ids(sortDrafts(list, "needs_review"))).toEqual(["b", "d", "a", "c", "e"]);
  });

  it("sorts by price with the unpriced last, either way", () => {
    expect(ids(sortDrafts(list, "price_asc"))).toEqual(["e", "a", "c", "b", "d"]);
    expect(ids(sortDrafts(list, "price_desc"))).toEqual(["c", "a", "e", "b", "d"]);
  });

  it("sorts by name in Arabic with unnamed ones last", () => {
    // The two without a name come last.
    expect(ids(sortDrafts(list, "name")).slice(-2)).toEqual(["b", "d"]);
    const named = sortDrafts(list, "name").filter((d) => d.title);
    expect(named.map((d) => d.title)).toEqual(
      [...named.map((d) => d.title)].sort((a, b) => a.localeCompare(b, "ar")),
    );
  });

  it("combines tab, search and order", () => {
    expect(ids(viewDrafts(list, { tab: "ready", query: "عباية", sort: "price_desc" }))).toEqual([
      "c",
      "a",
    ]);
  });
});

describe("bulk edits and removal", () => {
  it("sets a field on the chosen drafts only, as if typed on each", () => {
    const edited = bulkSetField(list, new Set(["a", "e"]), "price", 25);
    expect(edited.map((d) => d.price)).toEqual([25, null, 30, null, 25]);
    expect(edited[0].fieldSources.price).toBe("manual");
    expect(edited[1]).toBe(list[1]);
    expect(bulkSetField(list, new Set(["b"]), "category", "فساتين")[1].category).toBe("فساتين");
    expect(bulkSetField(list, new Set(["b"]), "sizes", ["S", "M"])[1].sizes).toEqual(["S", "M"]);
    expect(bulkSetField(list, new Set(), "price", 1)).toBe(list);
  });

  it("removes drafts, and an Undo puts them back where they were, even after other changes", () => {
    const removed = [1, 3].map((index) => ({ draft: list[index], index }));
    const after = removeDrafts(list, new Set(["b", "d"]));
    expect(ids(after)).toEqual(["a", "c", "e"]);
    // Something else happened meanwhile: a new draft at the end.
    const later = [...after, draft("z")];
    expect(ids(restoreDrafts(later, removed))).toEqual(["a", "b", "c", "d", "e", "z"]);
    // Undoing twice does not duplicate.
    expect(ids(restoreDrafts(restoreDrafts(later, removed), removed))).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
      "z",
    ]);
  });
});

describe("moveDraftImage", () => {
  const pictures = draft("p", {
    images: [image(1, { isCover: true }), image(2), image(3)],
  });

  it("moves a picture and keeps the cover where it is flagged", () => {
    const [moved] = moveDraftImage([pictures], "p", 0, 2);
    expect(moved.images.map((i) => i.url)).toEqual(["2.jpg", "3.jpg", "1.jpg"]);
    expect(moved.images.find((i) => i.isCover)?.url).toBe("1.jpg");
    expect(moveDraftImage([pictures], "p", 2, 1)[0].images.map((i) => i.url)).toEqual([
      "1.jpg",
      "3.jpg",
      "2.jpg",
    ]);
  });

  it("ignores moves that go nowhere or off the ends, and other drafts", () => {
    expect(moveDraftImage([pictures], "p", 1, 1)[0]).toBe(pictures);
    expect(moveDraftImage([pictures], "p", 0, -1)[0]).toBe(pictures);
    expect(moveDraftImage([pictures], "p", 0, 3)[0]).toBe(pictures);
    expect(moveDraftImage([pictures], "other", 0, 1)[0]).toBe(pictures);
  });
});

describe("parseSizes", () => {
  it("reads sizes separated by commas, Arabic commas, spaces or slashes, once each", () => {
    expect(parseSizes("52, 54 56،58 / 52")).toEqual(["52", "54", "56", "58"]);
    expect(parseSizes("  ")).toEqual([]);
    expect(parseSizes("S;M")).toEqual(["S", "M"]);
  });
});
