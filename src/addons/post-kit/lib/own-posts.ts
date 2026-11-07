import type { Post } from "./types";

/**
 * The posts a store makes itself, from a starting point or as a copy of another post. They live in
 * the same shared record as an edit (`post_kit_edits`, keys `^[a-z0-9-]{1,60}$`), told apart by
 * their key. A ready post with no row is the post as it shipped; an own post with no row is gone.
 */
const OWN_PREFIX = "own-";
export const OWN_SERIES = "بوستاتكم";

export const isOwnPost = (key: string) => key.startsWith(OWN_PREFIX);

/** Sorts by when it was made, so the newest is first by key alone. */
export function ownPostKey(now = Date.now(), random = Math.random()): string {
  const tail = Math.floor(random * 36 ** 4)
    .toString(36)
    .padStart(4, "0");
  return `${OWN_PREFIX}${now.toString(36)}-${tail}`;
}

/** What a stored own post falls back on for a field a later version adds. */
export const ownTemplate = (key: string): Post => ({
  key,
  series: OWN_SERIES,
  title: "",
  tpl: "joke",
  tone: "wine",
  size: "post",
  stickers: [],
  caption: "",
});

export const newestFirst = (keys: string[]) => [...keys].sort((a, b) => (a < b ? 1 : -1));

/**
 * A copy of a post as it is kept, price tokens and all, so the copy's prices stay live. The note
 * stays behind: it is advice about when to publish the original, and a copy cannot edit it.
 */
export function copyOf(stored: Post, key: string): Post {
  const { note: _note, ...rest } = stored;
  return {
    ...rest,
    key,
    series: OWN_SERIES,
    title: `${stored.title} (نسخة)`,
    stickers: stored.stickers.map((sticker) => ({ ...sticker })),
    crop: stored.crop ? { ...stored.crop } : undefined,
  };
}

/** A Piece card whose piece has left the store has no photo or price to show, so it is not listed. */
export function pieceOnSale(post: Post, photos: Record<string, unknown>) {
  return post.tpl !== "piece" || Boolean(photos[post.photo1 ?? ""]);
}
