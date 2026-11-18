import { describe, expect, it, vi } from "vitest";
import { MEME_POSTS } from "../src/addons/post-kit/content/memes";
import { STARTERS } from "../src/addons/post-kit/content/starters";
import { geometry, logoLeft, stitchedFrame } from "../src/addons/post-kit/lib/frame";
import { DRAW, TEMPLATES } from "../src/addons/post-kit/lib/layouts";
import { slotPicture } from "../src/addons/post-kit/lib/layout-meme";
import { LOOKS, POST_LOOKS, isPostLook, lookOf, threadOf } from "../src/addons/post-kit/lib/looks";
import { newSticker } from "../src/addons/post-kit/lib/post-rules";
import { printableStickerIds } from "../src/addons/post-kit/lib/sticker-sheet";
import { STICKERS } from "../src/addons/post-kit/lib/stickers";
import { fromStored } from "../src/addons/post-kit/lib/stored";
import {
  TATWEEL,
  isStretched,
  stretched,
  toggleStretch,
  unstretched,
} from "../src/addons/post-kit/lib/stretch";
import { colorOf, inkOn } from "../src/addons/post-kit/lib/text-sticker";
import { TONES } from "../src/addons/post-kit/lib/tones";
import type { Post } from "../src/addons/post-kit/lib/types";
import { canvasRecorder } from "./helpers/canvas-recorder";

// The logo is drawn from paths; this test's browser has none, and only counts the calls.
vi.stubGlobal("Path2D", class {});
// The cloth's grain is drawn on a canvas of its own, which this test's browser cannot make.
vi.mock("../src/addons/post-kit/lib/frame", async (original) => ({
  ...(await original<typeof import("../src/addons/post-kit/lib/frame")>()),
  grain: () => ({}),
}));

const post = (over: Partial<Post>): Post => ({
  key: "own-x",
  series: "s",
  title: "t",
  tpl: "memeShow",
  tone: "wine",
  size: "post",
  caption: "",
  stickers: [],
  ...over,
});

describe("a post's look", () => {
  it("is plain unless it says otherwise, and only one of the three", () => {
    expect(lookOf(post({}))).toBe("plain");
    expect(lookOf(post({ look: "lace" }))).toBe("lace");
    expect(lookOf(post({ look: "neon" as never }))).toBe("plain");
    expect(POST_LOOKS).toEqual(["embroidered", "lace", "gold"]);
    expect(isPostLook("gold")).toBe(true);
    expect(isPostLook("velvet")).toBe(false);
    expect(LOOKS.gold.tone).toBe("ink");
  });

  it("centres a larger logo and starts the words below it, clear of its edges", () => {
    const plain = geometry(post({}));
    const dressed = geometry(post({ look: "embroidered" }));
    expect(plain.look).toBe(undefined);
    expect(dressed.look).toBe("embroidered");
    expect(logoLeft(plain)).toBe(plain.W - plain.M - plain.logoW);
    expect(logoLeft(dressed)).toBe((dressed.W - dressed.logoW) / 2);
    expect(dressed.logoW).toBeGreaterThan(plain.logoW);
    expect(dressed.T).toBeGreaterThan(plain.T);
    expect(dressed.B).toBeLessThan(plain.B);
    const story = geometry(post({ look: "lace", size: "story" }));
    expect(story.T).toBeGreaterThan(dressed.T);
  });

  it("draws its own edges in place of the stitched frame", () => {
    const plain = canvasRecorder();
    stitchedFrame(plain.ctx, geometry(post({})), TONES.wine);
    expect(plain.calls.some((c) => c.name === "stroke")).toBe(true);
    expect(plain.calls.some((c) => c.name === "fillRect")).toBe(false);

    const lace = canvasRecorder();
    stitchedFrame(lace.ctx, geometry(post({ look: "lace", tone: "cream" })), TONES.cream);
    // A solid band at the top and the foot, in the cloth's ink.
    const bands = lace.calls.filter((c) => c.name === "fillRect");
    expect(bands).toHaveLength(2);
    expect(bands.every((c) => c.state.fillStyle === TONES.cream.ink)).toBe(true);

    const cuff = canvasRecorder();
    stitchedFrame(cuff.ctx, geometry(post({ look: "gold", tone: "ink" })), TONES.ink);
    const beads = cuff.calls.filter(
      (c) => c.name === "fill" && c.state.fillStyle === TONES.ink.sub,
    );
    expect(beads.length).toBeGreaterThan(30);
  });

  it("embroiders in a dark cloth's gold and a light cloth's ink", () => {
    expect(threadOf(TONES.wine)).toBe(TONES.wine.sub);
    // The abaya black's label colour is cream: its thread is still gold.
    expect(threadOf(TONES.ink)).toBe("#D8B992");
    expect(threadOf(TONES.cream)).toBe(TONES.cream.ink);
    expect(threadOf(TONES.sand)).toBe(TONES.sand.ink);
  });

  it("is kept when read back, and a look this version does not know is read as plain", () => {
    const template = post({});
    const catalogue = { photos: {}, prices: {}, from: null };
    expect(fromStored({ ...template, look: "lace" }, template, catalogue)?.look).toBe("lace");
    const odd = fromStored({ ...template, look: "velvet" }, template, catalogue);
    expect(odd).not.toBe(null);
    expect(odd).not.toHaveProperty("look");
  });
});

describe("the dressed layouts", () => {
  it("are layouts, the show with a ribbon and a punch line and the teaser in gold", () => {
    expect(TEMPLATES.memeShow.fields).toEqual(["lead", "head", "photo1", "foot"]);
    expect(TEMPLATES.memeTeaser.fields).toEqual(["lead", "head"]);
    const s = post({
      look: "embroidered",
      lead: "لكل وحدة تسأل:",
      head: "ليش التفصيل ياخذ وقت؟",
      foot: "لأنها تنخيط على مقاسش",
    });
    const show = canvasRecorder();
    DRAW.memeShow(show.ctx, s, geometry(s), TONES.wine, {});
    expect(show.texts()).toContain("ليش التفصيل ياخذ وقت؟");
    expect(show.calls.some((c) => c.name === "strokeText")).toBe(true);
    expect(show.texts()).toContain("حط صورة هني");

    const t = post({ tpl: "memeTeaser", look: "gold", tone: "ink", lead: "خمّني", head: "باچر" });
    const teaser = canvasRecorder();
    DRAW.memeTeaser(teaser.ctx, t, geometry(t), TONES.ink, {});
    expect(
      teaser.calls.find((c) => c.name === "fillText" && c.args[0] === "باچر")?.state.fillStyle,
    ).toBe(TONES.ink.sub);
  });

  it("sets a cut-out sticker on a pinked swatch of cloth, and a photo in a pinked mount", () => {
    const img = { width: 400, height: 400 } as HTMLImageElement;
    const s = post({ look: "lace", tone: "cream" });
    const swatch = canvasRecorder();
    slotPicture(
      swatch.ctx,
      { label: "s", img, sticker: true },
      100,
      100,
      600,
      600,
      s,
      "photo1",
      TONES.cream,
      14,
      true,
    );
    expect(swatch.calls.find((c) => c.name === "fill")?.state.fillStyle).toBe(TONES.cream.tag);
    expect(swatch.calls.some((c) => c.name === "drawImage")).toBe(true);

    const mount = canvasRecorder();
    slotPicture(
      mount.ctx,
      { label: "p", img },
      100,
      100,
      600,
      600,
      s,
      "photo1",
      TONES.cream,
      14,
      true,
    );
    expect(mount.calls.find((c) => c.name === "fill")?.state.fillStyle).toBe("#FFFDFB");
    expect(mount.calls.some((c) => c.name === "strokeRect")).toBe(true);
  });

  it("start from New post and in the ready memes, each dressed", () => {
    for (const id of ["meme-show", "meme-show-lace", "meme-teaser"]) {
      const starter = STARTERS.find((s) => s.id === id);
      expect(isPostLook(starter?.post.look)).toBe(true);
    }
    const dressed = MEME_POSTS.filter((meme) => meme.look && meme.look !== "plain");
    expect(dressed).toHaveLength(MEME_POSTS.length);
    expect(MEME_POSTS.map((meme) => meme.key)).toEqual(
      expect.arrayContaining(["meme-show-tailoring", "meme-show-arrival", "meme-teaser-new"]),
    );
  });
});

describe("the sewing tools and the second colour", () => {
  it("are drawn pieces listed as tools, laid larger, and never printed as die-cuts", () => {
    const tools = Object.entries(STICKERS).filter(([, def]) => def.group === "tools");
    expect(tools.map(([id]) => id)).toEqual(["tool-spool", "tool-needle", "tool-tape"]);
    const printable = printableStickerIds();
    for (const [id, def] of tools) {
      expect(def.bare).toBe(true);
      expect(printable).not.toContain(id);
      expect(newSticker(id).s).toBe(620);
    }
  });

  it("gives words the cloth's second colour, with its own cloth on a band", () => {
    expect(colorOf(TONES.ink, "sub")).toBe(TONES.ink.sub);
    expect(inkOn(TONES.ink, "sub")).toBe(TONES.ink.bg);
  });
});

describe("stretching the letters", () => {
  it("draws out the last two words that can take it, after a joining letter near the middle", () => {
    const out = stretched("خمّني عبايتنا اللي بتنزل باچر!", 3);
    expect(out).toBe(`خمّني عبايتنا اللي بتنـ${"ـ".repeat(2)}زل باچ${TATWEEL.repeat(3)}ر!`);
    expect(isStretched(out)).toBe(true);
    expect(unstretched(out)).toBe("خمّني عبايتنا اللي بتنزل باچر!");
  });

  it("puts the words back on a second press, and leaves words that cannot take it", () => {
    const once = toggleStretch("بتنزل باچر");
    expect(toggleStretch(once)).toBe("بتنزل باچر");
    // No letter here joins the next: nothing to draw out.
    expect(stretched("ورد دار")).toBe("ورد دار");
    expect(stretched("POV ok")).toBe("POV ok");
  });
});
