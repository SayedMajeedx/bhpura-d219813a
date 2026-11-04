import { describe, expect, it, vi } from "vitest";
import { contrastRatio } from "../src/features/content-studio/lib/studio-styles";
import {
  ALL_DESIGNS,
  DEFAULT_DESIGN,
  isLightPaper,
  lightTint,
  palette,
  TONES,
  type CardDesign,
} from "../src/features/gift-card-design/lib/design";
import { cardFront } from "../src/features/gift-card-design/lib/front";
import { cardBack } from "../src/features/gift-card-design/lib/back";
import type { CardContent } from "../src/features/gift-card-design/lib/content";
import { CARD_OCCASIONS } from "../src/features/gift-card-design/lib/occasions";
import { cardSize } from "../src/features/gift-card-design/lib/geometry";
import { roughMeasure } from "../src/features/gift-card-design/lib/type";
import { MOST_DEEP_FIELD, printCoverage } from "../src/features/gift-card-design/lib/print-safe";

// Every gift card prints well on any printer (the owner's report of 2026-11-04: the black and
// store-colour cards came out streaked, faded and uneven on a shop's printer). Whatever the
// store's colour, every design, occasion, orientation and language is printed on light paper,
// its colour in lines, letters and small marks; a photograph sits inside the paper's margin.

vi.setConfig({ testTimeout: 60_000 });

const STORE_COLOURS = [
  { accent: "#3f121a", background: "#ffffff", text: "#1a1a1a" }, // Pura's burgundy
  { accent: "#000000", background: "#ffffff", text: "#000000" }, // a black brand
  { accent: "#f2c200", background: "#fffdf5", text: "#2a2a2a" }, // a bright yellow
  { accent: "#ffffff", background: "#ffffff", text: null }, // a white one
  { accent: "#0f5132", background: "#ffffff", text: "#111111" }, // a deep green
];

const content = (primary: "ar" | "en"): CardContent => ({
  storeName: { ar: "بيورا لاين", en: "Pura Line" },
  logo: null,
  photo: "https://media.test/abaya.jpg",
  amount: 50,
  currency: "BHD",
  code: "K7QM-4XHR-92TP",
  to: "Noura",
  message: "Happy Eid",
  expiresOn: "2027-10-31",
  storeLink: "pura.boutq.store",
  kind: "fashion",
  primary,
});

describe("a card prints on light paper", () => {
  it("every tone's paper is light enough for any printer, and its ink reads on it", () => {
    for (const colours of STORE_COLOURS) {
      for (const tone of TONES) {
        const p = palette(tone, colours);
        expect(isLightPaper(p.ground), `${tone} ${colours.accent}`).toBe(true);
        expect(isLightPaper(p.tint), `${tone} ${colours.accent} tint`).toBe(true);
        expect(contrastRatio(p.ink, p.ground)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(p.ink, p.tint)).toBeGreaterThanOrEqual(4.5);
      }
    }
    // The light field takes as much of the store's colour as stays light.
    expect(isLightPaper(lightTint("#3f121a"))).toBe(true);
    expect(lightTint("#3f121a")).not.toBe("#ffffff");
  });

  it("no design lays down a deep field, and a photograph stays inside the paper's margin", () => {
    const occasions = CARD_OCCASIONS.map((o) => o.id);
    for (const colours of STORE_COLOURS) {
      for (const id of ALL_DESIGNS) {
        for (const orientation of ["portrait", "landscape"] as const) {
          for (const language of ["ar", "en", "both"] as const) {
            for (const occasion of occasions) {
              const design: CardDesign = {
                ...DEFAULT_DESIGN,
                design: id,
                orientation,
                language,
                occasion,
              };
              const size = cardSize(orientation);
              const c = content(language === "en" ? "en" : "ar");
              for (const [side, shapes] of [
                ["front", cardFront(design, c, colours, roughMeasure)],
                ["back", cardBack(design, c, colours, roughMeasure)],
              ] as const) {
                const cover = printCoverage(shapes, size);
                const where = `${id} ${orientation} ${language} ${occasion} ${side} ${colours.accent}`;
                expect(cover.deepField, where).toBeLessThanOrEqual(MOST_DEEP_FIELD);
                expect(cover.photoBleeds, where).toBe(false);
                expect(cover.photo, where).toBeLessThanOrEqual(0.62);
              }
            }
          }
        }
      }
    }
  });

  it("would catch the old black card", () => {
    const size = cardSize("portrait");
    expect(
      printCoverage(
        [{ kind: "rect", x: -3, y: -3, w: size.w + 6, h: size.h + 6, fill: "#171615" }],
        size,
      ).deepField,
    ).toBe(1);
    expect(
      printCoverage([{ kind: "image", href: "x", x: -3, y: -3, w: size.w + 6, h: 80 }], size)
        .photoBleeds,
    ).toBe(true);
  });
});
