import { describe, expect, it } from "vitest";
import { cardBack } from "../src/features/gift-card-design/lib/back";
import { cardContent, type LogoInfo } from "../src/features/gift-card-design/lib/content";
import { DEFAULT_DESIGN } from "../src/features/gift-card-design/lib/design";
import type { Shape } from "../src/features/gift-card-design/lib/geometry";
import { roughMeasure } from "../src/features/gift-card-design/lib/type";
import { cardLanguage } from "../src/features/gift-cards/components/GiftMessageCard";

// A gift message card sets each line in its own language's card face and wears the store's mark
// large at its top (the owner's report of 2026-11-10: from an English admin, the Arabic message
// was set in the English face and the browser filled it with a system font, under a small mark).
// The cards' own Arabic face (29LT Azer) is the one the owner chose to keep.

const COLOURS = { accent: "#330a0a", background: "#ffffff", text: "#0a0a0a" };
const logo: LogoInfo = {
  href: "https://media.test/logo.svg",
  aspect: 2.1,
  crop: { x: 0, y: 0, w: 1, h: 1 },
};
const kit = {
  storeName: { ar: "بيورا لاين", en: "Pura Line" },
  logo,
  logoScale: 1.8,
  fonts: { ar: null, en: null },
  photos: [],
  currency: "BHD",
  storeLink: "pura.boutq.store",
  kind: "fashion" as const,
};
const details = {
  amount: null,
  code: null,
  to: null,
  message: "اللبس من لبّاسه، وما تلوق إلا عليج",
  expiresOn: null,
  purpose: "message" as const,
};
const textOf = (shapes: Shape[], needle: RegExp) =>
  shapes.find(
    (s): s is Extract<Shape, { kind: "text" }> => s.kind === "text" && needle.test(s.text),
  );

describe("a gift message card's faces", () => {
  it("set an Arabic message in the cards' Arabic face, even on a card whose labels are English", () => {
    const content = cardContent(kit, null, details, "en");
    const back = cardBack(
      { ...DEFAULT_DESIGN, language: "en", from: "Eman Shaker" },
      content,
      COLOURS,
      roughMeasure,
    );
    expect(textOf(back, /اللبس/)?.font.family).toContain("29LT Azer");
    expect(textOf(back, /Eman/)?.font.family).toContain("Plus Jakarta Sans");
  });

  it("wear the store's mark large at the top of the back", () => {
    const content = cardContent(kit, null, details, "ar");
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
