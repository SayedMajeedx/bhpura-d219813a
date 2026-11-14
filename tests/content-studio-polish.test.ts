import { describe, expect, it } from "vitest";
import { postName } from "../src/features/content-studio/lib/post-name";
import { deadlineParts, endHour } from "../src/features/content-studio/lib/moments";
import {
  captionAmount,
  postCallToAction,
  studioCaption,
} from "../src/features/content-studio/lib/studio-caption";
import { todayPosts } from "../src/features/content-studio/lib/today";
import { shareChecks } from "../src/features/content-studio/lib/share-checks";
import { readRemembered } from "../src/features/content-studio/lib/remembered";
import { knownTemplateId } from "../src/features/content-studio/templates";
import { classicMarkBox } from "../src/features/content-studio/templates/classic";
import type { StoreOffer } from "../src/lib/offers";

// The content studio review of 2026-11-14: a post priced 33 while the offer made it 26.400 (the
// caption read the full price), "ends Saturday" on the Saturday, "عباية | وتر" printed twice, the
// phone as stored digits, and no post said what to do.

describe("a product's name on a post", () => {
  it("sets a catalogue name's piece large and its kind apart", () => {
    expect(postName("عباية | وتر")).toEqual({ kind: "عباية", name: "وتر", label: "عباية وتر" });
    expect(postName("Abaya | Watar")).toMatchObject({ kind: "Abaya", name: "Watar" });
    expect(postName("Silk Abaya")).toEqual({ kind: null, name: "Silk Abaya", label: "Silk Abaya" });
    expect(postName("  ")).toEqual({ kind: null, name: "", label: "" });
  });
});

describe("Last Chance's day", () => {
  const now = new Date(2026, 10, 14, 10, 0); // Saturday 14 November, 10:00

  it("says today and tomorrow by those words, with the hour the offer ends", () => {
    const ends = new Date(2026, 10, 14, 15, 40).toISOString();
    expect(deadlineParts("2026-11-14", "ar", { now, endsAt: ends })).toEqual({
      day: "اليوم",
      date: "الساعة 3:40 العصر",
    });
    expect(deadlineParts("2026-11-14", "en", { now, endsAt: ends })).toEqual({
      day: "Today",
      date: "at 3:40 pm",
    });
    expect(deadlineParts("2026-11-15", "ar", { now })).toEqual({ day: "بكرة", date: "15 نوفمبر" });
  });

  it("names a later day by its weekday and date, and says no hour for an end of day", () => {
    expect(deadlineParts("2026-11-19", "en", { now })).toEqual({
      day: "Thursday",
      date: "19 November",
    });
    expect(endHour(new Date(2026, 10, 14, 23, 59), "ar")).toBeNull();
    expect(endHour(new Date(2026, 10, 14, 0, 0), "en")).toBeNull();
    expect(endHour(new Date(2026, 10, 14, 9, 5), "ar")).toBe("9:05 الصبح");
    expect(endHour(new Date(2026, 10, 14, 20, 0), "ar")).toBe("8:00 الليل");
  });
});

describe("the caption", () => {
  const base = {
    headline: "وتر",
    body: "عباية سودة خفيفة",
    description: null,
    occasion: null,
    madeToOrder: false,
    making: null,
    sizes: [],
    currency: "د.ب.",
    lang: "ar" as const,
    voice: "plural" as const,
  };

  it("says the price the post says: the offer's, with the price before and when it ends", () => {
    const caption = studioCaption({
      ...base,
      name: "عباية وتر",
      price: 26.4,
      was: 33,
      saleEnds: "حتى 14 نوفمبر",
    }).split("\n");
    expect(caption[0]).toBe("عباية وتر");
    expect(caption).toContain("26.400 د.ب. بدل 33 د.ب.");
    expect(caption).toContain("العرض حتى 14 نوفمبر");
  });

  it("writes an amount to the fils, or whole", () => {
    expect(captionAmount(26.4)).toBe("26.400");
    expect(captionAmount(33)).toBe("33");
    expect(captionAmount(24.5)).toBe("24.500");
  });

  it("asks in the store's own voice, naming no piece", () => {
    expect(postCallToAction("plural", "ar")).toBe("اطلبوا من الرابط في البايو");
    expect(postCallToAction("sh", "ar")).toBe("الطلب من الرابط في البايو");
    expect(postCallToAction("j", "en")).toBe("Order from the link in bio");
  });
});

describe("today's post", () => {
  const now = new Date(2026, 10, 14, 10, 0);
  const offer = (over: Partial<StoreOffer>): StoreOffer =>
    ({
      id: "o1",
      kind: "discount",
      discount_type: "percentage",
      discount_value: 20,
      product_ids: [],
      category_slugs: [],
      ends_at: null,
      ...over,
    }) as unknown as StoreOffer;
  const products = [
    { id: "p1", name: "عباية | وتر", is_active: true, created_at: "2026-09-01T00:00:00Z" },
    { id: "p2", name: "عباية | غصن", is_active: true, created_at: "2026-11-10T00:00:00Z" },
    { id: "p3", name: "عباية | سر", is_active: false, created_at: "2026-11-13T00:00:00Z" },
  ];

  it("suggests Last Chance for an offer ending today, and a reveal for a new piece", () => {
    const ends = new Date(2026, 10, 14, 15, 40).toISOString();
    const posts = todayPosts({ offers: [offer({ ends_at: ends })], products, now, lang: "ar" });
    expect(posts.map((post) => [post.templateId, post.productId, post.reason])).toEqual([
      ["last-chance", "p1", "العرض ينتهي اليوم"],
      ["atelier-reveal", "p2", "جديد في المتجر: عباية غصن"],
    ]);
  });

  it("suggests Price Drop for an offer that is on, and nothing from a guess", () => {
    expect(todayPosts({ offers: [offer({})], products, now, lang: "en" })[0]).toMatchObject({
      templateId: "price-drop",
      productId: "p1",
    });
    const old = products.map((product) => ({ ...product, created_at: "2026-01-01T00:00:00Z" }));
    expect(todayPosts({ offers: [], products: old, now, lang: "ar" })).toEqual([]);
    // Free delivery is not a price a post can show.
    expect(
      todayPosts({ offers: [offer({ kind: "free_delivery" })], products: old, now, lang: "ar" }),
    ).toEqual([]);
  });
});

describe("before sharing", () => {
  const now = new Date(2026, 10, 14, 14, 0);
  const base = {
    templateId: "price-drop",
    saleEndsAt: null,
    hasSale: true,
    hasPhoto: true,
    deadlineBacked: true,
    now,
    lang: "en" as const,
  };

  it("warns of an offer about to end, or ended, while the post prices by it", () => {
    const soon = new Date(2026, 10, 14, 15, 40).toISOString();
    expect(shareChecks({ ...base, saleEndsAt: soon }).map((c) => c.key)).toEqual(["offer-ending"]);
    const gone = new Date(2026, 10, 14, 13, 0).toISOString();
    expect(shareChecks({ ...base, saleEndsAt: gone }).map((c) => c.key)).toEqual(["offer-ended"]);
    const later = new Date(2026, 10, 20).toISOString();
    expect(shareChecks({ ...base, saleEndsAt: later })).toEqual([]);
  });

  it("warns of a Last Chance with nothing ending that day, and of a product with no photo", () => {
    expect(
      shareChecks({ ...base, templateId: "last-chance", deadlineBacked: false }).map((c) => c.key),
    ).toEqual(["deadline-unbacked"]);
    expect(shareChecks({ ...base, hasPhoto: false }).map((c) => c.key)).toEqual(["no-photo"]);
    expect(shareChecks({ ...base, hasPhoto: false, templateId: "how-to-order" })).toEqual([]);
  });
});

describe("what the studio remembers on this device", () => {
  it("keeps only a template and a size it knows", () => {
    expect(readRemembered('{"templateId":"price-drop","format":"square"}')).toEqual({
      templateId: "price-drop",
      format: "square",
    });
    expect(readRemembered('{"format":"banner","templateId":7}')).toEqual({});
    expect(readRemembered("not json")).toEqual({});
    expect(knownTemplateId("price-drop")).toBe("price-drop");
    expect(knownTemplateId("gone-template")).toBe("classic");
  });
});

describe("Classic's logo", () => {
  it("grows down from where it stands, never up through the frame (the owner's report)", () => {
    const small = classicMarkBox("portrait", 1350, 1, 1);
    const large = classicMarkBox("portrait", 1350, 1, 2.2);
    expect(large.top).toBe(small.top);
    expect(large.height).toBeCloseTo(small.height * 2.2);
    // The frame's line is 28 in: the mark starts below it with room to spare.
    expect(large.top).toBeGreaterThanOrEqual(50);
    expect(classicMarkBox("story", 1920, 1, 2.2).top).toBeGreaterThanOrEqual(50);
  });
});
