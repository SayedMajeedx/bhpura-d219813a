import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  archRise,
  crescent,
  flower,
  partialPolyline,
  pointedArch,
  polylineLength,
  star,
} from "../src/features/content-studio/engine/line-art";
import {
  hijriDate,
  nextDate,
  occasionById,
  occasionCaption,
  occasionEyebrow,
  storeCountry,
  upcomingOccasion,
} from "../src/features/content-studio/lib/occasions";
import { occasionPack } from "../src/features/content-studio/templates/occasion-pack";
import type { SceneData } from "../src/features/content-studio/engine/scene";
import { useOccasion } from "../src/features/content-studio/hooks/use-occasion";

// The Occasion Pack: line art that draws itself, the GCC calendar's dates,
// and the greeting the merchant edits.

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (date: Date) => date.toISOString().slice(0, 10);

describe("line art", () => {
  it("measures a polyline and cuts it at a share of its length", () => {
    const line: Array<[number, number]> = [
      [0, 0],
      [30, 0],
      [30, 40],
    ];
    expect(polylineLength(line)).toBe(70);
    expect(partialPolyline(line, 0.5)).toEqual([
      [0, 0],
      [30, 0],
      [30, 5],
    ]);
    expect(partialPolyline(line, 0)).toEqual([]);
    expect(partialPolyline(line, 1)).toBe(line);
  });

  it("stands a pointed arch on its base and meets at the apex", () => {
    const arch = pointedArch(100, 800, 900, 1500);
    expect(arch[0]).toEqual([100, 1500]);
    expect(arch.at(-1)).toEqual([900, 1500]);
    const apex = arch.reduce((top, point) => (point[1] < top[1] ? point : top));
    expect(apex[0]).toBeCloseTo(500);
    expect(900 - apex[1]).toBeCloseTo(archRise(800));
  });

  it("draws a crescent as one closed stroke inside the moon's circle, opening either way", () => {
    const [moon] = crescent(0, 0, 100);
    expect(moon.at(0)).toEqual(moon.at(-1));
    expect(moon.every(([x, y]) => Math.hypot(x, y) <= 100.01)).toBe(true);
    // Opening right, the moon's body is on the left; mirrored, the other way.
    const meanX = (points: Array<[number, number]>) =>
      points.reduce((sum, [x]) => sum + x, 0) / points.length;
    expect(meanX(moon)).toBeLessThan(0);
    expect(meanX(crescent(0, 0, 100, true)[0])).toBeGreaterThan(0);
  });

  it("gives a star its tips and a flower its petals", () => {
    expect(star(0, 0, 10, 5)).toHaveLength(11);
    expect(flower(0, 0, 50, 6)).toHaveLength(7);
  });
});

describe("the occasion calendar", () => {
  const bahrain = storeCountry("BHD");

  it("finds the Islamic occasions by the Umm al-Qura calendar", () => {
    const from = day("2026-09-28");
    expect(iso(nextDate("ramadan", from, bahrain))).toBe("2027-02-08");
    expect(iso(nextDate("eid-al-fitr", from, bahrain))).toBe("2027-03-09");
    expect(iso(nextDate("eid-al-adha", from, bahrain))).toBe("2027-05-16");
    expect(hijriDate(day("2027-02-08"))).toEqual({ year: 1448, month: 9, day: 1 });
  });

  it("uses the store's own National Day, from its currency", () => {
    const from = day("2026-09-28");
    expect(iso(nextDate("national-day", from, bahrain))).toBe("2026-12-16");
    expect(iso(nextDate("national-day", from, storeCountry("SAR")))).toBe("2027-09-23");
    expect(iso(nextDate("national-day", from, storeCountry("kwd")))).toBe("2027-02-25");
    expect(storeCountry("USD").name.en).toBe("Bahrain");
    expect(iso(nextDate("mothers-day", from, bahrain))).toBe("2027-03-21");
  });

  it("opens on the occasion coming up next, or the one on now", () => {
    expect(upcomingOccasion(day("2026-09-28"), bahrain)).toBe("national-day");
    expect(upcomingOccasion(day("2026-09-28"), storeCountry("SAR"))).toBe("ramadan");
    // The middle of Ramadan 1447, and the second day of Eid al-Fitr.
    expect(upcomingOccasion(day("2026-03-01"), bahrain)).toBe("ramadan");
    expect(upcomingOccasion(day("2026-03-21"), bahrain)).toBe("eid-al-fitr");
  });

  it("words the line above the greeting for each occasion", () => {
    const ramadan = day("2027-02-08");
    expect(occasionEyebrow("ramadan", ramadan, bahrain, "en")).toBe("1448 AH");
    expect(occasionEyebrow("ramadan", ramadan, bahrain, "ar")).toBe("1448 هـ");
    expect(occasionEyebrow("national-day", ramadan, bahrain, "ar")).toBe("البحرين");
    expect(occasionEyebrow("mothers-day", ramadan, bahrain, "en")).toBe("21 March");
  });

  it("writes a caption with the greeting, offer, handle and hashtags", () => {
    expect(
      occasionCaption({
        occasion: occasionById("eid-al-fitr"),
        greeting: "Eid Mubarak",
        message: "May your Eid be filled with joy",
        offer: "20% off with EID20",
        handle: "@pura.bh",
        lang: "en",
      }),
    ).toBe(
      "Eid Mubarak\nMay your Eid be filled with joy\n20% off with EID20\n\n@pura.bh\n\n#EidMubarak #EidAlFitr",
    );
  });
});

/** Records the text drawn and every font set, measuring 11 px per character. */
function recordingContext() {
  const texts: string[] = [];
  const fonts: string[] = [];
  const ctx = new Proxy(
    {},
    {
      get(_target, key) {
        if (key === "fillText") return (text: string) => texts.push(text);
        if (key === "measureText") return (text: string) => ({ width: text.length * 11 });
        if (key === "createRadialGradient") return () => ({ addColorStop: () => undefined });
        return () => undefined;
      },
      set(_target, key, value) {
        if (key === "font") fonts.push(value as string);
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;
  return { ctx, texts, fonts };
}

const scene = (overrides: Partial<SceneData> = {}): SceneData => ({
  width: 1080,
  height: 1920,
  format: "story",
  lang: "en",
  brand: {
    name: "Pura",
    logo: null,
    logoScale: 1,
    logoTint: "auto",
    handle: "@pura.bh",
    contact: null,
    palette: { ground: "#f3ede7", ink: "#330a0a", accent: "#9c6f4c", muted: "#b9a7a2" },
  },
  productName: "Noor",
  headline: "",
  body: "",
  price: null,
  originalPrice: null,
  priceAmount: null,
  originalAmount: null,
  currencyLabel: "BHD",
  issueLabel: "",
  discountPercent: null,
  media: null,
  options: null,
  collection: null,
  detail: null,
  occasion: {
    id: "eid-al-fitr",
    eyebrow: "1448 AH",
    greeting: "Eid Mubarak",
    message: "May your Eid be filled with joy",
    offer: "20% off with EID20",
  },
  ...overrides,
});

describe("the Occasion Pack template", () => {
  it("draws the art first, then the greeting, message, offer and logo rise", () => {
    const early = recordingContext();
    occasionPack.render(early.ctx, 1, scene());
    expect(early.texts).toEqual([]);

    const settled = recordingContext();
    occasionPack.render(settled.ctx, 5, scene());
    expect(settled.texts).toEqual(
      expect.arrayContaining([
        "1448 AH",
        "Eid Mubarak",
        "May your Eid be filled with joy",
        "20% off with EID20",
        "Pura",
        "@pura.bh",
      ]),
    );
  });

  it("sets the greeting smaller where the square post has less room", () => {
    const greetingSize = (format: SceneData["format"]) => {
      const { ctx, fonts } = recordingContext();
      occasionPack.render(ctx, 5, scene({ format, height: format === "square" ? 1080 : 1920 }));
      return Math.max(
        ...fonts
          .filter((value) => value.includes("Cormorant"))
          .map((value) => parseInt(value.split(" ")[2], 10)),
      );
    };
    expect(greetingSize("square")).toBeLessThan(greetingSize("story"));
  });
});

describe("useOccasion", () => {
  const today = day("2026-09-28");

  it("opens on the next occasion with its own words, in the studio's language", () => {
    const { result } = renderHook(() =>
      useOccasion({ active: true, currency: "BHD", isAr: true, handle: "@pura.bh", today }),
    );
    expect(result.current.occasionId).toBe("national-day");
    expect(iso(result.current.occasionDate)).toBe("2026-12-16");
    expect(result.current.occasionScene).toEqual({
      id: "national-day",
      eyebrow: "البحرين",
      greeting: "عيد وطني سعيد",
      message: "دام عزّك يا وطن",
      offer: "",
    });
  });

  it("keeps edited words per occasion, and captions the greeting", () => {
    const { result } = renderHook(() =>
      useOccasion({ active: true, currency: "BHD", isAr: false, handle: "@pura.bh", today }),
    );
    act(() => result.current.setOccasionId("eid-al-fitr"));
    act(() => {
      result.current.setOccasionGreeting("Eid Mubarak from Pura");
      result.current.setOccasionOffer("20% off with EID20");
    });
    expect(result.current.occasionScene).toMatchObject({
      id: "eid-al-fitr",
      greeting: "Eid Mubarak from Pura",
      offer: "20% off with EID20",
    });
    expect(result.current.occasionCaptionText).toContain("Eid Mubarak from Pura");

    act(() => result.current.setOccasionId("ramadan"));
    expect(result.current.occasionScene).toMatchObject({ greeting: "Ramadan Kareem", offer: "" });
    act(() => result.current.setOccasionId("eid-al-fitr"));
    expect(result.current.occasionGreeting).toBe("Eid Mubarak from Pura");
  });

  it("stays out of the scene and the caption on other templates", () => {
    const { result } = renderHook(() =>
      useOccasion({ active: false, currency: "BHD", isAr: false, handle: null, today }),
    );
    expect(result.current.occasionScene).toBeNull();
    expect(result.current.occasionCaptionText).toBeNull();
  });
});
