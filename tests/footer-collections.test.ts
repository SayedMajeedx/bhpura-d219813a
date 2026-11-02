import { describe, expect, it } from "vitest";
import { footerCollections } from "../src/features/storefront-shell/lib/footer-collections";

const row = (
  slug: string,
  name_en: string,
  name_ar: string | null = null,
  parent_id: string | null = null,
) => ({
  slug,
  name_en,
  name_ar,
  parent_id,
});

describe("footerCollections: the footer's new arrivals and sale follow the store's categories", () => {
  it("links the store's own categories, by their own address and name", () => {
    const shown = footerCollections(
      [
        row("abayas", "Abayas", "عبايات"),
        row("new-arrivals", "New in", "وصل حديثاً"),
        row("sale", "Sale", "تنزيلات"),
      ],
      true,
    );
    expect(shown).toEqual([
      { slug: "new-arrivals", name: "وصل حديثاً", sale: false },
      { slug: "sale", name: "تنزيلات", sale: true },
    ]);
  });

  it("leaves out a category the store paused (it is not among the active ones)", () => {
    const shown = footerCollections([row("new-arrivals", "New in", "وصل حديثاً")], true);
    expect(shown.map((c) => c.slug)).toEqual(["new-arrivals"]);
    expect(footerCollections([], false)).toEqual([]);
  });

  it("knows a sale by its names when its address is the store's own word", () => {
    const shown = footerCollections([row("tanzilat", "Offers", "عروض")], false);
    expect(shown).toEqual([{ slug: "tanzilat", name: "Offers", sale: true }]);
  });

  it("never takes a sub-category or an ordinary category", () => {
    expect(
      footerCollections([row("sale", "Sale", null, "p1"), row("dresses", "Dresses")], false),
    ).toEqual([]);
  });
});
