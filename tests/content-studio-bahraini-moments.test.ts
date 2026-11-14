import { describe, expect, it } from "vitest";
import {
  captionLead,
  readCaptionVoice,
  studioCaption,
} from "../src/features/content-studio/lib/studio-caption";
import {
  hijriDate,
  nextDate,
  occasionsFor,
  storeCountry,
  upcomingOccasion,
} from "../src/features/content-studio/lib/occasions";

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (date: Date) => date.toISOString().slice(0, 10);
const bahrain = storeCountry("BHD");

describe("Bahrain's own moments", () => {
  it("are offered to a Bahraini store and not to another", () => {
    const ids = (country: ReturnType<typeof storeCountry>) =>
      occasionsFor(country).map((occasion) => occasion.id);
    expect(ids(bahrain)).toEqual(expect.arrayContaining(["gergaoon", "ghabga"]));
    expect(ids(storeCountry("SAR"))).not.toContain("gergaoon");
    expect(ids(storeCountry("KWD"))).not.toContain("ghabga");
  });

  it("put قرقاعون on the middle of Ramadan, 14 Ramadan by Umm al-Qura", () => {
    const date = nextDate("gergaoon", day("2026-11-07"), bahrain);
    expect(hijriDate(date)).toMatchObject({ month: 9, day: 14 });
    expect(iso(date).startsWith("2027-02")).toBe(true);
  });

  it("put the غبقة season inside Ramadan, before قرقاعون", () => {
    const ghabga = nextDate("ghabga", day("2026-11-07"), bahrain);
    expect(hijriDate(ghabga)).toMatchObject({ month: 9, day: 1 });
  });

  it("leave Ramadan itself as what opens the pack when it starts", () => {
    const first = nextDate("ramadan", day("2026-11-07"), bahrain);
    expect(upcomingOccasion(first, bahrain)).toBe("ramadan");
  });
});

describe("the last day to order", () => {
  const making = { ...bahrain, makingDays: 7 };

  it("exists only for a store that wrote its making time", () => {
    const ids = occasionsFor(bahrain).map((occasion) => occasion.id);
    expect(ids).not.toContain("order-by-eid");
    const written = occasionsFor(making).map((occasion) => occasion.id);
    expect(written).toEqual(expect.arrayContaining(["order-by-eid", "order-by-national-day"]));
  });

  it("is National Day less the making time", () => {
    expect(iso(nextDate("order-by-national-day", day("2026-11-07"), making))).toBe("2026-12-09");
  });

  it("follows the store's own time", () => {
    const slower = { ...bahrain, makingDays: 14 };
    expect(iso(nextDate("order-by-national-day", day("2026-11-07"), slower))).toBe("2026-12-02");
  });

  it("is Eid's first day less the making time", () => {
    const orderBy = nextDate("order-by-eid", day("2026-11-07"), making);
    const eid = nextDate("eid-al-fitr", day("2026-11-07"), bahrain);
    expect(eid.getTime() - orderBy.getTime()).toBe(7 * 86_400_000);
  });
});

describe("the Studio's caption", () => {
  const base = {
    headline: "",
    body: "",
    description: null,
    occasion: null,
    madeToOrder: false,
    making: null,
    sizes: [],
    price: null,
    currency: "د.ب",
    lang: "ar" as const,
    voice: "plural" as const,
  };

  it("reads like a person, not a spec sheet", () => {
    const caption = studioCaption({
      ...base,
      headline: "عباية كلاود",
      description: "كحلي راقي وكلوش يفوز\n\nكود: S07",
      occasion: "مناسبات",
      madeToOrder: true,
      making: "التوصيل خلال 7 أيام",
      price: 25,
      voice: "sh",
    });
    expect(caption.split("\n")).toEqual([
      "عباية كلاود",
      "كحلي راقي وكلوش يفوز",
      "لمناسبتش الجاية",
      "وتتفصّل على مقاسش",
      "التوصيل خلال 7 أيام",
      "25 د.ب",
      "اطلبيها من الرابط في البايو",
    ]);
    expect(caption).not.toMatch(/نعم|كود|✂️|💰|📏/);
  });

  it("speaks in the voice the store chose", () => {
    const voiced = (voice: "plural" | "sh" | "j") =>
      studioCaption({ ...base, occasion: "يومي", madeToOrder: true, voice });
    expect(voiced("plural")).toContain("ليومكم");
    expect(voiced("plural")).toContain("اطلبوها");
    expect(voiced("sh")).toContain("ليومش");
    expect(voiced("j")).toContain("على مقاسج");
    expect(voiced("j")).toContain("اطلبيها");
  });

  it("says nothing the product does not say", () => {
    const caption = studioCaption(base);
    expect(caption).toBe("اطلبوها من الرابط في البايو");
    expect(caption).not.toContain("[");
    expect(caption).not.toContain("0.000");
  });

  it("writes in the reader's language", () => {
    const caption = studioCaption({
      ...base,
      lang: "en",
      occasion: "سهرة",
      sizes: ["52", "54"],
      price: 24.5,
      currency: "BHD",
    });
    expect(caption.split("\n")).toEqual([
      "For your next evening out",
      "Ready now in 52 · 54",
      "24.500 BHD",
      "Order from the link in bio",
    ]);
  });

  it("takes the description's first paragraph, and reads a kept voice safely", () => {
    expect(captionLead("سطر\nثاني\n\nكود: S1")).toBe("سطر\nثاني");
    expect(captionLead(null)).toBe("");
    expect(readCaptionVoice("sh")).toBe("sh");
    expect(readCaptionVoice("anything")).toBe("plural");
    expect(readCaptionVoice(null)).toBe("plural");
  });
});
