import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { hasProductPhoto, productCover, storeInitials } from "../src/lib/product-photo";
import { catalogCount, shownOfTotal } from "../src/lib/catalog-count";
import { lengthUnitLabel, passportTitle } from "../src/addons/fit-passport/lib/fit-passport";
import { storeNameHeadlineNote } from "../src/lib/hero-headline";

// The storefront polish found on Pura, ZH and Habybee's phones (2026-10-24): a grey "no image" box
// in the rails, "12 منتجات" beside "عرض 12 من أصل 12 منتج", "بيورا لاين Passport" on an Arabic
// page, and a hero headline that only said "ZH".

const storefront = {
  useStorefront: () => ({
    brand: { slug: "pura", name_ar: "بيورا لاين", name_en: "Pura Line", logo_url: null },
    lang: "en",
  }),
  pickName: (lang: string, p: { name_ar?: string | null; name_en?: string | null }) =>
    (lang === "ar" ? p.name_ar || p.name_en : p.name_en || p.name_ar) ?? "",
};
vi.mock("../src/lib/storefront-context", () => storefront);
vi.mock("@/lib/storefront-context", () => storefront);

const { ProductPhotoPlaceholder } =
  await import("../src/components/storefront/ProductPhotoPlaceholder");

describe("a product's photo", () => {
  it("is its main picture, else its gallery's first picture, else a size's", () => {
    expect(productCover({ image_url: "main.jpg", media: [{ type: "image", url: "g.jpg" }] })).toBe(
      "main.jpg",
    );
    expect(
      productCover({
        image_url: " ",
        media: [
          { type: "video", url: "v.mp4" },
          { type: "image", url: "g.jpg" },
        ],
      }),
    ).toBe("g.jpg");
    expect(productCover({ image_url: null, product_variants: [{}, { image_url: "s.jpg" }] })).toBe(
      "s.jpg",
    );
  });

  it("is missing when nothing holds a picture (a video alone is not one)", () => {
    expect(hasProductPhoto({ image_url: null, media: [{ type: "video", url: "v.mp4" }] })).toBe(
      false,
    );
    expect(hasProductPhoto(null)).toBe(false);
  });

  it("is stood in for by the store's initials, never 'No image'", () => {
    render(<ProductPhotoPlaceholder />);
    expect(screen.getByText("PL")).toBeTruthy();
    expect(screen.queryByText(/no image|لا توجد صورة/i)).toBeNull();
    expect(storeInitials("  zh  ")).toBe("Z");
    expect(storeInitials("بيورا لاين")).toBe("بل");
  });
});

describe("a list's count", () => {
  it("counts as Arabic counts", () => {
    const ar = { lang: "ar" as const };
    expect(catalogCount(1, ar)).toBe("منتج واحد");
    expect(catalogCount(2, ar)).toBe("منتجان");
    expect(catalogCount(3, ar)).toBe("3 منتجات");
    expect(catalogCount(12, ar)).toBe("12 منتجًا");
    expect(catalogCount(33, ar)).toBe("33 منتجًا");
    expect(catalogCount(0, ar)).toBe("لا منتجات");
    expect(catalogCount(11, { ...ar, services: true })).toBe("11 خدمة");
    expect(catalogCount(1, { lang: "en" })).toBe("1 product");
    expect(catalogCount(4, { lang: "en", services: true })).toBe("4 services");
  });

  it("says what a filter left of the whole only while it hides some", () => {
    expect(shownOfTotal(12, 12, { lang: "ar" })).toBe("12 منتجًا");
    expect(shownOfTotal(8, 12, { lang: "ar" })).toBe("8 من 12");
    expect(shownOfTotal(8, 12, { lang: "en" })).toBe("8 of 12 products");
  });
});

describe("the fit passport's words", () => {
  it("are the reader's language", () => {
    expect(passportTitle("بيورا لاين", "ar")).toBe("جواز مقاسات بيورا لاين");
    expect(passportTitle("Pura Line", "en")).toBe("Pura Line Fit Passport");
    expect(passportTitle(null, "ar")).toBe("جواز المقاسات");
    expect(lengthUnitLabel("in", "ar")).toBe("إنش");
    expect(lengthUnitLabel("cm", "ar")).toBe("سم");
    expect(lengthUnitLabel("in", "en")).toBe("in");
  });
});

describe("a hero headline that is only the store's name", () => {
  const names = ["زد إتش", "ZH"];

  it("gets a note in the slide's settings", () => {
    expect(storeNameHeadlineNote({ title_ar: "ZH" }, names, "ar")).toMatch(/اسم المتجر/);
    expect(storeNameHeadlineNote({ phrases_en: ["  zh "] }, names, "en")).toMatch(/store's name/);
  });

  it("in either language", () => {
    expect(
      storeNameHeadlineNote(
        { phrases_ar: ["عبايات الشتاء وصلت"], phrases_en: ["ZH"] },
        names,
        "ar",
      ),
    ).toMatch(/اسم المتجر/);
  });

  it("gets none when it says something else", () => {
    expect(storeNameHeadlineNote({ phrases_ar: ["عبايات الشتاء وصلت"] }, names, "ar")).toBeNull();
    expect(storeNameHeadlineNote({ title_ar: "ZH" }, [], "ar")).toBeNull();
  });
});
