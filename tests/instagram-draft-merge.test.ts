import { describe, expect, it } from "vitest";
import type { InstagramProductDraft } from "../src/lib/instagram-ai-importer";
import {
  forSave,
  groupEvery,
  isDraftReady,
  mergeDrafts,
  postIdsOf,
  splitDraft,
  type MergeableDraft,
} from "../src/features/instagram-import/lib/merge-drafts";
import { productDraftItemSchema } from "../src/features/instagram-import/lib/draft-schema";

// A store that posts one abaya as three posts in a row: the review screen folds them into one
// product (all pictures, the best details) and remembers every post so none is imported twice.

const image = (url: string, over: Partial<InstagramProductDraft["images"][number]> = {}) => ({
  url,
  r2Url: `https://r2.test/${url}`,
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
    images: [image(`${id}.jpg`, { isCover: true })],
    coverImageUrl: `https://r2.test/${id}.jpg`,
    imageUploadStatus: "all_success",
    title: "",
    price: null,
    description: "",
    sizes: [],
    colors: [],
    category: null,
    fieldConfidence: { name: 0.2, price: 0, description: 0, sizes: 0 },
    fieldSources: { name: "ai", price: "ai", description: "ai", sizes: "ai", category: "ai" },
    issues: ["missing_price"],
    ...over,
  };
}

const ids = (...list: string[]) => new Set(list);

describe("mergeDrafts", () => {
  const a = draft("a");
  const b = draft("b", {
    title: "عباية مرجان",
    price: 28,
    description: "قماش كريب",
    sizes: ["52", "54"],
    colors: ["black"],
    category: "عبايات",
    fieldConfidence: { name: 0.9, price: 0.95, description: 0.8, sizes: 0.9 },
    issues: [],
  });
  const c = draft("c", { sizes: ["54", "56"], isSoldOut: false });

  it("folds posts into one product led by the most complete one, at the first post's place", () => {
    const merged = mergeDrafts([a, b, c, draft("d")], ids("a", "b", "c"));
    expect(merged.map((d) => d.id)).toEqual(["b", "d"]);
    const product = merged[0];
    expect(product).toMatchObject({
      title: "عباية مرجان",
      price: 28,
      description: "قماش كريب",
      category: "عبايات",
      postType: "carousel",
      imageUploadStatus: "all_success",
      mergedPostIds: ["a", "c"],
    });
    // The lead post's picture first, then the others in feed order, one cover.
    expect(product.images.map((i) => i.url)).toEqual(["b.jpg", "a.jpg", "c.jpg"]);
    expect(product.images.filter((i) => i.isCover).map((i) => i.url)).toEqual(["b.jpg"]);
    expect(product.coverImageUrl).toBe("https://r2.test/b.jpg");
    expect(product.sizes).toEqual(["52", "54", "56"]);
    expect(product.colors).toEqual(["black"]);
  });

  it("remembers the original drafts and every post it covers", () => {
    const [product] = mergeDrafts([a, b, c], ids("a", "b", "c"));
    expect(product.mergedFrom?.map((d) => d.id)).toEqual(["a", "b", "c"]);
    expect(postIdsOf(product).sort()).toEqual(["a", "b", "c"]);
    expect(postIdsOf(a)).toEqual(["a"]);
  });

  it("takes a price from another post when the lead has none, with that price's confidence", () => {
    const lead = draft("x", {
      title: "عباية",
      fieldConfidence: { name: 0.9, price: 0, description: 0, sizes: 0 },
    });
    const donor = draft("y", {
      price: 30,
      fieldConfidence: { name: 0, price: 0.9, description: 0, sizes: 0 },
      fieldSources: { name: "ai", price: "manual", description: "ai", sizes: "ai", category: "ai" },
    });
    const [product] = mergeDrafts([lead, donor], ids("x", "y"));
    expect(product.price).toBe(30);
    expect(product.fieldConfidence.price).toBe(0.9);
    expect(product.fieldSources.price).toBe("manual");
    // The price is there now, so its warning goes.
    expect(product.issues).not.toContain("missing_price");
  });

  it("keeps the issues that still apply, and marks sold out when any post says so", () => {
    const failed = draft("f", {
      images: [image("f.jpg", { isCover: true, status: "failed", r2Url: null })],
      imageUploadStatus: "failed",
      issues: ["image_upload_failed", "missing_price"],
      isSoldOut: true,
    });
    const [product] = mergeDrafts([failed, b], ids("f", "b"));
    expect(product.imageUploadStatus).toBe("partial_success");
    expect(product.isSoldOut).toBe(true);
    expect(product.issues).toContain("image_upload_failed");
    expect(product.issues).not.toContain("missing_price");
  });

  it("leaves the list alone for fewer than two matching drafts, and does not repeat a picture", () => {
    expect(mergeDrafts([a, b], ids("a"))).toEqual([a, b]);
    expect(mergeDrafts([a, b], ids("nope", "none"))).toEqual([a, b]);
    const same = draft("s", { images: [image("a.jpg", { isCover: true })] });
    const [product] = mergeDrafts([a, same], ids("a", "s"));
    expect(product.images).toHaveLength(1);
  });

  it("merges a merged product with another post without losing what it covers", () => {
    const once = mergeDrafts([a, b, c], ids("a", "b"));
    const twice = mergeDrafts(once, ids("b", "c"));
    expect(twice).toHaveLength(1);
    expect(twice[0].mergedFrom?.map((d) => d.id)).toEqual(["a", "b", "c"]);
    expect(postIdsOf(twice[0]).sort()).toEqual(["a", "b", "c"]);
  });
});

describe("splitDraft", () => {
  it("puts the original drafts back where the product was", () => {
    const list = [draft("a"), draft("b", { price: 10 }), draft("c"), draft("z")];
    const merged = mergeDrafts(list, ids("a", "b", "c"));
    expect(splitDraft(merged, merged[0].id).map((d) => d.id)).toEqual(["a", "b", "c", "z"]);
    // Nothing to split on an ordinary draft.
    expect(splitDraft(list, "z")).toEqual(list);
  });
});

describe("groupEvery", () => {
  const nine = Array.from({ length: 9 }, (_, i) =>
    draft(`p${i}`, i % 3 === 0 ? { price: 20 + i, title: `منتج ${i}` } : {}),
  );

  it("turns every three posts in a row into a product", () => {
    const grouped = groupEvery(nine, 3);
    expect(grouped).toHaveLength(3);
    expect(grouped.map((d) => d.mergedFrom?.length)).toEqual([3, 3, 3]);
    expect(grouped.map((d) => d.id)).toEqual(["p0", "p3", "p6"]);
  });

  it("keeps a last post that has no partners as its own product", () => {
    const grouped = groupEvery([...nine, draft("last")], 3);
    expect(grouped).toHaveLength(4);
    expect(grouped[3].id).toBe("last");
    expect(grouped[3].mergedFrom).toBeUndefined();
  });

  it("does not touch products already merged by hand, which also end a run", () => {
    const manual = mergeDrafts(nine, ids("p3", "p4"));
    const grouped = groupEvery(manual, 3);
    // p0..p2 (3) -> 1, [p3+p4] stays, p5..p7 (3) -> 1, p8 alone
    expect(grouped.map((d) => d.mergedFrom?.length ?? 1)).toEqual([3, 2, 3, 1]);
    expect(grouped[1].id).toBe("p3");
  });

  it("ignores a group size that is not a whole number of at least two", () => {
    expect(groupEvery(nine, 1)).toBe(nine);
    expect(groupEvery(nine, 2.5)).toBe(nine);
    expect(groupEvery(nine, 0)).toBe(nine);
  });
});

describe("what is saved", () => {
  it("sends the merged post ids and not the copies kept for splitting", () => {
    const [product] = mergeDrafts(
      [draft("a"), draft("b", { price: 9, title: "x" })],
      ids("a", "b"),
    );
    const sent = forSave(product);
    expect("mergedFrom" in sent).toBe(false);
    expect(sent.mergedPostIds).toEqual(["a"]);
    const parsed = productDraftItemSchema.parse(sent);
    expect(parsed.mergedPostIds).toEqual(["a"]);
    expect(() => productDraftItemSchema.parse({ ...sent, mergedPostIds: [1] })).toThrow();
  });

  it("is ready only with a price, a title, a good picture and enough confidence", () => {
    const ready = draft("r", {
      title: "عباية",
      price: 25,
      fieldConfidence: { name: 1, price: 0.9, description: 0, sizes: 0 },
    });
    expect(isDraftReady(ready)).toBe(true);
    expect(isDraftReady({ ...ready, price: null })).toBe(false);
    expect(isDraftReady({ ...ready, title: "  " })).toBe(false);
    expect(
      isDraftReady({ ...ready, fieldConfidence: { ...ready.fieldConfidence, price: 0.5 } }),
    ).toBe(false);
    expect(
      isDraftReady({
        ...ready,
        fieldConfidence: { ...ready.fieldConfidence, price: 0.5 },
        fieldSources: { ...ready.fieldSources, price: "manual" },
      }),
    ).toBe(true);
    expect(
      isDraftReady({ ...ready, images: ready.images.map((i) => ({ ...i, selected: false })) }),
    ).toBe(false);
  });
});
