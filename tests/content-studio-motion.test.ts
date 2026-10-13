import { describe, expect, it } from "vitest";
import {
  cutPunch,
  layoutWords,
  shotAt,
  shotDrift,
  splitBoxes,
  tickerOffset,
  wipeBox,
} from "../src/features/content-studio/engine/motion";
import { stillTime, type SceneData } from "../src/features/content-studio/engine/scene";
import { reelShots } from "../src/features/content-studio/templates/reel-cut";
import { reelShotUrls } from "../src/features/content-studio/lib/reel-shots";
import { ENGINE_TEMPLATES, templateById } from "../src/features/content-studio/templates";

// The motion kit the faster templates share, and the two templates built on it:
// Reel Cut (a headline hook, cuts through the product's photos, an end card)
// and Bold Poster (a full-width photo, a running ticker, a huge headline).

const box = { x: 0, y: 0, w: 1000, h: 2000 };
/** Every character 10 px wide, a space 10 px: positions are easy to read. */
const measure = (text: string) => text.length * 10;

describe("wipes and splits", () => {
  it("uncovers a box from the reading start: the left in English, the right in Arabic", () => {
    expect(wipeBox(box, 0.25, "start", false)).toEqual({ x: 0, y: 0, w: 250, h: 2000 });
    expect(wipeBox(box, 0.25, "start", true)).toEqual({ x: 750, y: 0, w: 250, h: 2000 });
    expect(wipeBox(box, 0.5, "bottom", false)).toEqual({ x: 0, y: 1000, w: 1000, h: 1000 });
    expect(wipeBox(box, 2, "top", false)).toEqual(box);
    expect(wipeBox(box, -1, "end", false).w).toBe(0);
  });

  it("splits a frame: the first part shrinks to its share, the second fills the rest", () => {
    expect(splitBoxes(box, 0, { ratio: 0.6 }).first).toEqual(box);
    const { first, second } = splitBoxes(box, 1, { ratio: 0.6, gap: 10 });
    expect(first.h).toBe(1200);
    expect(second).toEqual({ x: 0, y: 1210, w: 1000, h: 790 });
  });
});

describe("cuts", () => {
  it("knows which shot plays, holds the last one, and nothing before the first cut", () => {
    const run = { start: 1, length: 1.5, count: 3 };
    expect(shotAt(0.5, run)).toBeNull();
    expect(shotAt(1, run)).toEqual({ index: 0, local: 0, sinceCut: 0 });
    expect(shotAt(3.25, run)).toMatchObject({ index: 1, local: 0.5 });
    expect(shotAt(9, run)).toMatchObject({ index: 2, local: 1 });
    expect(shotAt(2, { ...run, count: 0 })).toBeNull();
  });

  it("drifts each shot the other way from the last", () => {
    expect(shotDrift(0, 0).zoom).toBe(1);
    expect(shotDrift(0, 1).zoom).toBeCloseTo(1.08);
    expect(shotDrift(1, 0).zoom).toBeCloseTo(1.08);
    expect(shotDrift(1, 1).zoom).toBe(1);
    expect(Math.sign(shotDrift(0, 1).focusX - 0.5)).toBe(-Math.sign(shotDrift(1, 1).focusX - 0.5));
  });

  it("punches in at a cut and settles", () => {
    expect(cutPunch(0)).toBeCloseTo(1.07);
    expect(cutPunch(0.1)).toBeLessThan(1.07);
    expect(cutPunch(1)).toBe(1);
  });

  it("scrolls a ticker in a loop with no jump", () => {
    expect(tickerOffset(0, 100, 400)).toBe(0);
    expect(tickerOffset(1, 100, 400)).toBe(100);
    expect(tickerOffset(4.5, 100, 400)).toBe(50);
    expect(tickerOffset(1, 100, 0)).toBe(0);
  });
});

describe("headlines word by word", () => {
  const at = (words: ReturnType<typeof layoutWords>, text: string) =>
    words.find((word) => word.text === text)!;

  it("sets an English line from the left, in reading order", () => {
    const words = layoutWords(["The Silk Edit"], measure, {
      x: 80,
      y: 100,
      lineHeight: 50,
      dir: "ltr",
    });
    expect(words.map((word) => [word.text, word.x, word.order])).toEqual([
      ["The", 80, 0],
      ["Silk", 120, 1],
      ["Edit", 170, 2],
    ]);
  });

  it("sets an Arabic line from the right, the first word read at the right edge", () => {
    const words = layoutWords(["عباية الحرير", "الملكي"], measure, {
      x: 1000,
      y: 0,
      lineHeight: 60,
      dir: "rtl",
    });
    const first = at(words, "عباية");
    expect(first.x + first.width).toBe(1000);
    expect(at(words, "الحرير").x).toBeLessThan(first.x);
    expect(at(words, "الملكي")).toMatchObject({ line: 1, y: 60, order: 2 });
    expect(at(words, "الملكي").x + at(words, "الملكي").width).toBe(1000);
  });

  it("keeps a Latin run inside an Arabic line in its own order, as the browser shows it", () => {
    // Logical: "عباية Royal Silk"; shown: [Royal Silk] then عباية at the right.
    const words = layoutWords(["عباية Royal Silk"], measure, {
      x: 1000,
      y: 0,
      lineHeight: 60,
      dir: "rtl",
    });
    expect(at(words, "عباية").x).toBeGreaterThan(at(words, "Silk").x);
    expect(at(words, "Royal").x).toBeLessThan(at(words, "Silk").x);
    expect(at(words, "Royal").dir).toBe("ltr");
    expect(at(words, "عباية").dir).toBe("rtl");
  });

  it("centres a line on x", () => {
    const words = layoutWords(["ab cd"], measure, {
      x: 500,
      y: 0,
      lineHeight: 10,
      dir: "ltr",
      align: "center",
    });
    // 20 + 10 + 20 = 50 wide, from 475.
    expect(words[0].x).toBe(475);
    expect(words[1].x).toBe(505);
  });
});

describe("Reel Cut's shots", () => {
  const photo = { width: 10, height: 10 } as unknown as HTMLCanvasElement;
  const other = { width: 20, height: 20 } as unknown as HTMLCanvasElement;
  const scene = (media: SceneData["media"], shots: SceneData["shots"]) => ({ media, shots });

  it("cuts between the product's photos when it has several", () => {
    const shots = reelShots(scene(photo, [photo, other, photo, other, photo]));
    expect(shots).toHaveLength(4);
    expect(shots.map((shot) => shot.zoom)).toEqual([1, 1, 1, 1]);
  });

  it("cuts between details of one photo, or of the video frame, otherwise", () => {
    const shots = reelShots(scene(photo, null));
    expect(shots).toHaveLength(4);
    expect(shots.every((shot) => shot.media === photo)).toBe(true);
    expect(shots[0].zoom).toBe(1);
    expect(shots.slice(1).every((shot) => shot.zoom > 1.5)).toBe(true);
    expect(reelShots(scene(null, []))).toEqual([]);
  });

  it("takes the chosen photo first, leaves videos out, and stops at four", () => {
    const media = [
      { url: "a.jpg", type: "image" as const },
      { url: "clip.mp4", type: "video" as const },
      { url: "b.jpg", type: "image" as const },
      { url: "c.jpg", type: "image" as const },
      { url: "d.jpg", type: "image" as const },
      { url: "e.jpg", type: "image" as const },
    ];
    expect(reelShotUrls(media, "c.jpg")).toEqual(["c.jpg", "a.jpg", "b.jpg", "d.jpg"]);
    expect(reelShotUrls(media, "clip.mp4")).toEqual(["a.jpg", "b.jpg", "c.jpg", "d.jpg"]);
    expect(reelShotUrls([], null)).toEqual([]);
  });
});

describe("the new templates", () => {
  it("are offered with the others", () => {
    const ids = ENGINE_TEMPLATES.map((template) => template.id);
    expect(ids).toContain("reel-cut");
    expect(ids).toContain("bold-poster");
  });

  it("show Reel Cut's last shot with its price as the still, and the others one second before the end", () => {
    expect(stillTime(templateById("reel-cut")!)).toBe(5.6);
    expect(stillTime(templateById("bold-poster")!)).toBe(6);
  });
});
