import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { displayFont, STUDIO_FONTS } from "../src/features/content-studio/engine/fonts";
import { useStoreFonts } from "../src/features/content-studio/hooks/use-store-fonts";
import { readDraftSettings } from "../src/features/content-studio/lib/drafts";
import { resolveStorefrontTypography } from "../src/lib/typography";

// Headlines in the store's own fonts: the same typography the storefront
// shows, loaded before a frame uses it, and kept with a draft.

describe("displayFont", () => {
  it("uses the studio's faces unless the store's are given, which then lead", () => {
    expect(displayFont("en")).toBe(STUDIO_FONTS.displayLatin);
    expect(displayFont("ar", null)).toBe(STUDIO_FONTS.displayArabic);
    const families = { en: "Plus Jakarta Sans", ar: '29LT "Azer"' };
    expect(displayFont("en", families)).toBe(`"Plus Jakarta Sans", ${STUDIO_FONTS.displayLatin}`);
    // Quotes in a family name never break the canvas font string.
    expect(displayFont("ar", families)).toBe(`"29LT Azer", ${STUDIO_FONTS.displayArabic}`);
  });
});

describe("resolveStorefrontTypography (shared with the storefront)", () => {
  it("lets the simple font pickers set the text, and the headings unless the store chose its own", () => {
    // No heading font of its own: headings follow the picked text font.
    const plain = resolveStorefrontTypography({
      storefront_font_en: "Plus Jakarta Sans",
      storefront_font_ar: "Readex Pro",
    });
    expect(plain.body.ar.family).toBe("Readex Pro");
    expect(plain.display.ar.family).toBe("Readex Pro");
    expect(plain.display.en.family).toBe("Plus Jakarta Sans");
  });

  it("shows the heading fonts a store chose (Pura's 29LT Azer and its uploaded face)", () => {
    const url = "https://media.boutq.store/brands/b/font/heading.bin";
    const pura = resolveStorefrontTypography({
      storefront_font_en: "Plus Jakarta Sans",
      storefront_font_ar: "Readex Pro",
      storefront_typography: {
        body: { ar: { family: "Readex Pro", url: null }, en: { family: "Plus Jakarta Sans" } },
        display: {
          ar: { family: "29LT Azer", url: null },
          en: { family: "Custom — English", url },
        },
      },
    });
    expect(pura.body.ar.family).toBe("Readex Pro");
    expect(pura.display.ar.family).toBe("29LT Azer");
    expect(pura.display.en.url).toBe(url);
  });

  it("follows the text font when the saved heading is the text font, or cannot load", () => {
    const same = resolveStorefrontTypography({
      storefront_font_ar: "Readex Pro",
      storefront_typography: {
        body: { ar: { family: "Tajawal", url: null } },
        display: { ar: { family: "Tajawal", url: null } },
      },
    });
    // Saved equal to the text font: it follows the picker that moved on since.
    expect(same.display.ar.family).toBe("Readex Pro");
    const unknown = resolveStorefrontTypography({
      storefront_font_ar: "Readex Pro",
      storefront_typography: { display: { ar: { family: "A Font Nobody Loads", url: null } } },
    });
    expect(unknown.display.ar.family).toBe("Readex Pro");
  });

  it("falls back to the storefront's defaults", () => {
    const typography = resolveStorefrontTypography(null);
    expect(typography.body.en.family).toBe("Inter");
    expect(typography.body.ar.family).toBe("Tajawal");
  });
});

describe("useStoreFonts", () => {
  afterEach(() => {
    Reflect.deleteProperty(document, "fonts");
    document.head
      .querySelectorAll("[data-studio-font],[data-studio-fonts]")
      .forEach((el) => el.remove());
  });
  const fontsApi = () => {
    const load = vi.fn(async () => []);
    Object.defineProperty(document, "fonts", { configurable: true, value: { load } });
    return load;
  };
  const settings = { storefront_font_en: "Plus Jakarta Sans", storefront_font_ar: "Readex Pro" };

  it("hands over nothing until asked, and names the store's fonts", () => {
    const load = fontsApi();
    const { result } = renderHook(() => useStoreFonts(settings, false));
    expect(result.current.storeFamilies).toBeNull();
    expect(result.current.storeFontsLabel).toBe("Readex Pro · Plus Jakarta Sans");
    expect(load).not.toHaveBeenCalled();
  });

  it("loads the faces first, then hands them over", async () => {
    const load = fontsApi();
    const { result } = renderHook(() => useStoreFonts(settings, true));
    await waitFor(() =>
      expect(result.current.storeFamilies).toEqual({ en: "Plus Jakarta Sans", ar: "Readex Pro" }),
    );
    expect(load).toHaveBeenCalledWith('600 64px "Plus Jakarta Sans"');
    expect(load).toHaveBeenCalledWith('600 64px "Readex Pro"');
  });

  it("registers an uploaded display font under its own name, and Google faces by stylesheet", async () => {
    fontsApi();
    const { result } = renderHook(() =>
      useStoreFonts(
        {
          storefront_typography: {
            display: {
              en: { family: "Custom — Brand", url: "https://media.example/brand.woff2" },
              ar: { family: "Amiri", url: null },
            },
            body: {
              en: { family: "Custom — Brand", url: "https://media.example/brand.woff2" },
              ar: { family: "Amiri", url: null },
            },
          },
        },
        true,
      ),
    );
    await waitFor(() => expect(result.current.storeFamilies?.en).toBe("BoutqStudioDisplayEn"));
    expect(
      document.head.querySelector('style[data-studio-font="BoutqStudioDisplayEn"]')?.textContent,
    ).toContain("https://media.example/brand.woff2");
    expect(document.head.querySelector("link[data-studio-fonts]")?.getAttribute("href")).toContain(
      "family=Amiri",
    );
  });
});

describe("drafts", () => {
  it("keep the headline font, the studio's by default", () => {
    expect(readDraftSettings({ headlineFont: "store" }).headlineFont).toBe("store");
    expect(readDraftSettings({}).headlineFont).toBe("studio");
    expect(readDraftSettings({ headlineFont: "comic" }).headlineFont).toBe("studio");
  });
});
