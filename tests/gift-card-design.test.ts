import { describe, expect, it } from "vitest";
import { contrastRatio } from "../src/features/content-studio/lib/studio-styles";
import {
  CARD_OCCASIONS,
  inSeason,
  occasionsInOrder,
} from "../src/features/gift-card-design/lib/occasions";
import {
  ALL_DESIGNS,
  DEFAULT_DESIGN,
  designsFor,
  palette,
  readDesign,
  readStoreDesigns,
  verticalKind,
  type CardDesign,
  type DesignId,
} from "../src/features/gift-card-design/lib/design";
import { cardFront } from "../src/features/gift-card-design/lib/front";
import { CODE_PLACEHOLDER, cardBack } from "../src/features/gift-card-design/lib/back";
import { cardContent, type CardContent } from "../src/features/gift-card-design/lib/content";
import {
  cardSize,
  crescentPath,
  starPolygon,
  type Shape,
} from "../src/features/gift-card-design/lib/geometry";
import { cardSvg, textAnchor } from "../src/features/gift-card-design/lib/svg";
import { cardPrintHtml } from "../src/features/gift-card-design/lib/print";
import { roughMeasure } from "../src/features/gift-card-design/lib/type";

// Gift card designs (the owner's brief of 2026-10-31): occasions in the Gulf's words and seasons,
// five compositions on four tones made from the store's colours, the store curating and the buyer
// picking, and the A6 faces drawn as shapes (screen, picture and print draw the same ones).

const COLOURS = { accent: "#3f121a", background: "#ffffff", text: "#1a1a1a" };
const day = (iso: string) => new Date(`${iso}T09:00:00Z`);

const content = (over: Partial<CardContent> = {}): CardContent => ({
  storeName: { ar: "بيورا لاين", en: "Pura Line" },
  logo: null,
  photo: "https://media.test/abaya.jpg",
  amount: 50,
  currency: "BHD",
  code: "K7QM-4XHR-92TP",
  to: "Noura",
  message: "Happy Eid to my favourite sister. Treat yourself to something beautiful.",
  expiresOn: "2027-10-31",
  storeLink: "pura.boutq.store",
  kind: "fashion",
  primary: "en",
  ...over,
});

const design = (over: Partial<CardDesign> = {}): CardDesign => ({ ...DEFAULT_DESIGN, ...over });
const texts = (shapes: Shape[]) =>
  shapes.filter((s): s is Extract<Shape, { kind: "text" }> => s.kind === "text");

describe("the occasions", () => {
  it("are said as the Gulf says them, with nothing gendered", () => {
    expect(CARD_OCCASIONS.find((o) => o.id === "new_baby")?.line?.ar).toBe("يتربّى في عزّكم");
    expect(CARD_OCCASIONS.find((o) => o.id === "eid_al_fitr")?.line?.ar).toBe("عساكم من عواده");
    // Verbs addressed to one person (تستحق، تستحقين) would guess who opens the card.
    for (const occasion of CARD_OCCASIONS) {
      expect(`${occasion.greeting.ar} ${occasion.line?.ar ?? ""}`).not.toMatch(/تستحق|تستاهل/);
    }
  });

  it("lead with what is in season, by the Umm al-Qura calendar and the store's own country", () => {
    expect(occasionsInOrder(day("2027-02-20"), "BHD")[0].id).toBe("ramadan");
    expect(occasionsInOrder(day("2027-03-05"), "BHD")[0].id).toBe("eid_al_fitr");
    expect(occasionsInOrder(day("2027-03-10"), "BHD")[0].id).toBe("eid_al_fitr");
    expect(occasionsInOrder(day("2027-05-17"), "BHD")[0].id).toBe("eid_al_adha");
    expect(inSeason(day("2026-12-05"), "BHD")).toContain("national_day");
    expect(inSeason(day("2026-12-05"), "SAR")).not.toContain("national_day");
    expect(inSeason(day("2027-03-10"), "BHD")).toContain("mothers_day");
    expect(occasionsInOrder(day("2026-08-10"), "BHD")[0].id).toBe("gift");
    expect(occasionsInOrder(day("2026-08-10"), "BHD")).toHaveLength(CARD_OCCASIONS.length);
  });
});

describe("what a buyer is offered", () => {
  const store = readStoreDesigns({});
  it("is a handful, the store's signature first, without what it turned off or photos it lacks", () => {
    const offered = designsFor({ occasion: "gift", kind: "fashion", store, hasPhoto: true });
    expect(offered).toHaveLength(6);
    expect(new Set(offered).size).toBe(6);
    const curated = readStoreDesigns({ off: ["pattern:black"], signature: "block:white" });
    const mine = designsFor({ occasion: "gift", kind: "fashion", store: curated, hasPhoto: false });
    expect(mine[0]).toBe("block:white");
    expect(mine).not.toContain("pattern:black");
    expect(mine.some((id) => id.startsWith("photo:"))).toBe(false);
  });

  it("follows the occasion and the kind of store: a pattern for Eid, a photo for a roastery", () => {
    expect(
      designsFor({ occasion: "eid_al_fitr", kind: "beauty", store, hasPhoto: true })[0],
    ).toMatch(/^pattern:/);
    expect(designsFor({ occasion: "gift", kind: "coffee", store, hasPhoto: true })[0]).toBe(
      "photo:cream",
    );
    expect(verticalKind(["abayas", "fashion"])).toBe("fashion");
    expect(verticalKind(["coffee", "food"])).toBe("coffee");
    expect(verticalKind(["services"])).toBe("services");
  });

  it("never offers a design the store's settings turn off as its signature", () => {
    expect(readStoreDesigns({ off: ["type:white"], signature: "type:white" }).signature).toBeNull();
    expect(readStoreDesigns({ off: ["nonsense"] }).off).toEqual([]);
  });
});

describe("a tone", () => {
  it("is made from the store's colours, its ink always readable and its gold always seen", () => {
    for (const accent of ["#3f121a", "#f4c2c2", "#0b5d4b", "#ffffff", "#000000", "not a colour"]) {
      for (const tone of ["brand", "black", "cream", "white"] as const) {
        const p = palette(tone, { ...COLOURS, accent });
        expect(contrastRatio(p.ink, p.ground)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(p.metal, p.ground)).toBeGreaterThanOrEqual(1.5);
      }
    }
  });
});

describe("a card's faces", () => {
  const variants = ALL_DESIGNS.flatMap((id: DesignId) =>
    (["portrait", "landscape"] as const).flatMap((orientation) =>
      (["ar", "en", "both"] as const).map((language) =>
        design({ design: id, orientation, language }),
      ),
    ),
  );

  it("keep every word on the card, the code off the front, and Arabic never spaced apart", () => {
    for (const d of variants) {
      const { w, h } = cardSize(d.orientation);
      for (const shapes of [
        cardFront(d, content(), COLOURS, roughMeasure),
        cardBack(d, content(), COLOURS, roughMeasure),
      ]) {
        for (const t of texts(shapes)) {
          expect(t.y, `${d.design} ${d.orientation} ${d.language}: "${t.text}"`).toBeGreaterThan(0);
          expect(t.y).toBeLessThanOrEqual(h);
          expect(t.x).toBeGreaterThanOrEqual(0);
          expect(t.x).toBeLessThanOrEqual(w);
          if (/\p{Script=Arabic}/u.test(t.text)) {
            expect(t.font.spacing ?? 0).toBe(0);
            // A line takes the direction of its first letter ("Gift card · بطاقة هدية" reads left to right).
            expect(t.dir).toBe(/^[^\p{L}]*\p{Script=Arabic}/u.test(t.text) ? "rtl" : "ltr");
          }
        }
      }
      expect(
        texts(cardFront(d, content(), COLOURS, roughMeasure)).map((t) => t.text),
      ).not.toContain("K7QM-4XHR-92TP");
    }
  });

  it("say the occasion on the front, and the value, the code and its use on the back", () => {
    const eid = design({ occasion: "eid_al_fitr", design: "type:cream", language: "ar" });
    expect(
      texts(cardFront(eid, content(), COLOURS, roughMeasure))
        .map((t) => t.text)
        .join(" "),
    ).toContain("مبارك");
    const back = texts(cardBack(design({ language: "en" }), content(), COLOURS, roughMeasure)).map(
      (t) => t.text,
    );
    expect(back).toContain("K7QM-4XHR-92TP");
    expect(back.join(" ")).toContain("50.000");
    expect(back).toContain("Valid until 31 Oct 2027");
    expect(back.join(" ")).toContain("pura.boutq.store");
    expect(back).toContain("Noura");
  });

  it("show where the code will be before it is paid, and speak of an experience for a services store", () => {
    const back = texts(
      cardBack(
        design({ language: "en" }),
        content({ code: null, kind: "services" }),
        COLOURS,
        roughMeasure,
      ),
    ).map((t) => t.text);
    expect(back).toContain(CODE_PLACEHOLDER);
    expect(back.join(" ")).toContain("Toward any experience at Pura Line");
    const front = texts(
      cardFront(
        design({ language: "en", design: "type:white" }),
        content({ kind: "services" }),
        COLOURS,
        roughMeasure,
      ),
    ).map((t) => t.text);
    expect(front).toContain("An experience awaits");
  });

  it("use the store's logo when it can be set in one ink, else its name", () => {
    const withLogo = cardFront(
      design(),
      content({ logo: "https://media.test/logo.svg" }),
      COLOURS,
      roughMeasure,
    );
    expect(withLogo.some((s) => s.kind === "logo")).toBe(true);
    const named = texts(cardFront(design({ language: "en" }), content(), COLOURS, roughMeasure));
    expect(named.map((t) => t.text)).toContain("PURA LINE");
  });

  it("take a photo design's picture only from the store's own photos", () => {
    const kit = {
      storeName: { ar: null, en: "Pura" },
      logo: null,
      photos: ["https://media.test/a.jpg", "https://media.test/b.jpg"],
      currency: "BHD",
      storeLink: "pura.boutq.store",
      kind: "fashion" as const,
    };
    const blank = { amount: null, code: null, to: null, message: null, expiresOn: null };
    expect(cardContent(kit, "https://media.test/b.jpg", blank, "en").photo).toBe(
      "https://media.test/b.jpg",
    );
    expect(cardContent(kit, "https://evil.test/x.jpg", blank, "en").photo).toBe(
      "https://media.test/a.jpg",
    );
  });
});

describe("drawing and printing", () => {
  it("escape what a buyer writes and anchor text by its own direction", () => {
    const svg = cardSvg(
      cardBack(
        design({ language: "en" }),
        content({ message: '<script>alert("x")</script>' }),
        COLOURS,
        roughMeasure,
      ),
      cardSize("portrait"),
    );
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
    expect(textAnchor("right", "rtl")).toBe("start");
    expect(textAnchor("left", "rtl")).toBe("end");
    expect(textAnchor("left", "ltr")).toBe("start");
    expect(textAnchor("center", "rtl")).toBe("middle");
  });

  it("print both sides, on A6 paper or on A4 at true size with cut marks", () => {
    const d = design({ language: "en" });
    const faces = {
      front: cardFront(d, content(), COLOURS, roughMeasure),
      back: cardBack(d, content(), COLOURS, roughMeasure),
      size: cardSize("portrait"),
      lang: "en" as const,
      origin: "https://pura.boutq.store",
    };
    const a6 = cardPrintHtml({ ...faces, format: "a6" });
    expect(a6).toContain("@page{size:105mm 148mm;margin:0}");
    expect(a6.match(/<section class="page">/g)).toHaveLength(2);
    expect(a6).toContain('url("https://pura.boutq.store/fonts/azerextralight.woff2")');
    const a4 = cardPrintHtml({ ...faces, format: "a4" });
    expect(a4).toContain("@page{size:210mm 297mm;margin:0}");
    expect(a4.match(/class="marks"/g)).toHaveLength(2);
    expect(a4).toContain("then cut on the marks");
    // On A4 the card keeps its bleed (111 x 154 mm), so the colour runs past the cut.
    expect(a4).toContain('width="111mm" height="154mm"');
  });

  it("draw marks with ruler and compass", () => {
    expect(starPolygon(0, 0, 10).match(/[ML]/g)).toHaveLength(16);
    expect(crescentPath(10, 10, 5)).toMatch(
      /^M[\d. -]+A5 5 0 1 0 [\d. -]+A4\.2 4\.2 0 1 1 [\d. -]+Z$/,
    );
  });
});

describe("a stored design", () => {
  it("is read back whole, with defaults for what an older purchase lacks", () => {
    expect(readDesign(null, "en")).toEqual({ ...DEFAULT_DESIGN, language: "en" });
    expect(
      readDesign({
        occasion: "wedding",
        design: "pattern:cream",
        orientation: "landscape",
        language: "both",
        from: " Sara ",
        photo: "javascript:alert(1)",
        print: true,
      }),
    ).toEqual({
      occasion: "wedding",
      design: "pattern:cream",
      orientation: "landscape",
      language: "both",
      from: "Sara",
      photo: null,
      print: true,
    });
    expect(readDesign({ occasion: "nope", design: "photo:gold" }).design).toBe("signature:brand");
  });
});
