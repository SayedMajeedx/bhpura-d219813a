import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  STORY_HEIGHT,
  STORY_WIDTH,
  prepareStoryLayers,
  publicFirstName,
  safeColor,
} from "../src/components/reviews/ReviewStoryDialog";
import { storyBrandColor, type OrderReviewAdminRow } from "../src/lib/order-reviews";

// jsdom has no canvas: record what the story would draw instead.
let drawnText: string[] = [];
const canvasSizes: Array<[number, number]> = [];

function fakeContext(canvas: HTMLCanvasElement) {
  canvasSizes.push([canvas.width, canvas.height]);
  const noop = () => undefined;
  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "fillText") return (text: string) => drawnText.push(String(text));
        if (prop === "measureText") return (text: string) => ({ width: String(text).length * 20 });
        if (prop === "createLinearGradient" || prop === "createRadialGradient") {
          return () => ({ addColorStop: noop });
        }
        if (prop === "canvas") return canvas;
        return noop;
      },
      set: () => true,
    },
  );
}

beforeEach(() => {
  drawnText = [];
  canvasSizes.length = 0;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (
    this: HTMLCanvasElement,
  ) {
    return fakeContext(this) as unknown as CanvasRenderingContext2D;
  });
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

const draw = (overrides: Partial<Parameters<typeof prepareStoryLayers>[0]> = {}) =>
  prepareStoryLayers({
    template: "classic",
    review,
    comment: review.comment ?? "",
    brandName: "Pura",
    primary: "#330a0a",
    isAr: false,
    showName: true,
    showHighlights: true,
    ...overrides,
  });

describe("customer review story generator", () => {
  it("draws a full-resolution Instagram story", () => {
    expect([STORY_WIDTH, STORY_HEIGHT]).toEqual([1080, 1920]);
    draw();
    expect(canvasSizes.length).toBeGreaterThan(0);
    for (const size of canvasSizes) expect(size).toEqual([1080, 1920]);
  });

  it("shows the rating, the comment and only the customer's first name", () => {
    draw();
    const text = drawnText.join("\n");
    expect(text).toContain("★★★★★");
    expect(text).toContain("Fatima");
    expect(text).not.toContain("Al-Mansoor");
    expect(text).toMatch(/Beautiful abaya/);
    expect(text).toMatch(/Product quality/);
    expect(publicFirstName("  Fatima Al-Mansoor ")).toBe("Fatima");
  });

  it("never draws private order and reward details, in any template", () => {
    for (const template of ["classic", "editorial", "midnight"] as const) {
      drawnText = [];
      draw({ template, showDate: true, orderDateText: "Sep 2026" });
      const text = drawnText.join("\n");
      expect(text).not.toContain("1042");
      expect(text).not.toContain("97339001122");
      expect(text).not.toContain("THANKU10");
    }
  });

  it("leaves the name and highlights out when the merchant turns them off", () => {
    draw({ showName: false, showHighlights: false });
    const text = drawnText.join("\n");
    expect(text).not.toContain("Fatima");
    expect(text).not.toMatch(/Product quality|Delivery/);
  });

  it("uses the brand color, with Pura maroon for Pura and as the safe default", () => {
    expect(storyBrandColor("PURA", "#112233")).toBe("#330a0a");
    expect(storyBrandColor("lulu", "#112233")).toBe("#112233");
    expect(storyBrandColor("lulu", null)).toBe("#330a0a");
    expect(safeColor("#AbCdEf")).toBe("#AbCdEf");
    expect(safeColor("red")).toBe("#330a0a");
    expect(safeColor(null)).toBe("#330a0a");
  });
});
