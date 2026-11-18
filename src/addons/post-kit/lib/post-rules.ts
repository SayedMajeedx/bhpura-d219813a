import { photoCrop } from "./frame";
import { STICKERS } from "./stickers";
import { TEMPLATES } from "./layouts";
import { topStickerAt } from "./photo-shape";
import { newText } from "./text-sticker";
import type { Crop, Photo, PhotoBook, Post, Sticker } from "./types";

/** The pure rules behind the maker's buttons: each takes a post and returns the next one. */

export const hasPhotoSlot = (post: Post) => TEMPLATES[post.tpl]?.fields.includes("photo1") ?? false;
export const photoSlots = (post: Post) =>
  TEMPLATES[post.tpl]?.fields.includes("photo2") ? ["photo1", "photo2"] : ["photo1"];
export const fieldsOf = (post: Post) => TEMPLATES[post.tpl]?.fields ?? [];
export const hasSceneText = (post: Post) => post.stickers.some((st) => STICKERS[st.id]?.text);

export type PhotoTarget = {
  /** A framed photo on the post that is selected, by its place in the list. */
  selected?: number;
  slot: "photo1" | "photo2";
  addOnTop?: boolean;
};

/**
 * Putting a photo on a post. The words on the post follow the piece: its name and price, or
 * nothing for the merchant's own photo, since no one can say what that shows.
 */
export function withPhoto(post: Post, key: string, photo: Photo, target: PhotoTarget): Post {
  const next: Post = { ...post, stickers: [...post.stickers] };
  const card = target.selected === undefined ? undefined : post.stickers[target.selected];
  if (card?.id === "photo") {
    next.stickers[target.selected as number] = { ...card, photo: key, crop: undefined };
    return next;
  }
  if (target.addOnTop || !hasPhotoSlot(post)) {
    // Laid bare and straight, in its own shape, as a meme's photo is: a frame is a choice after.
    next.stickers.push({ id: "photo", photo: key, x: 0.5, y: 0.62, s: 520, r: 0, frame: "none" });
    return next;
  }
  next[target.slot] = key;
  if (next.crop) {
    next.crop = { ...next.crop };
    delete next.crop[target.slot];
  }
  if (post.tpl === "photo") next.label = photo.full ?? "";
  if (post.tpl === "proof" && !photo.upload) next.label = photo.name ?? photo.label;
  if (post.tpl === "piece") {
    next.label = photo.full ?? "";
    if (!photo.upload) next.head = photo.name ?? photo.label;
  }
  if (post.tpl === "poll") {
    next[target.slot === "photo1" ? "labelA" : "labelB"] = photo.upload ? "" : photo.label;
  }
  return next;
}

/** What the merchant should check after changing a piece. */
export function photoNotes(post: Post, slot: string, photos: PhotoBook): ("caption" | "eyes")[] {
  const notes: ("caption" | "eyes")[] = [];
  const old = photos[(post as unknown as Record<string, string>)[slot]];
  if (old?.label && post.caption.includes(old.label)) notes.push("caption");
  if (post.stickers.some((st) => st.id === "eyes")) notes.push("eyes");
  return notes;
}

export function cropOf(post: Post, slot: string, sticker?: Sticker): Required<Crop> {
  if (sticker?.id === "photo") return { z: 1, fx: 0.5, fy: 0.05, ...(sticker.crop ?? {}) };
  return photoCrop(post, slot);
}

export function withCrop(post: Post, slot: string, change: Crop, selected?: number): Post {
  const card = selected === undefined ? undefined : post.stickers[selected];
  if (card?.id === "photo") {
    const stickers = [...post.stickers];
    stickers[selected as number] = { ...card, crop: { ...card.crop, ...change } };
    return { ...post, stickers };
  }
  return { ...post, crop: { ...post.crop, [slot]: { ...post.crop?.[slot], ...change } } };
}

/** A photo that left the store or the device: the slots fall back, a framed print goes. */
export function withoutPhoto(post: Post, key: string, fallback: string): Post {
  return {
    ...post,
    photo1: post.photo1 === key ? fallback : post.photo1,
    photo2: post.photo2 === key ? fallback : post.photo2,
    stickers: post.stickers.filter((st) => st.photo !== key),
  };
}

export function newSticker(id: string): Sticker {
  if (id === "text") return newText();
  const def = STICKERS[id];
  if (def?.bare) {
    if (def.ownText) return { id, x: 0.5, y: 0.55, s: 560, r: 0, text: def.sample ?? "" };
    return { id, x: 0.5, y: 0.6, s: def.group === "tools" ? 620 : 420, r: 0 };
  }
  return STICKERS[id]?.stitch
    ? { id, x: 0.45, y: 0.66, s: 680, r: 0 }
    : { id, x: 0.3, y: 0.7, s: 320, r: 0 };
}

/** The sticker under a point of the post, topmost first, its turn and a photo's shape counted. */
export function stickerAt(
  post: Post,
  x: number,
  y: number,
  W: number,
  H: number,
  photos: PhotoBook = {},
): number {
  return topStickerAt(post, x, y, { W, H }, photos);
}

/** One sticker's change, by its place in the list. */
export function withSticker(post: Post, i: number, change: Partial<Sticker>): Post {
  if (!post.stickers[i]) return post;
  return {
    ...post,
    stickers: post.stickers.map((st, at) => (at === i ? { ...st, ...change } : st)),
  };
}

/**
 * A sticker brought forward or sent back one step: the list's order is the order they are drawn,
 * the last on top. Answers the post and where the sticker now is.
 */
export function movedLayer(post: Post, i: number, step: 1 | -1): { post: Post; index: number } {
  const to = i + step;
  if (!post.stickers[i] || to < 0 || to >= post.stickers.length) return { post, index: i };
  const stickers = [...post.stickers];
  [stickers[i], stickers[to]] = [stickers[to], stickers[i]];
  return { post: { ...post, stickers }, index: to };
}

/** A copy of a sticker laid just beside it, on top of everything. */
export function duplicated(post: Post, i: number): { post: Post; index: number } {
  const st = post.stickers[i];
  if (!st) return { post, index: i };
  const copy: Sticker = {
    ...st,
    x: Math.min(1, st.x + 0.04),
    y: Math.min(1, st.y + 0.04),
    crop: st.crop ? { ...st.crop } : undefined,
  };
  const stickers = [...post.stickers, copy];
  return { post: { ...post, stickers }, index: stickers.length - 1 };
}

export function withoutSticker(post: Post, i: number): Post {
  return { ...post, stickers: post.stickers.filter((_, at) => at !== i) };
}

/**
 * A sticker just cut from a photo goes where that photo was laid on the post, with a thin white
 * edge as a sticker has; a photo cut from the library, or from a template's slot, is laid on top.
 * Its old crop goes: the sticker is trimmed to what it kept, so its shape is new.
 */
export function withCutout(
  post: Post,
  sourceKey: string,
  stickerKey: string,
): { post: Post; index: number } {
  let index = -1;
  const stickers = post.stickers.map((st, i) => {
    if (st.id !== "photo" || st.photo !== sourceKey) return st;
    index = i;
    return {
      ...st,
      photo: stickerKey,
      crop: undefined,
      frame: "cut" as const,
      edge: "thin" as const,
    };
  });
  if (index >= 0) return { post: { ...post, stickers }, index };
  return {
    post: { ...post, stickers: [...post.stickers, laidSticker(stickerKey)] },
    index: post.stickers.length,
  };
}

/** One of the store's own stickers, laid on the post as a sticker. */
export const laidSticker = (key: string): Sticker => ({
  id: "photo",
  photo: key,
  x: 0.5,
  y: 0.62,
  s: 520,
  r: 0,
  frame: "cut",
  edge: "thin",
});
