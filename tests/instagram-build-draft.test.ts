import { describe, expect, it } from "vitest";
import { buildDraft } from "../src/features/instagram-import/lib/build-draft";
import { editDraftField } from "../src/features/instagram-import/lib/draft-edits";
import { mergeDrafts } from "../src/features/instagram-import/lib/merge-drafts";
import type { InstagramPostPreview } from "../src/lib/instagram-ai-importer";

// A draft from a post and what the AI read: the AI's price is checked against what the caption
// states, sizes are filled from the caption when the AI left them out, and a missing name stays empty.

const post = (caption: string, over: Partial<InstagramPostPreview> = {}): InstagramPostPreview => ({
  id: "p1",
  url: "https://instagram.com/p/p1/",
  images: [{ url: "1.jpg", r2Url: "r2/1.jpg", isCover: true, selected: true, status: "success" }],
  coverImageUrl: "r2/1.jpg",
  caption,
  isSoldOut: false,
  date: "Oct 3",
  postType: "image",
  ...over,
});
const ai = (over: Record<string, unknown> = {}) => ({
  id: "p1",
  title: "عباية مرجان",
  price: 28,
  description: "قماش كريب",
  sizes: [] as string[],
  colors: [] as string[],
  category: "عبايات",
  confidence: { name: 0.9, price: 0.8, description: 0.8, sizes: 0.8 },
  ...over,
});

describe("the price", () => {
  it("is certain when the AI and the caption agree", () => {
    const draft = buildDraft(post("السعر 28 د.ب"), ai());
    expect(draft.price).toBe(28);
    expect(draft.fieldConfidence.price).toBeGreaterThanOrEqual(0.95);
    expect(draft.fieldSources.price).toBe("ai");
    expect(draft.priceConflict).toBeUndefined();
    expect(draft.issues).toEqual([]);
  });

  it("is taken from the caption when the AI missed it", () => {
    const draft = buildDraft(post("السعر 28 د.ب"), ai({ price: null }));
    expect(draft.price).toBe(28);
    expect(draft.fieldConfidence.price).toBe(0.9);
  });

  it("is left empty, with the reason, when they disagree", () => {
    const draft = buildDraft(post("السعر 28 د.ب"), ai({ price: 35 }));
    expect(draft.price).toBeNull();
    expect(draft.fieldSources.price).toBe("manual");
    expect(draft.priceConflict).toMatchObject({ geminiPrice: 35, regexPrice: 28 });
    expect(draft.issues).toContain("price_conflict");
  });

  it("is left empty when only the AI names one (it may be a phone number or a size)", () => {
    const draft = buildDraft(post("عباية جميلة"), ai({ price: 52 }));
    expect(draft.price).toBeNull();
    expect(draft.priceConflict).toMatchObject({ geminiPrice: 52, regexPrice: null });
    expect(draft.issues).toContain("unverified_price");
  });

  it("is missing when nobody found one", () => {
    const draft = buildDraft(post("عباية جميلة"), ai({ price: null }));
    expect(draft.price).toBeNull();
    expect(draft.fieldConfidence.price).toBe(0);
    expect(draft.issues).toContain("missing_price");
  });

  it("ignores a delivery fee the AI took for the price", () => {
    const draft = buildDraft(post("التوصيل 2 د.ب"), ai({ price: 2 }));
    expect(draft.price).toBeNull();
    expect(draft.issues).toContain("unverified_price");
  });

  it("takes the new price of a reduced item and keeps the old one crossed out", () => {
    const draft = buildDraft(post("كان 40 د.ب الآن 30 د.ب"), ai({ price: 30 }));
    expect(draft.price).toBe(30);
    expect(draft.originalPrice).toBe(40);
    // If the AI took the old price, that is a disagreement, not a silent pick.
    const wrong = buildDraft(post("كان 40 د.ب الآن 30 د.ب"), ai({ price: 40 }));
    expect(wrong.price).toBeNull();
    expect(wrong.issues).toContain("price_conflict");
  });

  it("is left empty when the caption lists several prices without saying which", () => {
    const draft = buildDraft(post("45 د.ب أو 30 د.ب"), ai({ price: 30 }));
    expect(draft.price).toBeNull();
    expect(draft.priceConflict?.reason).toContain("30");
    expect(draft.priceConflict?.reason).toContain("45");
    expect(draft.issues).toContain("multiple_prices");
  });

  it("is left empty when the caption's currency is not the store's", () => {
    const draft = buildDraft(post("السعر 100 ريال سعودي"), ai({ price: 100 }), {
      storeCurrency: "BHD",
    });
    expect(draft.price).toBeNull();
    expect(draft.issues).toContain("currency_mismatch");
    expect(draft.priceConflict?.reason).toContain("SAR");
    // The same caption is fine for a store that sells in riyals, or when the store is not known.
    expect(
      buildDraft(post("السعر 100 ريال سعودي"), ai({ price: 100 }), { storeCurrency: "sar" }).price,
    ).toBe(100);
    expect(buildDraft(post("السعر 100 ريال سعودي"), ai({ price: 100 })).price).toBe(100);
    // A bare price word names no currency, so it cannot mismatch.
    expect(buildDraft(post("السعر 28"), ai(), { storeCurrency: "BHD" }).price).toBe(28);
  });
});

describe("the name, the sizes and the rest", () => {
  it("leaves a name the AI could not find empty, and says so, instead of a stand-in that looks ready", () => {
    for (const title of ["", "  ", "ab", undefined]) {
      const draft = buildDraft(post("السعر 28 د.ب"), ai({ title }));
      expect(draft.title).toBe("");
      expect(draft.fieldConfidence.name).toBe(0);
      expect(draft.issues).toContain("missing_title");
    }
    const named = buildDraft(post("x"), ai({ title: "  عباية مرجان " }));
    expect(named.title).toBe("عباية مرجان");
    expect(named.issues).not.toContain("missing_title");
  });

  it("takes the sizes the AI found, else the caption's size line", () => {
    const fromAi = buildDraft(post("المقاسات 50 52"), ai({ sizes: ["54", "56"] }));
    expect(fromAi.sizes).toEqual(["54", "56"]);
    expect(fromAi.fieldConfidence.sizes).toBe(0.8);
    const fromCaption = buildDraft(post("المقاسات: 52 54 56"), ai({ sizes: [] }));
    expect(fromCaption.sizes).toEqual(["52", "54", "56"]);
    expect(fromCaption.fieldConfidence.sizes).toBe(0.75);
    const none = buildDraft(post("عباية"), ai({ sizes: [] }));
    expect(none.sizes).toEqual([]);
  });

  it("works with nothing from the AI at all", () => {
    const draft = buildDraft(post("المقاسات 52-56\nالسعر ٢٨ د.ب"), undefined);
    expect(draft).toMatchObject({
      title: "",
      price: 28,
      sizes: ["52", "54", "56"],
      category: null,
    });
    expect(draft.issues).toContain("missing_title");
  });

  it("reports the state of the pictures, and keeps the post's own fields", () => {
    const failed = buildDraft(
      post("x", {
        images: [{ url: "1.jpg", r2Url: null, isCover: true, status: "failed" }],
        isSoldOut: true,
      }),
      ai(),
    );
    expect(failed.imageUploadStatus).toBe("failed");
    expect(failed.issues).toContain("image_upload_failed");
    expect(failed.isSoldOut).toBe(true);
    const partial = buildDraft(
      post("x", {
        images: [
          { url: "1.jpg", r2Url: "r2/1.jpg", isCover: true, status: "success" },
          { url: "2.jpg", r2Url: null, isCover: false, status: "failed" },
        ],
      }),
      ai(),
    );
    expect(partial.imageUploadStatus).toBe("partial_success");
    expect(buildDraft(post("x"), ai()).id).toBe("p1");
  });
});

describe("the old price through editing and merging", () => {
  const reduced = () => buildDraft(post("كان 40 د.ب الآن 30 د.ب"), ai({ price: 30 }));

  it("is dropped when the merchant types a price at or above it, kept for a lower one", () => {
    const [kept] = editDraftField([reduced()], "p1", "price", 25);
    expect(kept.originalPrice).toBe(40);
    const [dropped] = editDraftField([reduced()], "p1", "price", 40);
    expect(dropped.originalPrice).toBeNull();
    const [cleared] = editDraftField([reduced()], "p1", "price", null);
    expect(cleared.originalPrice).toBeNull();
    expect(cleared.price).toBeNull();
    // An emptied price is not one the merchant vouches for.
    expect(cleared.fieldSources.price).toBe("ai");
    expect(cleared.fieldConfidence.price).toBe(0);
    expect(cleared.issues).toContain("missing_price");
  });

  it("goes with the price when a merge takes the price from another post", () => {
    const lead = { ...buildDraft(post("عباية"), ai({ price: null, title: "عباية" })), id: "a" };
    const donor = { ...reduced(), id: "b" };
    const [merged] = mergeDrafts([lead, donor], new Set(["a", "b"]));
    expect(merged.price).toBe(30);
    expect(merged.originalPrice).toBe(40);
  });
});
