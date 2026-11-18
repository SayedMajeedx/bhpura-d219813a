import { describe, expect, it } from "vitest";
import {
  canRedo,
  canUndo,
  commit,
  redo,
  startHistory,
  undo,
} from "../src/addons/post-kit/lib/history";
import { imageFiles, isTyping } from "../src/addons/post-kit/lib/pasted";
import {
  clampTurn,
  frameOf,
  fullWidthSize,
  handleAt,
  handlesOf,
  onSticker,
  photoBox,
  photoTooSmall,
  pinched,
  shadowOf,
  sizedFrom,
  turnedTo,
} from "../src/addons/post-kit/lib/photo-shape";
import {
  duplicated,
  movedLayer,
  stickerAt,
  withPhoto,
  withoutSticker,
} from "../src/addons/post-kit/lib/post-rules";
import { hasTransparency, savedType } from "../src/addons/post-kit/lib/saved";
import { fromStored } from "../src/addons/post-kit/lib/stored";
import type { PhotoBook, Post, Sticker } from "../src/addons/post-kit/lib/types";

const post = (over: Partial<Post> = {}): Post => ({
  key: "k",
  series: "s",
  title: "t",
  tpl: "joke",
  tone: "wine",
  size: "post",
  caption: "",
  stickers: [],
  ...over,
});
const g = { W: 1080, H: 1350 };
const wide = { width: 1600, height: 900 } as HTMLImageElement;
const tall = { width: 600, height: 1200 } as HTMLImageElement;
const photos: PhotoBook = {
  wide: { label: "w", img: wide, upload: true },
  tall: { label: "t", img: tall, upload: true },
};
const laid = (over: Partial<Sticker> = {}): Sticker => ({
  id: "photo",
  photo: "wide",
  x: 0.5,
  y: 0.5,
  s: 600,
  frame: "none",
  ...over,
});

describe("an uploaded picture keeps what it is", () => {
  it("finds see-through pixels, and keeps such a picture a PNG", () => {
    const solid = [10, 20, 30, 255, 40, 50, 60, 255];
    const sticker = [10, 20, 30, 255, 0, 0, 0, 0];
    expect(hasTransparency(solid)).toBe(false);
    expect(hasTransparency(sticker)).toBe(true);
    // A photo's soft edge a touch short of solid is not a hole.
    expect(hasTransparency([1, 2, 3, 252])).toBe(false);
    expect(savedType(true)).toBe("image/png");
    expect(savedType(false)).toBe("image/jpeg");
  });
});

describe("a photo laid on a post", () => {
  it("is laid bare, straight and in its own shape", () => {
    const next = withPhoto(post(), "wide", photos.wide, { slot: "photo1" });
    expect(next.stickers[0]).toMatchObject({ id: "photo", frame: "none", r: 0 });
    expect(photoBox(next.stickers[0], wide)).toEqual({ w: 520, h: 292.5 });
  });

  it("keeps its frame when the photo inside it is replaced", () => {
    const start = post({ stickers: [laid({ frame: "tape" })] });
    const next = withPhoto(start, "tall", photos.tall, { slot: "photo1", selected: 0 });
    expect(next.stickers[0]).toMatchObject({ photo: "tall", frame: "tape" });
  });

  it("draws one laid before the frames as the print it was", () => {
    const old = laid({ frame: undefined });
    expect(frameOf(old)).toBe("polaroid");
    expect(shadowOf(old)).toBe(true);
    expect(photoBox(old, wide)).toEqual({ w: 480, h: 600 });
    expect(shadowOf(laid())).toBe(false);
    expect(shadowOf(laid({ shadow: true }))).toBe(true);
  });

  it("gives a tall photo its height and a wide one its width", () => {
    expect(photoBox(laid({ photo: "tall" }), tall)).toEqual({ w: 300, h: 600 });
    expect(fullWidthSize(laid(), wide, 1080)).toBe(1080);
    expect(fullWidthSize(laid({ photo: "tall" }), tall, 1080)).toBe(1620);
  });

  it("says when a small picture is stretched past what it holds", () => {
    const small = { width: 236, height: 300 } as HTMLImageElement;
    expect(photoTooSmall(laid({ s: 300 }), small)).toBe(false);
    expect(photoTooSmall(laid({ s: 800 }), small)).toBe(true);
    expect(photoTooSmall(laid({ s: 300 }), small, { z: 3 })).toBe(true);
    expect(photoTooSmall(laid(), undefined)).toBe(false);
  });
});

describe("holding what is on the post", () => {
  it("lands on a photo by its own shape, not a square", () => {
    const st = laid();
    // 600 by 337.5: inside its width, outside its height.
    expect(onSticker(st, 0.5 + 280 / 1080, 0.5, g, photos)).toBe(true);
    expect(onSticker(st, 0.5, 0.5 + 200 / 1350, g, photos)).toBe(false);
  });

  it("counts a sticker's turn", () => {
    const st = laid({ r: 90 });
    // Turned upright, the wide photo reaches up and down, not sideways.
    expect(onSticker(st, 0.5, 0.5 + 280 / 1350, g, photos)).toBe(true);
    expect(onSticker(st, 0.5 + 280 / 1080, 0.5, g, photos)).toBe(false);
  });

  it("still finds the topmost drawn sticker", () => {
    const p = post({
      stickers: [
        { id: "eyes", x: 0.5, y: 0.5, s: 400 },
        { id: "bag", x: 0.5, y: 0.5, s: 200 },
      ],
    });
    expect(stickerAt(p, 0.5, 0.5, 1080, 1350)).toBe(1);
    expect(stickerAt(p, 0.05, 0.05, 1080, 1350)).toBe(-1);
  });

  it("finds the size handle at a corner and the turn handle above", () => {
    const st = laid();
    const h = handlesOf(st, g, photos);
    expect(h.size).toEqual({ x: 840, y: 675 + 168.75 });
    expect(handleAt(st, h.size.x / 1080, h.size.y / 1350, g, 30, photos)).toBe("size");
    expect(handleAt(st, h.turn.x / 1080, h.turn.y / 1350, g, 30, photos)).toBe("turn");
    expect(handleAt(st, 0.5, 0.5, g, 30, photos)).toBe(null);
  });

  it("sizes by the corner, turns by the top and pinches with two fingers", () => {
    const c = { x: 500, y: 500 };
    expect(sizedFrom(400, c, { x: 600, y: 500 }, { x: 700, y: 500 })).toBe(800);
    expect(sizedFrom(400, c, { x: 600, y: 500 }, { x: 501, y: 500 })).toBe(60);
    expect(turnedTo(c, { x: 500, y: 300 })).toBe(0);
    expect(turnedTo(c, { x: 700, y: 500 })).toBe(90);
    const start = { s: 300, r: 0, a: { x: 0, y: 0 }, b: { x: 100, y: 0 } };
    expect(pinched(start, { x: 0, y: 0 }, { x: 0, y: 200 })).toEqual({ s: 600, r: 90 });
  });

  it("settles a turn on straight and keeps it within a half turn", () => {
    expect(clampTurn(2)).toBe(0);
    expect(clampTurn(190)).toBe(-170);
    expect(clampTurn(-200)).toBe(160);
  });

  it("moves a layer, copies and removes", () => {
    const p = post({ stickers: [laid(), laid({ photo: "tall" })] });
    const back = movedLayer(p, 1, -1);
    expect(back.index).toBe(0);
    expect(back.post.stickers[0].photo).toBe("tall");
    expect(movedLayer(p, 1, 1)).toEqual({ post: p, index: 1 });
    const copy = duplicated(p, 0);
    expect(copy.index).toBe(2);
    expect(copy.post.stickers[2].photo).toBe("wide");
    expect(copy.post.stickers[2].x).toBeCloseTo(0.54);
    expect(withoutSticker(p, 0).stickers).toEqual([p.stickers[1]]);
  });
});

describe("undo and redo", () => {
  it("goes back to where the merchant paused, and forward again", () => {
    const a = post({ head: "a" });
    const b = post({ head: "b" });
    const c = post({ head: "c" });
    let h = startHistory(a);
    expect(canUndo(h, a)).toBe(false);
    h = commit(h, b);
    // A change not yet kept is undone too.
    const back = undo(h, c);
    expect(back?.post).toEqual(b);
    const first = undo(back!.history, back!.post);
    expect(first?.post).toEqual(a);
    expect(undo(first!.history, a)).toBe(null);
    expect(canRedo(first!.history, a)).toBe(true);
    const again = redo(first!.history, a);
    expect(again?.post).toEqual(b);
    // A new change drops what was undone.
    const changed = commit(again!.history, post({ head: "d" }));
    expect(redo(changed, post({ head: "d" }))).toBe(null);
  });
});

describe("pasting, dropping and reading back", () => {
  it("takes only pictures, and leaves Ctrl+Z to a field being typed in", () => {
    const pic = new File(["x"], "a.png", { type: "image/png" });
    const text = new File(["x"], "a.txt", { type: "text/plain" });
    expect(imageFiles([pic, text])).toEqual([pic]);
    expect(imageFiles(null)).toEqual([]);
    const field = document.createElement("textarea");
    expect(isTyping(field)).toBe(true);
    expect(isTyping(document.createElement("canvas"))).toBe(false);
  });

  it("keeps a photo's frame, and reads a frame it does not know as a print", () => {
    const template = post();
    const catalogue = { photos: {}, prices: {}, from: null };
    const kept = fromStored(
      {
        ...template,
        stickers: [laid({ frame: "cut", shadow: false }), laid({ frame: "x" as never })],
      },
      template,
      catalogue,
    );
    expect(kept?.stickers[0]).toMatchObject({ frame: "cut", shadow: false });
    expect(kept?.stickers[1].frame).toBe(undefined);
    expect(frameOf(kept!.stickers[1])).toBe("polaroid");
  });
});
