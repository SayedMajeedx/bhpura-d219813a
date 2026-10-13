import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  STORY_HEIGHT,
  STORY_WIDTH,
  publicFirstName,
  reviewStoryFields,
  safeColor,
  storyColor,
  type ReviewScene,
  type StoryLook,
} from "../src/features/review-story/lib/review-story";
import { reviewStory } from "../src/features/review-story/templates/review-story";
import { type OrderReviewAdminRow } from "../src/lib/order-reviews";
import { contrastRatio } from "../src/features/content-studio/lib/studio-styles";

// The customer review story, drawn by the content studio's engine. jsdom has
// no canvas: record what the story would draw instead.
let drawnText: string[] = [];
let scales: Array<[number, number]> = [];

function fakeContext() {
  const noop = () => undefined;
  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "fillText") return (text: string) => drawnText.push(String(text));
        if (prop === "scale") return (x: number, y: number) => scales.push([x, y]);
        if (prop === "measureText") return (text: string) => ({ width: String(text).length * 20 });
        if (prop === "createLinearGradient" || prop === "createRadialGradient") {
          return () => ({ addColorStop: noop });
        }
        return noop;
      },
      set: () => true,
    },
  ) as unknown as CanvasRenderingContext2D;
}

beforeEach(() => {
  drawnText = [];
  scales = [];
  // The story's cached background is painted on its own canvas.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => fakeContext());
});
afterEach(() => vi.restoreAllMocks());

const review: OrderReviewAdminRow = {
  review_id: "r1",
  request_id: "q1",
  order_id: "o1",
  invoice_number: 1042,
  customer_name: "Fatima Al-Mansoor",
  customer_phone: "97339001122",
  rating: 5,
  highlights: ["quality", "delivery"],
  comment: "Beautiful abaya, fast delivery",
  reward_code: "THANKU10",
  reviewed_at: "2026-09-20T10:00:00Z",
  request_sent_at: null,
};

type Choices = Parameters<typeof reviewStoryFields>[0];

const scene = (choices: Partial<Choices> = {}, extra: Partial<ReviewScene> = {}): ReviewScene => ({
  width: STORY_WIDTH,
  height: STORY_HEIGHT,
  media: null,
  look: "classic",
  lang: "en",
  primary: "#330a0a",
  brandName: "Pura",
  logo: null,
  ...reviewStoryFields({
    review,
    comment: review.comment ?? "",
    isAr: false,
    showName: true,
    showHighlights: true,
    showDate: false,
    orderDateText: "",
    showBrandContact: false,
    brandPhone: "",
    brandInstagram: "",
    ...choices,
  }),
  ...extra,
});

/** Draws the finished story (every layer in) and returns the text drawn. */
const draw = (story: ReviewScene, t = reviewStory.duration - 1) => {
  drawnText = [];
  reviewStory.render(fakeContext(), t, story);
  return drawnText.join("\n");
};

describe("customer review story", () => {
  it("lays out a full-resolution Instagram story, scaled to any preview size", () => {
    expect([STORY_WIDTH, STORY_HEIGHT]).toEqual([1080, 1920]);
    draw(scene());
    expect(scales[0]).toEqual([1, 1]);
    scales = [];
    draw(scene({}, { width: 540, height: 960 }));
    expect(scales[0]).toEqual([0.5, 0.5]);
  });

  it("shows the rating, the comment and only the customer's first name", () => {
    const text = draw(scene());
    expect(drawnText.filter((t) => t === "★")).toHaveLength(5);
    expect(text).toContain("Fatima");
    expect(text).not.toContain("Al-Mansoor");
    expect(text).toMatch(/Beautiful abaya/);
    expect(text).toMatch(/Product quality/);
    expect(publicFirstName("  Fatima Al-Mansoor ")).toBe("Fatima");
  });

  it("never draws private order and reward details, in any look", () => {
    for (const look of ["classic", "editorial", "midnight"] as StoryLook[]) {
      const text = draw(
        scene(
          {
            showDate: true,
            orderDateText: "Sep 2026",
            showBrandContact: true,
            brandInstagram: "@pura.bh",
          },
          { look },
        ),
      );
      expect(text).toContain("Sep 2026");
      expect(text).not.toContain("1042");
      expect(text).not.toContain("97339001122");
      expect(text).not.toContain("THANKU10");
    }
  });

  it("leaves the name and highlights out when the merchant turns them off", () => {
    const text = draw(scene({ showName: false, showHighlights: false }));
    expect(text).not.toContain("Fatima");
    expect(text).toContain("Verified customer");
    expect(text).not.toMatch(/Product quality|Delivery/);
  });

  it("shows the store's own contacts only when asked", () => {
    expect(draw(scene())).not.toContain("Instagram:");
    const text = draw(
      scene({ showBrandContact: true, brandInstagram: " @pura.bh ", brandPhone: "+973 3300 0000" }),
    );
    expect(text).toContain("Instagram: @pura.bh   •   Tel: +973 3300 0000");
  });

  it("brings the stars in one after another", () => {
    draw(scene(), 1.2);
    const early = drawnText.filter((t) => t === "★").length;
    expect(early).toBeGreaterThan(0);
    expect(early).toBeLessThan(5);
  });

  it("takes every store's colour from its own settings, never from its name", () => {
    // Pura's storefront wears #330a0a, so its story keeps the maroon it always had.
    expect(storyColor({ accent: "#330a0a", background: null, text: "#0a0a0a" })).toBe("#330a0a");
    expect(storyColor({ accent: "#112233", background: null, text: null })).toBe("#112233");
    expect(storyColor({ accent: null, background: null, text: null })).toBe("#330a0a");
  });

  it("keeps the name, contact and badge readable on the story's light grounds", () => {
    // Too light to read: the storefront's own text colour takes over.
    expect(storyColor({ accent: "#a0738d", background: "#ffffff", text: "#1e1b4b" })).toBe(
      "#1e1b4b",
    );
    // Nothing else reads: the colour is deepened until it does.
    for (const accent of ["#ffd400", "#f5d0e0", "#a0738d"]) {
      const ink = storyColor({ accent, background: null, text: null });
      expect(contrastRatio(ink, "#cfc0b0")).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(ink, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("falls back to a safe colour for anything that is not one", () => {
    expect(safeColor("#AbCdEf")).toBe("#AbCdEf");
    expect(safeColor("red")).toBe("#330a0a");
    expect(safeColor(null)).toBe("#330a0a");
  });
});
