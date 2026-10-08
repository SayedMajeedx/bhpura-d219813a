import { describe, expect, it } from "vitest";
import type { InstagramProductDraft } from "../src/lib/instagram-ai-importer";
import {
  editDraftField,
  markImageRehosted,
  selectAllDraftImages,
  setDraftCover,
  toggleDraftImage,
} from "../src/features/instagram-import/lib/draft-edits";

// The review screen's edits to a draft, as plain functions of the list.

const image = (n: number, over: Partial<InstagramProductDraft["images"][number]> = {}) => ({
  url: `https://cdn.test/${n}.jpg`,
  r2Url: `https://r2.test/${n}.jpg`,
  isCover: false,
  selected: true,
  status: "success" as const,
  ...over,
});

function draft(id: string, over: Partial<InstagramProductDraft> = {}): InstagramProductDraft {
  return {
    id,
    url: `https://instagram.com/p/${id}/`,
    isSoldOut: false,
    postType: "carousel",
    images: [image(1, { isCover: true }), image(2), image(3)],
    coverImageUrl: "https://r2.test/1.jpg",
    imageUploadStatus: "all_success",
    title: "",
    price: null,
    description: "",
    sizes: [],
    colors: [],
    category: null,
    fieldConfidence: { name: 0.4, price: 0.2, description: 0, sizes: 0 },
    fieldSources: { name: "ai", price: "ai", description: "ai", sizes: "ai", category: "ai" },
    priceConflict: { geminiPrice: 20, regexPrice: 30, reason: "conflict" },
    issues: ["missing_price", "price_conflict", "unverified_price"],
    ...over,
  };
}

const other = draft("other");

describe("editDraftField", () => {
  it("marks a typed price as hand-written and certain, and clears the price warnings", () => {
    const [edited, untouched] = editDraftField([draft("a"), other], "a", "price", 28);
    expect(edited).toMatchObject({
      price: 28,
      fieldSources: { price: "manual", name: "ai" },
      fieldConfidence: { price: 1, name: 0.4 },
      priceConflict: undefined,
      issues: ["unverified_price"],
    });
    expect(untouched).toBe(other);
  });

  it("maps the title to the name's confidence, and leaves the price warnings for other fields", () => {
    const [edited] = editDraftField([draft("a")], "a", "title", "عباية مرجان");
    expect(edited).toMatchObject({
      title: "عباية مرجان",
      fieldSources: { name: "manual" },
      fieldConfidence: { name: 1, price: 0.2 },
    });
    expect(edited.issues).toEqual(["missing_price", "price_conflict", "unverified_price"]);
    expect(edited.priceConflict).toBeDefined();
  });

  it("edits sizes, category and description the same way", () => {
    const [edited] = editDraftField([draft("a")], "a", "sizes", ["52", "54"]);
    expect(edited.sizes).toEqual(["52", "54"]);
    expect(edited.fieldSources.sizes).toBe("manual");
    expect(editDraftField([draft("a")], "a", "category", "عبايات")[0].category).toBe("عبايات");
    expect(editDraftField([draft("a")], "a", "description", "قماش")[0].description).toBe("قماش");
  });
});

describe("pictures", () => {
  it("makes a picture the cover and ticks it", () => {
    const base = draft("a", {
      images: [image(1, { isCover: true }), image(2, { selected: false }), image(3)],
    });
    const [edited] = setDraftCover([base], "a", 1);
    expect(edited.images.map((i) => i.isCover)).toEqual([false, true, false]);
    expect(edited.images[1].selected).toBe(true);
    expect(edited.coverImageUrl).toBe("https://r2.test/2.jpg");
  });

  it("hands the cover on when the cover is unticked, and brings it back when ticked again", () => {
    const [unticked] = toggleDraftImage([draft("a")], "a", 0);
    expect(unticked.images[0].selected).toBe(false);
    expect(unticked.images.map((i) => i.isCover)).toEqual([false, true, false]);
    expect(unticked.coverImageUrl).toBe("https://r2.test/2.jpg");
    const [ticked] = toggleDraftImage([unticked], "a", 0);
    expect(ticked.images[0].selected).toBe(true);
    expect(ticked.images[1].isCover).toBe(true);
  });

  it("ignores a picture that does not exist", () => {
    const list = [draft("a")];
    expect(toggleDraftImage(list, "a", 9)[0]).toBe(list[0]);
  });

  it("ticks all pictures with a cover, or none and no cover", () => {
    const [none] = selectAllDraftImages([draft("a")], "a", false);
    expect(none.images.every((i) => i.selected === false && !i.isCover)).toBe(true);
    const [all] = selectAllDraftImages([none], "a", true);
    expect(all.images.every((i) => i.selected)).toBe(true);
    expect(all.images.map((i) => i.isCover)).toEqual([true, false, false]);
    expect(all.coverImageUrl).toBe("https://r2.test/1.jpg");
  });
});

describe("markImageRehosted", () => {
  const failed = draft("a", {
    images: [
      image(1, { isCover: true }),
      image(2, { r2Url: null, status: "failed", selected: false, errorMessage: "x" }),
    ],
    imageUploadStatus: "partial_success",
    coverImageUrl: "",
    issues: ["image_upload_failed", "missing_price"],
  });

  it("ticks the picture that was fixed, so it is not silently left out of the product", () => {
    const [fixed] = markImageRehosted(
      [failed],
      "a",
      "https://cdn.test/2.jpg",
      "https://r2.test/2b.jpg",
    );
    expect(fixed.images[1]).toMatchObject({
      status: "success",
      selected: true,
      r2Url: "https://r2.test/2b.jpg",
      errorMessage: undefined,
    });
    expect(fixed.imageUploadStatus).toBe("all_success");
    expect(fixed.issues).toEqual(["missing_price"]);
    expect(fixed.coverImageUrl).toBe("https://r2.test/2b.jpg");
  });

  it("stays partial while another picture is still failed", () => {
    const two = draft("a", {
      images: [
        image(1, { r2Url: null, status: "failed", selected: false }),
        image(2, { r2Url: null, status: "failed", selected: false }),
      ],
      imageUploadStatus: "failed",
    });
    const [fixed] = markImageRehosted(
      [two],
      "a",
      "https://cdn.test/1.jpg",
      "https://r2.test/1.jpg",
    );
    expect(fixed.imageUploadStatus).toBe("partial_success");
  });
});
