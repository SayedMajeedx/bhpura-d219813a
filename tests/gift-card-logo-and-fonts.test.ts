import { describe, expect, it } from "vitest";
import { cardFront } from "../src/features/gift-card-design/lib/front";
import { cardBack } from "../src/features/gift-card-design/lib/back";
import {
  cardContent,
  fittedRect,
  placedMark,
  scaledBox,
  type CardContent,
} from "../src/features/gift-card-design/lib/content";
import { DEFAULT_DESIGN, type CardDesign } from "../src/features/gift-card-design/lib/design";
import { cardSize, type Shape } from "../src/features/gift-card-design/lib/geometry";
import { cardSvg } from "../src/features/gift-card-design/lib/svg";
import { cardPrintHtml } from "../src/features/gift-card-design/lib/print";
import { inkBounds } from "../src/features/gift-card-design/lib/canvas";
import { cardFontFamily, roughMeasure } from "../src/features/gift-card-design/lib/type";
import { fontName } from "../src/features/gift-cards/components/CardBrandControls";

// The logo's size and alignment, and the cards' own fonts (the owner's request of 2026-10-31):
// the mark is measured to its own edges, drawn exactly in its rectangle at the store's size,
// standing on (or hanging from) the line it shares with the card's text, never past the margins;
// a store's uploaded font sets the cards' large words in its language, and travels to print.

const COLOURS = { accent: "#3f121a", background: null, text: null };
const LOGO = {
  href: "https://media.test/logo.png",
  aspect: 2.5,
  crop: { x: 0.2, y: 0.3, w: 0.6, h: 0.4 },
};
const content = (over: Partial<CardContent> = {}): CardContent => ({
  storeName: { ar: "بيورا لاين", en: "Pura Line" },
  logo: LOGO,
  photo: "https://media.test/photo.jpg",
  amount: 50,
  currency: "BHD",
  code: "K7QM-4XHR-92TP",
  to: "Noura",
  message: "Happy Eid",
  expiresOn: null,
  storeLink: "pura.boutq.store",
  kind: "fashion",
  primary: "en",
  ...over,
});
const design = (over: Partial<CardDesign> = {}): CardDesign => ({
  ...DEFAULT_DESIGN,
  language: "en",
  ...over,
});
const logos = (shapes: Shape[]) =>
  shapes.filter((s): s is Extract<Shape, { kind: "logo" }> => s.kind === "logo");
const texts = (shapes: Shape[]) =>
  shapes.filter((s): s is Extract<Shape, { kind: "text" }> => s.kind === "text");
const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(0.01);

describe("the store's mark", () => {
  it("is drawn exactly in the shape of its trimmed mark, against its aligned side and edge", () => {
    const box = { x: 10, y: 20, w: 30, h: 8 };
    const rect = fittedRect(box, 2.5, "right", "bottom");
    close(rect.w / rect.h, 2.5);
    close(rect.x + rect.w, 40);
    close(rect.y + rect.h, 28);
    const grown = scaledBox(box, 1.5, "left", "top");
    expect(grown).toEqual({ x: 10, y: 20, w: 45, h: 12 });
    // Never wider than the room it is given.
    expect(scaledBox(box, 2, "center", "middle", 40).w).toBe(40);
  });

  it("stands on the card's foot line at every size, beside the label on the same line", () => {
    for (const id of ["type:cream", "photo:white", "pattern:black", "block:white"] as const) {
      for (const scale of [0.5, 1, 1.4, 2]) {
        const d = design({ design: id });
        const { h } = cardSize(d.orientation);
        const m = Math.min(105, 148) * 0.085;
        const [mark] = logos(cardFront(d, content({ logoScale: scale }), COLOURS, roughMeasure));
        close(mark.y + mark.h, h - m);
        close(mark.w / mark.h, LOGO.aspect);
        expect(mark.crop).toEqual(LOGO.crop);
      }
    }
    const typeFront = cardFront(design({ design: "type:cream" }), content(), COLOURS, roughMeasure);
    const label = texts(typeFront).find((t) => t.text === "GIFT CARD")!;
    const [mark] = logos(typeFront);
    close(label.y, mark.y + mark.h);
  });

  it("grows with the store's size and stops at the margins", () => {
    const at = (scale: number) =>
      logos(
        cardFront(
          design({ design: "signature:brand" }),
          content({ logoScale: scale }),
          COLOURS,
          roughMeasure,
        ),
      )[0];
    expect(at(1.5).w).toBeGreaterThan(at(1).w);
    expect(at(0.6).w).toBeLessThan(at(1).w);
    const m = 105 * 0.085;
    const biggest = at(2);
    expect(biggest.x).toBeGreaterThanOrEqual(m - 0.01);
    expect(biggest.x + biggest.w).toBeLessThanOrEqual(105 - m + 0.01);
  });

  it("hangs from the top margin on the back, the label's capitals from the same line, the words below it", () => {
    for (const scale of [1, 2]) {
      const back = cardBack(design(), content({ logoScale: scale }), COLOURS, roughMeasure);
      const [mark] = logos(back);
      const m = 105 * 0.085;
      close(mark.y, m);
      const label = texts(back).find((t) => t.text === "GIFT CARD")!;
      close(label.y - label.font.size * 0.72, m);
      const to = texts(back).find((t) => t.text === "TO")!;
      expect(to.y).toBeGreaterThan(mark.y + mark.h + 5);
    }
  });

  it("is the store's name, at the same size and on the same line, when its logo cannot be used", () => {
    const placed = placedMark(
      content({ logo: null, logoScale: 1.5 }),
      "en",
      { x: 10, y: 100, w: 30, h: 8 },
      "left",
      "#000",
      roughMeasure,
      "bottom",
    );
    const [word] = texts(placed.shapes);
    expect(word.text).toBe("PURA LINE");
    close(word.y, 108);
    expect(word.x).toBe(10);
  });

  it("is measured to its own edges: a picture's see-through margins are left out", () => {
    // A 10 x 4 picture whose mark fills columns 2-5 of rows 1-2.
    const data = new Uint8ClampedArray(10 * 4 * 4);
    for (let y = 1; y <= 2; y++) for (let x = 2; x <= 5; x++) data[(y * 10 + x) * 4 + 3] = 255;
    expect(inkBounds(data, 10, 4)).toEqual({ x: 0.2, y: 0.25, w: 0.4, h: 0.5 });
    expect(inkBounds(new Uint8ClampedArray(16), 2, 2)).toBeNull();
    const svg = cardSvg(
      logos(cardFront(design(), content(), COLOURS, roughMeasure)),
      cardSize("portrait"),
    );
    expect(svg).toContain('viewBox="0.2 0.3 0.6 0.4"');
  });
});

describe("the cards' own fonts", () => {
  const AR = "https://media.boutq.store/brands/b1/font/0f8e2b8c-7a3d-4e55-9a0b-2c4d6e8f1a3b.woff2";
  const EN = "https://media.boutq.store/brands/b1/font/1a2b3c4d-7a3d-4e55-9a0b-2c4d6e8f1a3b.otf";
  const kit = {
    storeName: { ar: "بيورا لاين", en: "Pura Line" },
    logo: null,
    logoScale: 1,
    fonts: { ar: AR, en: EN },
    photos: [],
    currency: "BHD",
    storeLink: "pura.boutq.store",
    kind: "fashion" as const,
  };
  const blank = { amount: 50, code: "K7QM-4XHR-92TP", to: "Noura", message: "Hi", expiresOn: null };

  it("set the large words in each language, and leave the labels, the note and the code clear", () => {
    const withFonts = cardContent(kit, null, blank, "en");
    expect(withFonts.fonts).toEqual({
      ar: cardFontFamily("ar", AR),
      en: cardFontFamily("en", EN),
    });
    const front = texts(
      cardFront(design({ design: "type:white" }), withFonts, COLOURS, roughMeasure),
    );
    expect(front.find((t) => t.text.includes("Gift"))!.font.family).toContain(
      cardFontFamily("en", EN),
    );
    const back = texts(cardBack(design(), withFonts, COLOURS, roughMeasure));
    expect(back.find((t) => t.text === "Noura")!.font.family).toContain(cardFontFamily("en", EN));
    expect(back.find((t) => t.text === "K7QM-4XHR-92TP")!.font.family).not.toContain("BoutqCard");
    expect(back.find((t) => t.text === "Hi")!.font.family).not.toContain("BoutqCard");
    const arabic = texts(
      cardFront(
        design({ design: "type:white", language: "ar" }),
        cardContent(kit, null, blank, "ar"),
        COLOURS,
        roughMeasure,
      ),
    );
    expect(arabic.find((t) => t.text.includes("هدية"))!.font.family).toContain(
      cardFontFamily("ar", AR),
    );
  });

  it("are named apart, so a font changed later is never mistaken for the one before", () => {
    expect(cardFontFamily("ar", AR)).toBe(cardFontFamily("ar", AR));
    expect(cardFontFamily("ar", AR)).not.toBe(cardFontFamily("ar", EN));
    expect(cardFontFamily("ar", AR)).not.toBe(cardFontFamily("en", AR));
    expect(fontName("Zain-Bold_Display.woff2")).toBe("Zain Bold Display");
  });

  it("go to print with the card, their addresses made safe", () => {
    const html = cardPrintHtml({
      front: [],
      back: [],
      size: cardSize("portrait"),
      format: "a6",
      lang: "en",
      origin: "https://pura.boutq.store",
      fonts: { ar: `${AR}"); } body{x:url(`, en: null },
    });
    expect(html).toContain(
      `@font-face{font-family:"${cardFontFamily("ar", `${AR}"); } body{x:url(`)}"`,
    );
    expect(html).not.toContain('"); }');
    expect(html).toContain(`400 40px \\"${cardFontFamily("ar", `${AR}"); } body{x:url(`)}\\"`);
  });
});
