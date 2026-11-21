import { describe, expect, it } from "vitest";
import { cardBack } from "../src/features/gift-card-design/lib/back";
import { cardContent } from "../src/features/gift-card-design/lib/content";
import { DEFAULT_DESIGN } from "../src/features/gift-card-design/lib/design";
import type { Shape } from "../src/features/gift-card-design/lib/geometry";
import { balancedLines, messageFit } from "../src/features/gift-card-design/lib/message-card";
import { cardPrintHtml } from "../src/features/gift-card-design/lib/print";
import {
  clampLines,
  display,
  leading,
  roughMeasure,
  wrapWritten,
  writtenLines,
} from "../src/features/gift-card-design/lib/type";
import {
  cardFontFamily,
  choiceValue,
  familyOf,
  faceLoad,
  fontSetOf,
  messageFontSet,
  printFaceRules,
  readPick,
} from "../src/features/gift-card-design/lib/card-faces";
import {
  LIBRARY_MAX,
  addUpload,
  choiceKey,
  choiceName,
  fontOptions,
  fontSample,
  libraryWith,
  removeUpload,
  uploadsInUse,
} from "../src/features/gift-cards/lib/card-font-choices";

// Card fonts chosen, never uploaded again, and a message set out as it was typed (the owner's
// requests of 2026-11-21: "do I upload every time I want to change the font?", and "if I write a
// line at the top and then go below, make it the same order on the card").

const UPLOAD =
  "https://media.boutq.store/brands/b1/font/0f8e2b8c-7a3d-4e55-9a0b-2c4d6e8f1a3b.woff2";
const COLOURS = { accent: "#330a0a", background: "#ffffff", text: "#0a0a0a" };
const kit = {
  storeName: { ar: "بيورا لاين", en: "Pura Line" },
  logo: null,
  logoScale: 1,
  fonts: { ar: "face:zarid", en: null },
  messageFonts: { ar: "face:tajawal", en: null },
  photos: [],
  currency: "BHD",
  storeLink: "pura.boutq.store",
  kind: "fashion" as const,
};
const texts = (shapes: Shape[]) =>
  shapes.filter((s): s is Extract<Shape, { kind: "text" }> => s.kind === "text");

// The message from the owner's report, typed on three lines.
const REPORTED = [
  "هدية بسيطة جداً",
  "(عيد ميلاد سعيد، متأخر جداً)",
  "- الأشخاص المميزون يستحقون الاحتفال بهم طوال العام وليس بيوم ميلادهم فقط!",
].join("\n");

describe("a message set out as it was typed", () => {
  it("keeps each line the writer started, in order, and one blank line between two", () => {
    expect(writtenLines("  one \n\n\n two  three\r\nfour\n\n")).toEqual([
      "one",
      "",
      "two three",
      "four",
    ]);
    expect(writtenLines("\n\n")).toEqual([]);
    const font = display("en", 4);
    expect(wrapWritten("first\nsecond", font, 200, roughMeasure)).toEqual(["first", "second"]);
  });

  it("starts each of the reported message's lines on a new line of the card, in its order", () => {
    const content = cardContent(
      kit,
      null,
      {
        amount: null,
        code: null,
        to: "زينب الماجد",
        message: REPORTED,
        expiresOn: null,
        purpose: "message",
      },
      "ar",
    );
    const lines = texts(
      cardBack({ ...DEFAULT_DESIGN, from: "إيمان" }, content, COLOURS, roughMeasure),
    ).map((t) => t.text);
    const first = lines.indexOf("هدية بسيطة جداً");
    expect(first).toBeGreaterThan(-1);
    expect(lines[first + 1]).toMatch(/^\(عيد ميلاد/);
    const third = lines.findIndex((line) => line.startsWith("- الأشخاص"));
    expect(third).toBeGreaterThan(first + 1);
    // The second written line ends before the third begins: nothing of it follows the dash.
    expect(lines.slice(first + 1, third).join(" ")).toBe("(عيد ميلاد سعيد، متأخر جداً)");
  });

  it("balances each written line on its own, and fits them all in the room", () => {
    const font = display("ar", 6);
    const balanced = balancedLines(REPORTED, font, 70, roughMeasure);
    expect(balanced[0]).toBe("هدية بسيطة جداً");
    const fitted = messageFit(REPORTED, 40, 70, (s) => display("ar", s), roughMeasure, 11);
    expect(fitted.lines[0]).toBe("هدية بسيطة جداً");
    expect(fitted.lines.join(" ")).toContain("(عيد ميلاد سعيد، متأخر جداً)");
  });

  it("cuts a message too long for its room on a line with words, never on a blank one", () => {
    expect(clampLines(["one", "", "two"], 2)).toEqual(["one…"]);
    expect(clampLines(["one", "two", "three"], 2)).toEqual(["one", "two…"]);
  });

  it("keeps the lines of a gift card buyer's note too", () => {
    const content = cardContent(
      kit,
      null,
      { amount: 50, code: null, to: "Noura", message: "Line one\nLine two", expiresOn: null },
      "en",
    );
    const lines = texts(
      cardBack({ ...DEFAULT_DESIGN, language: "en" }, content, COLOURS, roughMeasure),
    ).map((t) => t.text);
    expect(lines).toContain("Line one");
    expect(lines).toContain("Line two");
  });
});

describe("a card's font choice", () => {
  it("is an upload's address, one of the platform's faces, or the cards' own", () => {
    expect(readPick(UPLOAD, "ar")).toEqual({ kind: "file", url: UPLOAD });
    expect(readPick("face:kaff", "ar")).toMatchObject({
      kind: "face",
      face: { family: "29LT Kaff" },
    });
    expect(readPick("face:own", "ar")).toEqual({ kind: "own" });
    expect(readPick(null, "en")).toEqual({ kind: "own" });
    // A face with no letters for the language, or one no longer offered, falls back to the own.
    expect(readPick("face:inter", "ar")).toEqual({ kind: "own" });
    expect(readPick("face:comic", "en")).toEqual({ kind: "own" });
    expect(familyOf("ar", "face:bukra")).toBe("29LT Bukra");
    expect(familyOf("en", UPLOAD)).toBe(cardFontFamily("en", UPLOAD));
    expect(familyOf("ar", "face:own")).toBeNull();
    expect(faceLoad("ar", "face:zarid")).toBe('400 40px "29LT Zarid Display"');
    expect(faceLoad("en", null)).toBeNull();
  });

  it("is read from what is stored, a message card's own else the gift cards'", () => {
    expect(choiceValue({ face: "kaff" })).toBe("face:kaff");
    expect(choiceValue({ url: UPLOAD, name: "X" })).toBe(UPLOAD);
    expect(choiceValue(null)).toBeNull();
    const gift = fontSetOf({ ar: { face: "kaff" }, en: { url: UPLOAD, name: null } });
    expect(gift).toEqual({ ar: "face:kaff", en: UPLOAD });
    expect(messageFontSet({ ar: { face: "own" }, en: null }, gift)).toEqual({
      ar: "face:own",
      en: UPLOAD,
    });
  });

  it("sets the large words in the face's own weight, with room for its letters", () => {
    const content = cardContent(
      kit,
      null,
      { amount: 50, code: null, to: null, message: null, expiresOn: null },
      "ar",
    );
    expect(content.fonts).toEqual({ ar: "29LT Zarid Display", en: null });
    const kaff = display("ar", 8, { ar: "29LT Kaff", en: null });
    expect(kaff.family.startsWith('"29LT Kaff"')).toBe(true);
    expect(kaff.weight).toBe(300);
    expect(leading(kaff)).toBeCloseTo(8 * 1.45);
    // A gift message card takes its own fonts.
    const message = cardContent(
      kit,
      null,
      { amount: null, code: null, to: "x", message: "y", expiresOn: null, purpose: "message" },
      "ar",
    );
    expect(message.fonts).toEqual({ ar: "Tajawal", en: null });
  });

  it("prints with the faces it needs, from the store's own host, an upload's address made safe", () => {
    const rules = printFaceRules(
      { ar: "face:tajawal", en: `${UPLOAD}"); } body{x:url(` },
      "https://pura.boutq.store",
      new Set(["29LT Kaff"]),
    );
    expect(rules.css).toContain(
      '@font-face{font-family:"Tajawal";src:url("https://pura.boutq.store/fonts/tajawal/tajawal-400-arabic.woff2")',
    );
    expect(rules.css).toContain("unicode-range:U+0600-06FF");
    expect(rules.css).not.toContain('"); }');
    expect(rules.loads).toContain('400 40px "Tajawal"');
    // A face the page already declares needs no rule of its own.
    expect(
      printFaceRules({ ar: "face:kaff", en: null }, "https://x", new Set(["29LT Kaff"])).css,
    ).toBe("");
    const html = cardPrintHtml({
      front: [],
      back: [],
      size: { w: 105, h: 148 },
      format: "a6",
      lang: "ar",
      origin: "https://pura.boutq.store",
      fonts: { ar: "face:bukra", en: null },
    });
    expect(html).toContain("/fonts/bukramed.woff2");
    expect(html).toContain('500 40px \\"29LT Bukra\\"');
  });
});

describe("the font picker", () => {
  const library = [{ url: UPLOAD, name: "Zain" }];

  it("lists the cards' own, the platform's faces for the language, then the store's uploads", () => {
    const arabic = fontOptions("ar", library, "en", "own");
    expect(arabic.map((o) => o.group)).toEqual([
      "own",
      "platform",
      "platform",
      "platform",
      "platform",
      "platform",
      "mine",
    ]);
    expect(arabic.some((o) => o.name === "Inter")).toBe(false);
    expect(fontOptions("en", library, "en", "own").some((o) => o.name === "Inter")).toBe(true);
    // A message card's picker starts with the gift cards' font, drawn in it.
    const message = fontOptions("ar", [], "ar", "gift", { face: "zarid" });
    expect(message[0]).toMatchObject({ key: "default", name: "نفس خط بطاقات الهدايا" });
    expect(message[0].style.fontFamily).toContain("29LT Zarid Display");
    expect(message[1]).toMatchObject({ key: "own", choice: { face: "own" } });
  });

  it("names and keys a choice by what nothing chosen means", () => {
    expect(choiceKey(null, "own")).toBe("own");
    expect(choiceKey(null, "gift")).toBe("default");
    expect(choiceKey({ face: "own" }, "gift")).toBe("own");
    expect(choiceKey({ face: "kaff" }, "own")).toBe("face:kaff");
    expect(choiceName(null, "ar", "ar", "own")).toBe("خط البطاقات");
    expect(choiceName(null, "ar", "en", "settings")).toBe("As in the settings");
    expect(choiceName({ face: "readex" }, "en", "en", "own")).toBe("Readex Pro");
    expect(choiceName({ url: UPLOAD, name: null }, "en", "en", "own")).toBe("Uploaded font");
  });

  it("keeps the store's uploads once each, up to the list's size, the chosen ones always", () => {
    expect(addUpload(library, library[0])).toEqual(library);
    const full = Array.from({ length: LIBRARY_MAX }, (_, i) => ({ url: `u${i}`, name: null }));
    expect(addUpload(full, { url: "new", name: null })).toBeNull();
    expect(removeUpload(library, UPLOAD)).toEqual([]);
    const chosen = { ar: { url: "a", name: "A" }, en: { face: "kaff" } };
    expect([...uploadsInUse(chosen, { ar: null, en: { url: "b", name: null } })]).toEqual([
      "a",
      "b",
    ]);
    expect(libraryWith(library, chosen).map((f) => f.url)).toEqual([UPLOAD, "a"]);
  });

  it("shows each font with the store's name in that language, else a greeting", () => {
    expect(fontSample("ar", { ar: "بيورا لاين", en: "Pura Line" })).toBe("بيورا لاين");
    expect(fontSample("ar", { ar: "Pura", en: "Pura" })).toBe("هدية لك");
    expect(fontSample("en", { ar: null, en: "Pura Line" })).toBe("Pura Line");
    expect(fontSample("en", { ar: "بيورا", en: null })).toBe("A gift for you");
  });
});
