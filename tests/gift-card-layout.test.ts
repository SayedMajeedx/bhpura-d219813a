import { describe, expect, it, vi } from "vitest";
import {
  ALL_DESIGNS,
  DEFAULT_DESIGN,
  type CardDesign,
} from "../src/features/gift-card-design/lib/design";
import { cardFront } from "../src/features/gift-card-design/lib/front";
import { cardBack } from "../src/features/gift-card-design/lib/back";
import type { CardContent, LogoInfo } from "../src/features/gift-card-design/lib/content";
import { CARD_OCCASIONS } from "../src/features/gift-card-design/lib/occasions";
import { roughMeasure } from "../src/features/gift-card-design/lib/type";
import { clashes, placed } from "./helpers/card-layout";

// Every word on a gift card keeps its room (the owner's report of 2026-11-04: the line above the
// logo touched it). Whatever the design, occasion, orientation and language, and whatever the
// store's logo (none, wide, stacked or square) at the size it chose (up to twice), no line of
// text comes within 2 mm of the logo and no two lines touch.
vi.setConfig({ testTimeout: 120_000 });

const COLOURS = { accent: "#3f121a", background: "#ffffff", text: "#1a1a1a" };
const logo = (aspect: number): LogoInfo => ({
  href: "https://media.test/logo.png",
  aspect,
  crop: { x: 0, y: 0, w: 1, h: 1 },
});
const LOGOS: Array<LogoInfo | null> = [null, logo(3), logo(1.4), logo(1)];

const content = (primary: "ar" | "en", mark: LogoInfo | null, scale: number): CardContent => ({
  storeName: { ar: "بيورا لاين", en: "Pura Line" },
  logo: mark,
  logoScale: scale,
  photo: "https://media.test/abaya.jpg",
  amount: 50,
  currency: "BHD",
  code: "K7QM-4XHR-92TP",
  to: "Noura",
  message: "Happy Eid to my favourite sister. Treat yourself to something beautiful.",
  expiresOn: "2027-10-31",
  storeLink: "pura.boutq.store",
  kind: "fashion",
  primary,
});

describe("a gift card's layout", () => {
  it("keeps the words clear of the logo and of each other", () => {
    const found: string[] = [];
    for (const id of ALL_DESIGNS) {
      for (const orientation of ["portrait", "landscape"] as const) {
        for (const language of ["ar", "en", "both"] as const) {
          for (const occasion of CARD_OCCASIONS) {
            for (const mark of LOGOS) {
              for (const scale of [1, 1.5, 2]) {
                const design: CardDesign = {
                  ...DEFAULT_DESIGN,
                  design: id,
                  orientation,
                  language,
                  occasion: occasion.id,
                };
                const c = content(language === "en" ? "en" : "ar", mark, scale);
                for (const [side, shapes] of [
                  ["front", cardFront(design, c, COLOURS, roughMeasure)],
                  ["back", cardBack(design, c, COLOURS, roughMeasure)],
                ] as const) {
                  const clash = clashes(placed(shapes, roughMeasure), 2, 0.3)[0];
                  if (clash) {
                    found.push(
                      `${id} ${orientation} ${language} ${occasion.id} ${side} logo ${mark?.aspect ?? "name"} ×${scale}: ${clash}`,
                    );
                  }
                }
              }
            }
          }
        }
      }
    }
    expect(found.slice(0, 5)).toEqual([]);
  });

  it("would catch the line that touched the logo", () => {
    const boxes = placed(
      [
        {
          kind: "text",
          x: 50,
          y: 80,
          text: "كل عام وأنت بخير",
          font: { family: "x", weight: 400, size: 3.1 },
          fill: "#000",
          align: "center",
          dir: "rtl",
        },
        {
          kind: "logo",
          href: "l",
          x: 40,
          y: 81,
          w: 20,
          h: 12,
          tint: "#000",
          crop: { x: 0, y: 0, w: 1, h: 1 },
        },
      ],
      roughMeasure,
    );
    expect(clashes(boxes, 2, 0.3)).toHaveLength(1);
  });
});
