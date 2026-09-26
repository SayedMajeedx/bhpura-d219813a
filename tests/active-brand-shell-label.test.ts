import { describe, expect, it } from "vitest";
import { pickActiveBrand, resolveWorkspace, workspaceLabel } from "../src/lib/admin-workspace";

const pura = { id: "b1", slug: "pura", name_en: "Pura", name_ar: "بورا" };
const lulu = { id: "b2", slug: "lulu", name_en: "Lulu", name_ar: null };

describe("active brand shell label", () => {
  it("resolves the displayed brand from the active route slug, case-insensitively", () => {
    const brand = pickActiveBrand({
      isPlatformMode: false,
      activeSlug: "PURA",
      brands: [lulu, pura],
      profileBrand: lulu,
    });
    expect(brand).toBe(pura);
    expect(
      workspaceLabel({
        brand,
        activeSlug: "PURA",
        isPlatformMode: false,
        lang: "ar",
        appTitle: "Boutq",
      }),
    ).toBe("بورا");
  });

  it("does not fall back to the profile brand when another route brand is open", () => {
    // A brand member browsing another brand's URL before the list has loaded.
    expect(
      pickActiveBrand({
        isPlatformMode: false,
        activeSlug: "pura",
        brands: [],
        profileBrand: lulu,
      }),
    ).toBeUndefined();
    // Their own brand is used when it is the one in the URL.
    expect(
      pickActiveBrand({
        isPlatformMode: false,
        activeSlug: "lulu",
        brands: [],
        profileBrand: lulu,
      }),
    ).toBe(lulu);
  });

  it("names the brand in the UI language, then English, then its slug", () => {
    const label = (brand: typeof lulu | undefined, lang: "ar" | "en") =>
      workspaceLabel({ brand, activeSlug: "lulu", isPlatformMode: false, lang, appTitle: "Boutq" });
    expect(label(lulu, "en")).toBe("Lulu");
    expect(label(lulu, "ar")).toBe("Lulu");
    expect(label(undefined, "en")).toBe("lulu");
  });

  it("keeps the super-admin platform workspace tenant-free", () => {
    const workspace = resolveWorkspace({
      urlSlug: null,
      isSuperAdmin: true,
      profileBrandSlug: "pura",
    });
    expect(workspace).toEqual({ isPlatformMode: true, activeSlug: null });
    expect(pickActiveBrand({ ...workspace, brands: [pura], profileBrand: pura })).toBeUndefined();
    const label = (lang: "ar" | "en") =>
      workspaceLabel({ brand: undefined, ...workspace, lang, appTitle: "Boutq" });
    expect(label("ar")).toBe("إدارة منصة بوتيك");
    expect(label("en")).toBe("Boutq Platform");
  });

  it("opens a super admin's impersonated brand from the URL, and a member's own brand without one", () => {
    expect(
      resolveWorkspace({ urlSlug: "lulu", isSuperAdmin: true, profileBrandSlug: "pura" }),
    ).toEqual({ isPlatformMode: false, activeSlug: "lulu" });
    expect(
      resolveWorkspace({ urlSlug: null, isSuperAdmin: false, profileBrandSlug: "pura" }),
    ).toEqual({ isPlatformMode: false, activeSlug: "pura" });
  });
});
