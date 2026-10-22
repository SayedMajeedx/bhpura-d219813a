import { describe, expect, it } from "vitest";
import { launchTime } from "../src/features/content-studio/lib/moments";
import { studioProducts } from "../src/features/content-studio/lib/studio-content";
import { slitAt } from "../src/features/content-studio/templates/coming-soon";
import { BATCH_TEMPLATES } from "../src/features/content-studio/lib/batch";
import { ENGINE_TEMPLATES } from "../src/features/content-studio/templates";

// Coming Soon: a teaser for a piece the store has not put out yet. It may
// show a hidden product (no other template may), sets the launch day the
// merchant picks, and opens the piece through a slit set off-centre.

describe("the products a template may use", () => {
  const products = [
    { id: "live", is_active: true },
    { id: "hidden", is_active: false },
    { id: "older", is_active: null },
  ];

  it("leaves hidden pieces out of every template but the teaser", () => {
    expect(studioProducts(products, false).map((p) => p.id)).toEqual(["live", "older"]);
  });

  it("puts the hidden pieces first for the teaser, in the list's own order", () => {
    expect(studioProducts(products, true).map((p) => p.id)).toEqual(["hidden", "live", "older"]);
  });
});

describe("the launch hour", () => {
  it("writes an hour as a post says it, minutes only when there are some", () => {
    expect(launchTime("20:00", "en")).toBe("8 PM");
    expect(launchTime("20:30", "en")).toBe("8:30 PM");
    expect(launchTime("00:00", "en")).toBe("12 AM");
    expect(launchTime("12:15", "en")).toBe("12:15 PM");
    expect(launchTime("09:00", "ar")).toBe("9 صباحاً");
    expect(launchTime("21:45", "ar")).toBe("9:45 مساءً");
  });

  it("says nothing for an empty or broken hour", () => {
    expect(launchTime("", "en")).toBeNull();
    expect(launchTime("25:00", "en")).toBeNull();
    expect(launchTime("8pm", "en")).toBeNull();
  });
});

describe("the slit", () => {
  const at = (t: number, rtl: boolean) =>
    slitAt(t, { W: 1080, H: 1920, format: "story", rtl, u: 1 });

  it("starts as nothing, draws a hairline, then opens from its middle", () => {
    expect(at(0, false).open.w).toBe(0);
    const line = at(0.75, false);
    expect(line.open.w).toBeCloseTo(line.full.w);
    expect(line.open.h).toBeLessThan(4);
    const open = at(2, false);
    expect(open.open).toEqual(open.full);
  });

  it("starts at the reading start's margin and runs off the far edge", () => {
    expect(at(2, false).full).toMatchObject({ x: 80, w: 1000 });
    expect(at(2, true).full).toMatchObject({ x: 0, w: 1000 });
    // The hairline is drawn from the reading start.
    expect(at(0.5, true).open.x + at(0.5, true).open.w).toBeCloseTo(1000);
  });

  it("leaves the story's foot free for Instagram's countdown sticker", () => {
    const { full } = at(2, false);
    expect((full.y + full.h) / 1920).toBeLessThan(0.78);
  });
});

describe("the template", () => {
  it("is in the picker but not in the batch export (one teaser per launch)", () => {
    expect(ENGINE_TEMPLATES.some((template) => template.id === "coming-soon")).toBe(true);
    expect(BATCH_TEMPLATES).not.toContain("coming-soon");
  });
});
