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
    expect(front).not.toMatch(/بطاقة هدية|Gift card/);
  });

  it("keeps its words inside the card, clear of the logo and of each other, on every design", () => {
    const found: string[] = [];
    for (const id of ALL_DESIGNS) {
      for (const orientation of ["portrait", "landscape"] as const) {
        for (const language of ["ar", "en", "both"] as const) {
          for (const mark of [null, logo(3), logo(1)]) {
            for (const message of [MESSAGE, MESSAGE.repeat(4), "مبروك"]) {
              const design: CardDesign = {
                ...DEFAULT_DESIGN,
                design: id,
                orientation,
                language,
                occasion: "gift",
                from: "مريم",
              };
              const { w, h } = cardSize(orientation);
              const back = cardBack(design, content(mark, message), COLOURS, roughMeasure);
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
    expect(found.slice(0, 5)).toEqual([]);
  });

  it("prints on one A4 sheet to fold, as a gift card does", () => {
    const sheet = foldSheet(cardSize("portrait"));
    expect(sheet.fold).toBe(148.5);
    expect(sheet.back.y).toBeGreaterThan(sheet.fold);
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
