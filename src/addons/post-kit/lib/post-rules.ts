import { photoCrop } from "./frame";
import { STICKERS } from "./stickers";
import { TEMPLATES } from "./layouts";
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
    next.stickers.push({ id: "photo", photo: key, x: 0.3, y: 0.68, s: 460, r: -4 });
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
  return STICKERS[id]?.stitch
    ? { id, x: 0.45, y: 0.66, s: 680, r: 0 }
    : { id, x: 0.3, y: 0.7, s: 320, r: 0 };
}

/** The sticker under a point of the post, topmost first. */
export function stickerAt(post: Post, x: number, y: number, W: number, H: number): number {
  for (let i = post.stickers.length - 1; i >= 0; i--) {
    const st = post.stickers[i];
    if (Math.abs(x - st.x) * W < st.s * 0.42 && Math.abs(y - st.y) * H < st.s * 0.42) return i;
  }
  return -1;
}
