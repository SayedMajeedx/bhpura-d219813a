import { describe, expect, it } from "vitest";
import { craftOf, madeForYouBeats } from "../src/features/content-studio/lib/made-for-you";
import { chapterAt, seamSewn } from "../src/features/content-studio/templates/made-for-you";
import { BATCH_TEMPLATES } from "../src/features/content-studio/lib/batch";
import { ENGINE_TEMPLATES } from "../src/features/content-studio/templates";

// Made for You: a made-to-order piece in three chapters (what the shopper
// gives, how the store makes it, when it is theirs), a seam sewn across the
// frame as they pass. The words follow the store's craft; the time is the
// one the store wrote, never one made up.

describe("the store's craft", () => {
  it("is read from the vertical and the broader ones it belongs to", () => {
    expect(craftOf("abayas")).toBe("sewn");
    expect(craftOf("fashion")).toBe("sewn");
    expect(craftOf("jewelry")).toBe("crafted");
    expect(craftOf("coffee")).toBe("roasted");
    expect(craftOf("food")).toBe("prepared");
    expect(craftOf("fragrance")).toBe("blended");
    expect(craftOf("gifts")).toBe("made");
    expect(craftOf("spaceships")).toBe("made");
  });
});

describe("the chapters", () => {
  it("end on the making time the store wrote", () => {
    const beats = madeForYouBeats({
      vertical: "abayas",
      lang: "en",
      time: "Ready in 10-14 days",
      name: "Layla Abaya",
    });
    expect(beats.map((beat) => beat.title)).toEqual(["Your measurements", "Cut and sewn", "Yours"]);
    expect(beats[2].line).toBe("Ready in 10-14 days");
  });

  it("name the piece when the store wrote no time, rather than making one up", () => {
    const beats = madeForYouBeats({ vertical: "abayas", lang: "en", time: null, name: "Layla" });
    expect(beats[2].line).toBe("Layla");
    expect(beats.map((beat) => beat.line).join(" ")).not.toMatch(/\d/);
  });

  it("speak a roastery's craft, and call its last chapter the order in Arabic", () => {
    const beats = madeForYouBeats({ vertical: "coffee", lang: "ar", time: null, name: "حبوب" });
    expect(beats[1].title).toBe("تحميص بعد الطلب");
    expect(beats[2].title).toBe("طلبك");
  });

  it("claim nothing a store did not say", () => {
    const all = ["abayas", "jewelry", "coffee", "food", "fragrance", "general"].flatMap(
      (vertical) =>
        (["en", "ar"] as const).flatMap((lang) =>
          madeForYouBeats({ vertical, lang, time: null, name: "x" }),
        ),
    );
    const words = all.map((beat) => `${beat.title} ${beat.line}`).join(" ");
    expect(words).not.toMatch(/hand|يدوي|organic|عضوي|best|أفضل/i);
  });
});

describe("the reel's timing", () => {
  it("plays the chapters in order and holds the last to the end", () => {
    expect(chapterAt(0).index).toBe(0);
    expect(chapterAt(1).index).toBe(0);
    expect(chapterAt(3).index).toBe(1);
    expect(chapterAt(6).index).toBe(2);
    expect(chapterAt(8.9).index).toBe(2);
    expect(chapterAt(3).since).toBeCloseTo(0.05);
  });

  it("sews the seam steadily and finishes it before the loop", () => {
    expect(seamSewn(0)).toBe(0);
    expect(seamSewn(3)).toBeGreaterThan(seamSewn(2));
    expect(seamSewn(7.5)).toBe(1);
  });
});

describe("the template", () => {
  it("is in the picker but not in the batch export", () => {
    expect(ENGINE_TEMPLATES.some((template) => template.id === "made-for-you")).toBe(true);
    expect(BATCH_TEMPLATES).not.toContain("made-for-you");
  });
});
