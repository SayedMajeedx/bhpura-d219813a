import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  ALL_DESIGNS,
  DEFAULT_DESIGN,
  type CardDesign,
} from "../src/features/gift-card-design/lib/design";
import { cardFront } from "../src/features/gift-card-design/lib/front";
import { cardBack } from "../src/features/gift-card-design/lib/back";
import type { CardContent, LogoInfo } from "../src/features/gift-card-design/lib/content";
import { cardSize, type Shape } from "../src/features/gift-card-design/lib/geometry";
import { foldSheet } from "../src/features/gift-card-design/lib/print";
import { roughMeasure } from "../src/features/gift-card-design/lib/type";
import { giftOrderNote, readGiftOrderNote } from "../src/lib/gift-order-note";
import { cardContact, instagramHandle } from "../src/features/gift-card-design/lib/contact";
import { clashes, placed } from "./helpers/card-layout";

// A gift order's message card (the owner's report of 2026-11-10): the shopper's words for the
// person receiving the gift, in the store's gift card designs but holding no money, printed to
// fold, glue and cut like a gift card. Read from what the checkout writes in the order's notes.
vi.setConfig({ testTimeout: 120_000 });

vi.mock("../src/features/gift-cards/components/PrintCardDialog", () => ({
  PrintButton: ({ label }: { label: string }) => <button type="button">{label}</button>,
}));
vi.mock("@/features/gift-cards/components/PrintCardDialog", () => ({
  PrintButton: ({ label }: { label: string }) => <button type="button">{label}</button>,
}));
const { GiftMessageCardBlock } =
  await import("../src/features/gift-cards/components/GiftMessageCard");

const COLOURS = { accent: "#3f121a", background: "#ffffff", text: "#1a1a1a" };
const logo = (aspect: number): LogoInfo => ({
  href: "https://media.test/logo.png",
  aspect,
  crop: { x: 0, y: 0, w: 1, h: 1 },
});
const MESSAGE = "اللبس من لبّاسه، وما تلوق إلا عليج. كل عام وانتي بخير يا أحلى أخت، عساها تعجبج";
const content = (mark: LogoInfo | null, message = MESSAGE): CardContent => ({
  storeName: { ar: "بيورا لاين", en: "Pura Line" },
  logo: mark,
  logoScale: 1,
  photo: "https://media.test/abaya.jpg",
  amount: null,
  currency: "BHD",
  code: null,
  to: "نورة",
  message,
  expiresOn: null,
  storeLink: "pura.boutq.store",
  kind: "fashion",
  primary: "ar",
  purpose: "message",
  contact: { phone: "+973 3995 0016", instagram: "@puraline.bh" },
});
const texts = (shapes: Shape[]) =>
  shapes.flatMap((s) => (s.kind === "text" ? [s.text] : [])).join(" | ");

describe("the gift details in an order's notes", () => {
  it("reads back what the checkout writes, the shopper's own notes left out", () => {
    const notes = `${giftOrderNote("نورة", "سطر أول\nسطر ثاني")}\n\nاتصلوا قبل التوصيل`;
    expect(readGiftOrderNote(notes)).toEqual({ recipient: "نورة", message: "سطر أول\nسطر ثاني" });
  });

  it("reads an empty recipient or message as none, and an order that is no gift as null", () => {
    expect(readGiftOrderNote(giftOrderNote("", ""))).toEqual({ recipient: null, message: null });
    expect(readGiftOrderNote("اتصلوا قبل التوصيل")).toBeNull();
    expect(readGiftOrderNote(null)).toBeNull();
  });

  it("reads the note as orders already hold it", () => {
    const stored =
      "🎁 [طلب إهداء / Gift Order]\nالمستلم: غير محدد\nرسالة الإهداء: اللبس من لبّاسه، وما تلوق إلا عليج";
    expect(readGiftOrderNote(stored)).toEqual({
      recipient: null,
      message: "اللبس من لبّاسه، وما تلوق إلا عليج",
    });
  });
});

describe("a gift message card", () => {
  it("never says gift card or holds a value, a code or an expiry", () => {
    const design: CardDesign = { ...DEFAULT_DESIGN, occasion: "gift", from: "مريم" };
    const back = texts(cardBack(design, content(null), COLOURS, roughMeasure));
    expect(back).toContain("نورة");
    expect(back).toContain("مريم");
    expect(back).toContain("اللبس");
    expect(back).not.toMatch(/بطاقة هدية|Gift card|رمز|القيمة|صالحة|••••/);
    const front = texts(cardFront(design, content(null), COLOURS, roughMeasure));
    expect(front).not.toMatch(/بطاقة هدية|Gift card|اللبس/);
  });

  it("keeps its words inside the card, clear of the logo and of each other, on every design", () => {
    const found: string[] = [];
    for (const id of ALL_DESIGNS) {
      for (const orientation of ["portrait", "landscape"] as const) {
        for (const language of ["ar", "en", "both"] as const) {
          for (const mark of [null, logo(3), logo(1)]) {
            for (const message of [MESSAGE, MESSAGE.repeat(4), "مبروك"]) {
              for (const messageSize of ["small", "auto", "large"] as const) {
                const design: CardDesign = {
                  ...DEFAULT_DESIGN,
                  design: id,
                  orientation,
                  language,
                  occasion: "gift",
                  from: "مريم",
                };
                const { w, h } = cardSize(orientation);
                const back = cardBack(
                  design,
                  { ...content(mark, message), messageSize },
                  COLOURS,
                  roughMeasure,
                );
                const boxes = placed(back, roughMeasure);
                const clash = clashes(boxes, 2, 0.3)[0];
                const outside = boxes.find((b) => b.x0 < 0 || b.x1 > w || b.y0 < 0 || b.y1 > h);
                if (clash || outside) {
                  found.push(`${id} ${orientation} ${language}: ${clash ?? outside?.label}`);
                }
              }
            }
          }
        }
      }
    }
    expect(found.slice(0, 5)).toEqual([]);
  });

  it("carries the store's mark large on the front, with its number and Instagram", () => {
    const front = cardFront({ ...DEFAULT_DESIGN }, content(logo(1.7)), COLOURS, roughMeasure);
    const mark = front.find((s) => s.kind === "logo");
    expect(mark && mark.kind === "logo" ? mark.w : 0).toBeGreaterThan(45);
    expect(texts(front).split(" | ").sort()).toEqual(["+973 3995 0016", "@puraline.bh"]);
    // Without a contact the front is the mark alone.
    const bare = cardFront(
      { ...DEFAULT_DESIGN },
      { ...content(logo(1.7)), contact: { phone: null, instagram: null } },
      COLOURS,
      roughMeasure,
    );
    expect(texts(bare)).toBe("");
  });

  it("keeps the front's words inside the frame and clear of the mark, on every design", () => {
    const found: string[] = [];
    for (const id of ALL_DESIGNS) {
      for (const orientation of ["portrait", "landscape"] as const) {
        for (const mark of [null, logo(3), logo(1.7), logo(1)]) {
          const design: CardDesign = { ...DEFAULT_DESIGN, design: id, orientation };
          const { w, h } = cardSize(orientation);
          const boxes = placed(
            cardFront(design, content(mark), COLOURS, roughMeasure),
            roughMeasure,
          );
          const clash = clashes(boxes, 2, 0.3)[0];
          const outside = boxes.find((b) => b.x0 < 6 || b.x1 > w - 6 || b.y0 < 6 || b.y1 > h - 6);
          if (clash || outside) found.push(`${id} ${orientation}: ${clash ?? outside?.label}`);
        }
      }
    }
    expect(found.slice(0, 5)).toEqual([]);
  });

  it("fills its room: a short message set large, in balanced lines, smaller or larger by choice", () => {
    const message = "اللبس من لبّاسه، وما تلوق إلا عليج";
    const design: CardDesign = { ...DEFAULT_DESIGN, orientation: "landscape", from: "Eman" };
    const sizeOf = (messageSize: "small" | "auto" | "large") => {
      const back = cardBack(
        design,
        { ...content(null, message), to: null, messageSize },
        COLOURS,
        roughMeasure,
      );
      const lines = back.filter(
        (s): s is Extract<Shape, { kind: "text" }> =>
          s.kind === "text" && /اللبس|عليج|تلوق/.test(s.text),
      );
      return { size: lines[0]?.font.size ?? 0, lines: lines.map((l) => l.text) };
    };
    const auto = sizeOf("auto");
    // It once sat as one thin line in the middle of an empty card.
    expect(auto.size).toBeGreaterThan(8);
    expect(auto.lines.length).toBeGreaterThanOrEqual(2);
    const [first, last] = [auto.lines[0], auto.lines[auto.lines.length - 1]];
    expect(Math.abs(first.length - last.length)).toBeLessThanOrEqual(
      Math.max(first.length, last.length) / 2,
    );
    expect(sizeOf("small").size).toBeLessThan(auto.size);
    expect(sizeOf("large").size).toBeGreaterThanOrEqual(auto.size);
  });

  it("prints on one A4 sheet to fold, as a gift card does", () => {
    const sheet = foldSheet(cardSize("portrait"));
    expect(sheet.fold).toBe(148.5);
    expect(sheet.back.y).toBeGreaterThan(sheet.fold);
  });
});

describe("the store's contact on the card", () => {
  it("is its number as people write it and its Instagram handle", () => {
    expect(
      cardContact({
        phone: "+97339950016",
        socials: [
          { name: "Instagram", url: "https://www.instagram.com/puraline.bh" },
          { name: "TikTok", url: "https://www.tiktok.com/@puraline.bh" },
        ],
      }),
    ).toEqual({ phone: "+973 3995 0016", instagram: "@puraline.bh" });
    expect(cardContact({ whatsapp_number: "97339950016", socials: null }).instagram).toBeNull();
    expect(instagramHandle({ instagram: "https://instagram.com/pura_line/" })).toBe("@pura_line");
  });
});

describe("the order page's gift message card", () => {
  it("shows for a gift order with its words, and offers to print it", () => {
    render(
      <GiftMessageCardBlock
        notes={giftOrderNote("نورة", "مبروك")}
        invoiceNumber={1108}
        lang="ar"
      />,
    );
    expect(screen.getByText("بطاقة الإهداء")).toBeInTheDocument();
    expect(screen.getByText("مبروك")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "طباعة بطاقة الإهداء" })).toBeInTheDocument();
  });

  it("says when the customer wrote no message, and is absent on an order that is no gift", () => {
    render(<GiftMessageCardBlock notes={giftOrderNote("", "")} invoiceNumber={1} lang="en" />);
    expect(screen.getByText(/The customer wrote no message/)).toBeInTheDocument();
    const { container } = render(
      <GiftMessageCardBlock notes="Call first" invoiceNumber={2} lang="en" />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
