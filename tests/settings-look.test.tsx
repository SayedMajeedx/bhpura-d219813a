import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// A store's fonts had three owners and its heading font none (found 2026-10-15): the palette's
// font cards and the Typography group both set the fonts, a card promising a heading font and a
// text font wrote one font for both, and the simple pickers took the headings too, so the heading
// fonts Pura chose (29LT Azer, an uploaded English face) never showed. Fonts are now set in the
// Typography group alone, a chosen heading font that can load is shown, and the look is sampled
// live with the storefront's own theme.

const form = vi.hoisted(() => ({
  bs: {} as Record<string, unknown>,
  setBs: vi.fn(),
  patchBs: vi.fn(),
}));
const formModule = async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  useBrandSettingsFormContext: () => ({
    form: { bs: form.bs, brand: { id: "b1", slug: "pura", name_en: "Pura", name_ar: "بيورا" } },
    bs: form.bs,
    setBs: form.setBs,
    patchBs: form.patchBs,
    brandId: "b1",
  }),
});
vi.mock("../src/features/settings/use-brand-settings-form", (io) => formModule(io));
vi.mock("@/features/settings/use-brand-settings-form", (io) => formModule(io));

const { FONT_PAIRS, activePair, fontPatch, headingChoice, pairPatch, shownFonts } =
  await import("../src/features/settings/tabs/identity/font-choices");
const { fontCanLoad } = await import("../src/lib/typography");
const { STOREFRONT_AR_FONTS, STOREFRONT_EN_FONTS } =
  await import("../src/features/settings/tabs/identity/TypographyAdvancedControls");
const { FontPickers } = await import("../src/features/settings/tabs/identity/FontPickers");
const { LookSample } = await import("../src/features/settings/tabs/identity/LookSample");
const { PaletteGroup } = await import("../src/features/settings/tabs/identity/PaletteGroup");
const { I18nProvider } = await import("../src/lib/i18n");

const pura = {
  storefront_font_ar: "Readex Pro",
  storefront_font_en: "Plus Jakarta Sans",
  storefront_typography: {
    body: { ar: { family: "Readex Pro", url: null }, en: { family: "Plus Jakarta Sans" } },
    display: {
      ar: { family: "29LT Azer", url: null },
      en: { family: "Custom — English", url: "https://media.boutq.store/brands/b/font/h.bin" },
    },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem("lang", "en");
  form.bs = {};
});

describe("a store's fonts", () => {
  it("offer only fonts the storefront can load", () => {
    const families = [
      ...STOREFRONT_AR_FONTS,
      ...STOREFRONT_EN_FONTS,
      ...FONT_PAIRS.flatMap((pair) => [
        pair.heading.ar,
        pair.heading.en,
        pair.text.ar,
        pair.text.en,
      ]),
    ];
    for (const family of families) expect(fontCanLoad({ family, url: null })).toBe(true);
    expect(fontCanLoad({ family: "A Font Nobody Loads", url: null })).toBe(false);
  });

  it("read as the storefront reads them: Pura's own heading fonts, its picked text font", () => {
    expect(shownFonts(pura).heading.ar.family).toBe("29LT Azer");
    expect(headingChoice(pura, "ar")).toBe("29LT Azer");
    expect(headingChoice(pura, "en")).toBe("upload");
    expect(headingChoice({ storefront_font_ar: "Tajawal" }, "ar")).toBe("same");
  });

  it("keep a heading that follows the text following it when the text changes", () => {
    const patch = fontPatch({ storefront_font_ar: "Tajawal" }, { text: { ar: "Cairo" } });
    expect(patch).toMatchObject({ storefront_font_ar: "Cairo", storefront_font_ar_url: null });
    const next = {
      storefront_font_ar: "Cairo",
      storefront_typography: patch.storefront_typography,
    };
    expect(headingChoice(next, "ar")).toBe("same");
  });

  it("set a heading font of its own, and back to the text's", () => {
    const own = fontPatch({ storefront_font_ar: "Tajawal" }, { heading: { ar: "Amiri" } });
    expect(shownFonts({ storefront_font_ar: "Tajawal", ...own }).heading.ar.family).toBe("Amiri");
    const back = fontPatch({ storefront_font_ar: "Tajawal", ...own }, { heading: { ar: "same" } });
    expect(headingChoice({ storefront_font_ar: "Tajawal", ...back }, "ar")).toBe("same");
  });

  it("apply a pair as its card says: a heading font and a text font", () => {
    const editorial = FONT_PAIRS.find((pair) => pair.id === "editorial")!;
    const patch = pairPatch({}, editorial);
    expect(patch).toMatchObject({ storefront_font_ar: "Tajawal", storefront_font_en: "Inter" });
    const shown = shownFonts(patch as Record<string, unknown>);
    expect(shown.heading.ar.family).toBe("Amiri");
    expect(shown.text.ar.family).toBe("Tajawal");
    expect(activePair(patch as Record<string, unknown>)).toBe("editorial");
    // Nothing is marked chosen when no pair is what the store shows.
    expect(activePair(pura)).toBeNull();
  });
});

describe("the Typography group's pickers", () => {
  it("apply a pair in one tap and mark it", () => {
    const onChange = vi.fn();
    render(
      <I18nProvider>
        <FontPickers
          bs={{ storefront_font_ar: "Tajawal", storefront_font_en: "Inter" }}
          isAr={false}
          onChange={onChange}
        />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Editorial \/ Luxury/ }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ storefront_font_ar: "Tajawal", storefront_font_en: "Inter" }),
    );
    expect(
      screen.getByLabelText("Heading font", { selector: "#font-heading-ar" }),
    ).toHaveTextContent("Same as the text");
  });
});

describe("the look, sampled live", () => {
  it("wears the storefront's theme: its heading font and colours", () => {
    render(
      <I18nProvider>
        <LookSample
          brand={{ id: "b1", slug: "pura", name_en: "Pura", name_ar: "بيورا" }}
          settings={{ ...pura, heading_color: "#123456", btn_primary_bg: "#654321" }}
          isAr
        />
      </I18nProvider>,
    );
    const sample = screen.getByTestId("look-sample");
    expect(sample.style.getPropertyValue("--font-display")).toMatch(/^"29LT Azer"/);
    expect(sample.style.getPropertyValue("--sf-heading")).toBe("#123456");
    expect(sample.style.getPropertyValue("--sf-btn-primary-bg")).toBe("#654321");
    fireEvent.click(screen.getByRole("button", { name: "EN" }));
    expect(screen.getByTestId("look-sample").style.getPropertyValue("--font-display")).toMatch(
      /^"BoutqDisplayCustom"/,
    );
  });

  it("leaves the palette without fonts", () => {
    form.bs = { ...pura };
    render(
      <I18nProvider>
        <PaletteGroup />
      </I18nProvider>,
    );
    expect(screen.queryByText(/Typography Mood/)).toBeNull();
    expect(screen.getByTestId("look-sample")).toBeInTheDocument();
  });
});
