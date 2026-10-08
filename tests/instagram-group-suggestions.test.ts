import { describe, expect, it } from "vitest";
import {
  captionSimilarity,
  normalizeCaption,
  suggestGroups,
} from "../src/features/instagram-import/lib/group-suggestions";
import {
  forSave,
  mergeDrafts,
  type MergeableDraft,
} from "../src/features/instagram-import/lib/merge-drafts";
import { runImportPipeline, type ImportApi } from "../src/features/instagram-import/lib/run-import";
import type { InstagramPostPreview } from "../src/lib/instagram-ai-importer";

// Which posts are one product, worked out from when they were posted and what they say.

const BASE = Date.UTC(2026, 9, 3, 10, 0, 0);
const at = (minutes: number) => new Date(BASE + minutes * 60_000).toISOString();

function draft(id: string, over: Partial<MergeableDraft> = {}): MergeableDraft {
  return {
    id,
    url: `https://instagram.com/p/${id}/`,
    isSoldOut: false,
    postType: "image",
    images: [
      { url: `${id}.jpg`, r2Url: `r2/${id}.jpg`, isCover: true, selected: true, status: "success" },
    ],
    coverImageUrl: `r2/${id}.jpg`,
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
/** The post with the words: a name, a price, a caption. */
const withCaption = (id: string, minutes: number, title: string, price: number, caption: string) =>
  draft(id, {
    postedAt: at(minutes),
    caption,
    title,
    price,
    fieldConfidence: { name: 0.9, price: 0.9, description: 0, sizes: 0 },
  });
/** A photo-only post. */
const photo = (id: string, minutes: number) => draft(id, { postedAt: at(minutes), caption: "" });

describe("normalizeCaption and captionSimilarity", () => {
  it("compares Arabic without marks or letter variants, and ignores links, tags and emoji", () => {
    expect(normalizeCaption("عباية مَرجان ✨ #جديد https://x.co/a @abaya.zh")).toBe("عبايه مرجان");
    expect(captionSimilarity("عباية مَرجان 28 د.ب", "عبايه مرجان 28 د.ب")).toBe(1);
    expect(captionSimilarity("عباية مرجان قماش كريب", "فستان طيف سهرة")).toBe(0);
    expect(captionSimilarity("", "عباية")).toBe(0);
    expect(captionSimilarity(undefined, undefined)).toBe(0);
  });
});

describe("suggestGroups", () => {
  it("proposes each burst of posts as one product: the caption on the first, the rest photos", () => {
    const drafts = [
      withCaption("a1", 0, "عباية مرجان", 28, "عباية مرجان قماش كريب السعر 28 د.ب"),
      photo("a2", 3),
      photo("a3", 5),
      withCaption("b1", 150, "عباية سحاب", 30, "عباية سحاب فخمة السعر 30 د.ب"),
      photo("b2", 152),
      photo("b3", 155),
    ];
    const groups = suggestGroups(drafts);
    expect(groups.map((g) => g.ids)).toEqual([
      ["a1", "a2", "a3"],
      ["b1", "b2", "b3"],
    ]);
    expect(groups.every((g) => g.confidence === "high" && g.reason === "time-and-caption")).toBe(
      true,
    );
  });

  it("handles products with two, three and four posts in a row", () => {
    const drafts = [
      withCaption("a1", 0, "عباية مرجان", 28, "عباية مرجان 28 د.ب"),
      photo("a2", 2),
      withCaption("b1", 200, "عباية سحاب", 30, "عباية سحاب 30 د.ب"),
      photo("b2", 202),
      photo("b3", 203),
      withCaption("c1", 500, "فستان طيف", 22, "فستان طيف 22 د.ب"),
      photo("c2", 502),
      photo("c3", 503),
      photo("c4", 504),
    ];
    expect(suggestGroups(drafts).map((g) => g.ids.length)).toEqual([2, 3, 4]);
  });

  it("keeps two products apart when their prices or names clearly differ, even posted together", () => {
    const priced = [
      withCaption("a", 0, "عباية مرجان", 28, "عباية مرجان 28 د.ب"),
      withCaption("b", 2, "عباية مرجان", 30, "عباية مرجان 30 د.ب"),
    ];
    expect(suggestGroups(priced)).toEqual([]);
    const named = [
      withCaption("a", 0, "عباية مرجان", 28, "وصل حديثا عباية جميلة جدا ومريحة"),
      withCaption("b", 2, "فستان طيف", 28, "وصل حديثا فستان جميل جدا ومريح"),
    ];
    expect(suggestGroups(named)).toEqual([]);
  });

  it("does not join posts hours apart, nor photo-only posts nobody can tell apart", () => {
    expect(suggestGroups([photo("a", 0), photo("b", 60)])).toEqual([]);
    expect(
      suggestGroups([withCaption("a", 0, "عباية", 28, "عباية 28 د.ب"), photo("b", 900)]),
    ).toEqual([]);
  });

  it("marks a weak link for a second look, and says why", () => {
    const groups = suggestGroups([photo("a", 0), photo("b", 8)]);
    expect(groups).toEqual([{ ids: ["a", "b"], reason: "time", confidence: "medium" }]);
  });

  it("still groups posts with the same caption when the time is unknown (an older saved review)", () => {
    const same = "عباية مرجان قماش كريب السعر 28 د.ب";
    const groups = suggestGroups([
      draft("a", { caption: same, title: "عباية مرجان", price: 28 }),
      draft("b", { caption: same, title: "عباية مرجان", price: 28 }),
      draft("c", { caption: "فستان طيف سهرة 22 د.ب", title: "فستان طيف", price: 22 }),
    ]);
    expect(groups).toEqual([{ ids: ["a", "b"], reason: "caption", confidence: "medium" }]);
  });

  it("never makes a group larger than the limit, and leaves products already merged alone", () => {
    const burst = Array.from({ length: 10 }, (_, i) => photo(`p${i}`, i));
    expect(suggestGroups(burst, { maxGroupSize: 4 }).map((g) => g.ids.length)).toEqual([4, 4, 2]);
    const merged = mergeDrafts(
      [photo("x", 0), photo("y", 1), photo("z", 2), photo("w", 3)],
      new Set(["y", "z"]),
    );
    // x, [y+z], w: the merged product ends the runs, so x and w stay alone.
    expect(suggestGroups(merged)).toEqual([]);
  });
});

describe("what a draft remembers about its post", () => {
  it("keeps the time and the words until saving, and sends neither to the server", () => {
    const lead = withCaption("a", 0, "عباية", 28, "عباية 28 د.ب");
    const [product] = mergeDrafts([lead, photo("b", 2)], new Set(["a", "b"]));
    expect(product.postedAt).toBe(at(0));
    expect(product.caption).toBe("عباية 28 د.ب");
    const sent = forSave(product);
    expect("caption" in sent).toBe(false);
    expect("postedAt" in sent).toBe(false);
    expect(sent.mergedPostIds).toEqual(["b"]);
  });

  it("is attached by the pipeline from the pulled posts, for posts the AI read and those it did not", async () => {
    const posts: InstagramPostPreview[] = [0, 1].map((n) => ({
      id: `p${n}`,
      url: `https://instagram.com/p/p${n}/`,
      images: [{ url: `i${n}.jpg`, r2Url: null, isCover: true, status: "pending" }],
      coverImageUrl: "",
      caption: `caption ${n} ${"x".repeat(1000)}`,
      isSoldOut: false,
      date: "Oct 3",
      postedAt: at(n * 5),
      postType: "image",
    }));
    const api: ImportApi = {
      fetchInstagramPosts: async () => ({ runId: "r", datasetId: "d" }),
      checkScraperStatus: async () => ({ status: "SUCCEEDED" }),
      fetchScraperDataset: async () => posts,
      batchRehostAllMedia: async ({ data }) => ({ posts: data.posts }),
      batchParseCaptionsWithAI: async () => {
        throw new Error("down");
      },
    };
    const { drafts } = await runImportPipeline({
      urls: [],
      limit: 10,
      brandId: "b",
      isAr: false,
      api,
      sleep: async () => undefined,
      onStep: () => undefined,
      onStatus: () => undefined,
    });
    expect(drafts.map((d) => d.postedAt)).toEqual([at(0), at(5)]);
    expect(drafts[0].caption).toHaveLength(600);
    expect(drafts[0].caption?.startsWith("caption 0")).toBe(true);
  });
});
