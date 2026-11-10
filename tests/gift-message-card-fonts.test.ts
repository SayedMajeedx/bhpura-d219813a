import { describe, expect, it } from "vitest";
import { cardBack } from "../src/features/gift-card-design/lib/back";
import { cardFontFiles, storeCardFonts } from "../src/features/gift-card-design/lib/card-fonts";
import { cardContent, type LogoInfo } from "../src/features/gift-card-design/lib/content";
import { DEFAULT_DESIGN } from "../src/features/gift-card-design/lib/design";
import type { Shape } from "../src/features/gift-card-design/lib/geometry";
import { roughMeasure } from "../src/features/gift-card-design/lib/type";
import { defaultStorefrontTypography, resolveStorefrontTypography } from "../src/lib/typography";
import { cardLanguage } from "../src/features/gift-cards/components/GiftMessageCard";

// A gift message card is set in the store's own heading fonts, each line in its own language's
// face, and wears the store's mark large at its top (the owner's report of 2026-11-10: the
// message read in a face the store does not use, and the mark was small).

const ORIGIN = "https://boutq.store";
// Pura's settings as they are: headings in 29LT Bukra (Arabic) and Plus Jakarta Sans.
const PURA = resolveStorefrontTypography({
  storefront_font_ar: "Readex Pro",
  storefront_font_en: "Plus Jakarta Sans",
  storefront_typography: {
    display: {
      ar: { family: "29LT Bukra", url: null },
      en: { family: "Plus Jakarta Sans", url: null },
    },
  },
});

const COLOURS = { accent: "#330a0a", background: "#ffffff", text: "#0a0a0a" };
const logo: LogoInfo = {
  href: "https://media.test/logo.svg",
  aspect: 2.1,
  crop: { x: 0, y: 0, w: 1, h: 1 },
};
const kit = (storeFonts: { ar: string | null; en: string | null }) => ({
  storeName: { ar: "بيورا لاين", en: "Pura Line" },
  logo,
  logoScale: 1.8,
  fonts: { ar: null, en: null },
  storeFonts,
  photos: [],
  currency: "BHD",
  storeLink: "pura.boutq.store",
  kind: "fashion" as const,
});
const details = (purpose?: "message") => ({
  amount: null,
  code: null,
  to: null,
  message: "اللبس من لبّاسه، وما تلوق إلا عليج",
  expiresOn: null,
  purpose,
});

describe("the store's fonts on a gift message card", () => {
  it("are the fonts its storefront sets its headings in, as files the print page can load", () => {
    expect(storeCardFonts(PURA, ORIGIN)).toEqual({
      ar: "https://boutq.store/fonts/bukramed.woff2",
      en: "https://boutq.store/fonts/variable/plus-jakarta-sans-wght.woff2",
    });
    // An uploaded font keeps its own address; a font with no file the card can load is left out.
    expect(
      storeCardFonts(
        {
          ...defaultStorefrontTypography(),
          display: {
            ar: { family: "My Font", url: "https://media.test/f.woff2" },
            en: { family: "Lobster", url: null },
          },
        },
        ORIGIN,
      ),
    ).toEqual({ ar: "https://media.test/f.woff2", en: null });
  });

  it("set a message card only: a gift card keeps the cards' own faces", () => {
    const store = storeCardFonts(PURA, ORIGIN);
    expect(cardFontFiles({ fonts: { ar: null, en: null }, storeFonts: store }, undefined)).toEqual({
      ar: null,
      en: null,
    });
    expect(cardFontFiles({ fonts: { ar: null, en: null }, storeFonts: store }, "message")).toEqual(
      store,
    );
    // A store's own card fonts, when it uploaded them, come first.
    expect(
      cardFontFiles(
        { fonts: { ar: "https://media.test/card.woff2", en: null }, storeFonts: store },
        "message",
      ).ar,
    ).toBe("https://media.test/card.woff2");
  });

  it("set the Arabic message in the store's Arabic face, even on a card whose labels are English", () => {
    const content = cardContent(kit(storeCardFonts(PURA, ORIGIN)), null, details("message"), "en");
    const back = cardBack(
      { ...DEFAULT_DESIGN, language: "en", from: "Eman" },
      content,
      COLOURS,
      roughMeasure,
    );
    const text = (needle: RegExp) =>
      back.find(
        (s): s is Extract<Shape, { kind: "text" }> => s.kind === "text" && needle.test(s.text),
      );
    expect(text(/اللبس/)?.font.family).toContain(content.fonts?.ar ?? "missing");
    expect(text(/Eman/)?.font.family).toContain(content.fonts?.en ?? "missing");
  });

  it("wear the store's mark large at the top of the back", () => {
    const content = cardContent(kit({ ar: null, en: null }), null, details("message"), "ar");
    const mark = cardBack({ ...DEFAULT_DESIGN }, content, COLOURS, roughMeasure).find(
      (s) => s.kind === "logo",
    );
    expect(mark && mark.kind === "logo" ? mark.w : 0).toBeGreaterThan(20);
  });
});

describe("a gift message card's language", () => {
  it("is the message's, whatever the screen's", () => {
    expect(cardLanguage({ recipient: null, message: "اللبس من لبّاسه" }, "en")).toBe("ar");
    expect(cardLanguage({ recipient: "Sara", message: null }, "ar")).toBe("en");
    expect(cardLanguage({ recipient: null, message: null }, "en")).toBe("en");
  });
});
