import { describe, expect, it, vi } from "vitest";
import { STARTERS, postFromStarter } from "../src/addons/post-kit/content/starters";
import { geometry } from "../src/addons/post-kit/lib/frame";
import { DRAW, TEMPLATES } from "../src/addons/post-kit/lib/layouts";
import { MEME_TEMPLATES, memeWords } from "../src/addons/post-kit/lib/layout-meme";
import { stickerBox } from "../src/addons/post-kit/lib/photo-shape";
import { newSticker } from "../src/addons/post-kit/lib/post-rules";
import { printableStickerIds } from "../src/addons/post-kit/lib/sticker-sheet";
import { STICKERS, drawSticker } from "../src/addons/post-kit/lib/stickers";
import { fromStored } from "../src/addons/post-kit/lib/stored";
import {
  colorOf,
  drawTextSticker,
  fontSize,
  inkOn,
  newText,
  textBox,
} from "../src/addons/post-kit/lib/text-sticker";
import { TONES } from "../src/addons/post-kit/lib/tones";
import type { Ctx, Photo, Post, Sticker } from "../src/addons/post-kit/lib/types";

// The logo is drawn from paths; this test's browser has none, and only counts the calls.
vi.stubGlobal("Path2D", class {});

type Call = { name: string; args: unknown[]; state: Record<string, unknown> };

/**
 * A canvas context that keeps what it was asked to draw: every call, with the colours and font in
 * force at the time. A word is measured at half its font size a letter.
 */
function recorder() {
  const calls: Call[] = [];
  const state: Record<string, unknown> = { font: "400 40px sans-serif" };
  const ctx = new Proxy(state, {
    get(target, key: string) {
      if (key in target) return target[key];
      if (key === "measureText") {
        return (text: string) => {
          const size = parseFloat(/([\d.]+)px/.exec(String(target.font))?.[1] ?? "40");
          return { width: text.length * size * 0.5 };
        };
      }
      if (key === "createPattern") return () => ({});
      return (...args: unknown[]) => {
        calls.push({ name: key, args, state: { ...target } });
      };
    },
    set(target, key: string, value) {
      target[key] = value;
      return true;
    },
  }) as unknown as Ctx;
  const texts = () => calls.filter((c) => c.name === "fillText").map((c) => String(c.args[0]));
  return { ctx, calls, texts };
}

const img = { width: 800, height: 1000 } as HTMLImageElement;
const photo: Photo = { label: "p", img, upload: true };
const sticker: Photo = { label: "s", img, upload: true, sticker: true };
const post = (over: Partial<Post>): Post => ({
  key: "own-x",
  series: "s",
  title: "t",
  tpl: "memeStack",
  tone: "wine",
  size: "post",
  caption: "",
  stickers: [],
  ...over,
});

describe("the meme layouts", () => {
  it("are layouts a post can take, each drawn by its own function", () => {
    for (const key of Object.keys(MEME_TEMPLATES)) {
      expect(TEMPLATES[key]).toBeDefined();
      expect(DRAW[key]).toBeTypeOf("function");
    }
  });

  it("draw both beats' words and both photos", () => {
    for (const tpl of ["memeStack", "memeSide"]) {
      const { ctx, calls, texts } = recorder();
      const s = post({
        tpl,
        labelA: "شلون كنت أفكر",
        labelB: "شلون صرت",
        photo1: "a",
        photo2: "b",
      });
      DRAW[tpl](ctx, s, geometry(s), TONES.wine, { a: photo, b: photo });
      expect(texts().join(" ")).toContain("شلون");
      expect(calls.filter((c) => c.name === "drawImage")).toHaveLength(2);
    }
  });

  it("say what goes in a slot left empty", () => {
    const { ctx, texts } = recorder();
    const s = post({ tpl: "memeNoYes", labelA: "لا", labelB: "إي", photo1: "a" });
    DRAW.memeNoYes(ctx, s, geometry(s), TONES.sand, { a: photo });
    expect(texts()).toContain("حط صورة هني");
  });

  it("set a cut-out sticker whole in its slot, never cropped", () => {
    const { ctx, calls } = recorder();
    const s = post({ tpl: "memeCaption", head: "POV: كلام", photo1: "s" });
    DRAW.memeCaption(ctx, s, geometry(s), TONES.wine, { s: sticker });
    const drawn = calls.filter((c) => c.name === "drawImage");
    expect(drawn).toHaveLength(1);
    // Contained: the whole picture, at its own ratio.
    const [, , , w, h] = drawn[0].args as number[];
    expect(w / h).toBeCloseTo(0.8);
    expect(calls.some((c) => c.name === "clip")).toBe(false);
  });

  it("write a classic meme's words white over a black edge", () => {
    const { ctx, calls } = recorder();
    const end = memeWords(ctx, "الكلام فوق", 540, 100, 900, 90, 300);
    expect(end).toBeGreaterThan(100);
    const stroke = calls.find((c) => c.name === "strokeText");
    const fill = calls.find((c) => c.name === "fillText");
    expect(stroke?.state.strokeStyle).toBe("#0b0b0b");
    expect(fill?.state.fillStyle).toBe("#ffffff");
    expect(memeWords(ctx, "  ", 540, 100, 900, 90, 300)).toBe(100);
  });

  it("start from New post, each with a layout and stickers the kit has", () => {
    const memes = STARTERS.filter((s) => s.id.startsWith("meme") || s.id === "free");
    expect(memes.map((s) => s.id)).toEqual([
      "meme-stack",
      "meme-side",
      "meme-classic",
      "meme-nobody",
      "meme-pov",
      "meme-no-yes",
      "free",
    ]);
    for (const starter of memes) {
      const made = postFromStarter(starter, "own-1", undefined);
      expect(TEMPLATES[made.tpl]).toBeDefined();
      for (const st of made.stickers) expect(STICKERS[st.id]).toBeDefined();
    }
  });
});

describe("the collage pieces", () => {
  it("are drawn in the cloth's colours, with no die-cut edge, and never printed as die-cuts", () => {
    const bare = Object.entries(STICKERS).filter(([, def]) => def.bare);
    expect(bare.map(([id]) => id)).toEqual(
      expect.arrayContaining(["torn-paper", "tape", "arrow-loop", "bubble", "price-tag"]),
    );
    const printable = printableStickerIds();
    for (const [id] of bare) expect(printable).not.toContain(id);
  });

  it("hold their own words, the right way round however they are flipped", () => {
    const s = post({ tpl: "free", bag: "كلام الرسمة" });
    const g = geometry(s);
    const { ctx, texts, calls } = recorder();
    drawSticker(
      ctx,
      { ...newSticker("bubble"), text: "ما أقدر!", flip: true },
      g,
      s,
      TONES.wine,
      {},
    );
    expect(texts()).toContain("ما أقدر!");
    expect(texts()).not.toContain("كلام الرسمة");
    // Flipped, then flipped back for the words.
    expect(calls.filter((c) => c.name === "scale").length).toBeGreaterThanOrEqual(2);
  });

  it("start with their sample words, and marks with none", () => {
    expect(newSticker("torn-paper")).toMatchObject({ text: "شلون صرت" });
    expect(newSticker("arrow-curve").text).toBe(undefined);
    expect(newSticker("text")).toEqual(newText());
  });

  it("take the colour chosen for a mark", () => {
    const s = post({ tpl: "free" });
    const { ctx, calls } = recorder();
    drawSticker(ctx, { ...newSticker("underline"), color: "tag" }, geometry(s), s, TONES.wine, {});
    const strokes = calls.filter((c) => c.name === "stroke");
    expect(strokes.every((c) => c.state.strokeStyle === TONES.wine.tag)).toBe(true);
  });
});

describe("words laid anywhere", () => {
  it("draw in each look, and keep their box for a tap and the handles", () => {
    const tone = TONES.cream;
    const words: Sticker = { ...newText(), text: "سطر أول\nوسطر ثاني", look: "box", color: "tag" };
    const { ctx, calls, texts } = recorder();
    drawTextSticker(ctx, words, tone);
    expect(texts()).toEqual(["سطر أول", "وسطر ثاني"]);
    expect(calls.find((c) => c.name === "fill")?.state.fillStyle).toBe(tone.tag);
    expect(calls.find((c) => c.name === "fillText")?.state.fillStyle).toBe(tone.tagInk);
    const box = textBox(words);
    expect(stickerBox(words)).toMatchObject({ ...box, grip: 0.5 });
    expect(box.h).toBeGreaterThan(fontSize(words) * 2);

    const meme = recorder();
    drawTextSticker(meme.ctx, { ...words, look: "meme" }, tone);
    expect(meme.calls.some((c) => c.name === "strokeText")).toBe(true);
  });

  it("draw nothing when they are empty, and name the cloth's colours", () => {
    const { calls } = recorder();
    drawTextSticker(recorder().ctx, { ...newText(), text: "  " }, TONES.wine);
    expect(calls).toHaveLength(0);
    expect(colorOf(TONES.wine, "bg")).toBe(TONES.wine.bg);
    expect(inkOn(TONES.wine, "bg")).toBe(TONES.wine.ink);
    expect(inkOn(TONES.wine, "white")).toBe("#111111");
  });

  it("keep their words and looks when read back, and drop what is not theirs", () => {
    const template = post({ tpl: "free" });
    const read = fromStored(
      {
        ...template,
        stickers: [
          { ...newText(), look: "meme", align: "right" },
          { ...newText(), look: "neon", color: "gold", align: "up", text: 7 },
          { ...newText(), text: "x".repeat(401) },
        ],
      },
      template,
      { photos: {}, prices: {}, from: null },
    );
    expect(read?.stickers[0]).toMatchObject({ look: "meme", align: "right", text: "اكتب هني" });
    expect(read?.stickers[1]).not.toHaveProperty("look");
    expect(read?.stickers[1]).not.toHaveProperty("color");
    expect(read?.stickers[1]).not.toHaveProperty("align");
    expect(read?.stickers[1]).not.toHaveProperty("text");
    expect(read?.stickers[2]).not.toHaveProperty("text");
  });
});

describe("the ready memes", () => {
  it("leave every photo slot to the store, and say what goes in it", async () => {
    const { MEME_POSTS, MEME_REEL_POSTS } = await import("../src/addons/post-kit/content/memes");
    const all = [...MEME_POSTS, ...MEME_REEL_POSTS];
    expect(MEME_POSTS.length).toBeGreaterThanOrEqual(12);
    for (const meme of all) {
      expect(TEMPLATES[meme.tpl]).toBeDefined();
      expect(meme.photo1).toBe(undefined);
      expect(meme.photo2).toBe(undefined);
      expect(meme.note?.length).toBeGreaterThan(10);
      for (const st of meme.stickers) expect(STICKERS[st.id]).toBeDefined();
      // A price is never written into the kit's content.
      expect(`${meme.caption} ${meme.head ?? ""}`).not.toMatch(/\d+(\.\d+)?\s*(د\.ب|BHD)/);
    }
    for (const meme of MEME_POSTS) expect(meme.caption.length).toBeGreaterThan(10);
  });

  it("make two-beat reels: tall frames, the set-up held a second and a half", async () => {
    const { VIDEO_REELS } = await import("../src/addons/post-kit/content/plan");
    const { POSTS } = await import("../src/addons/post-kit/content/posts");
    const memeReels = VIDEO_REELS.filter((reel) => reel.key.startsWith("meme-"));
    expect(memeReels).toHaveLength(2);
    for (const reel of memeReels) {
      expect(reel.frames.map((frame) => frame.seconds)).toEqual([1.5, 4]);
      for (const frame of reel.frames) {
        expect(POSTS.find((post) => post.key === frame.post)?.size).toBe("story");
      }
    }
  });
});
