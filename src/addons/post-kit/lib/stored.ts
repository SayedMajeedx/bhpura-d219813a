import { livePost, type Catalogue } from "./photos";
import { TEMPLATES } from "./layouts";
import { STICKERS } from "./stickers";
import { TONES } from "./tones";
import type { Post, Sticker } from "./types";

/**
 * How a post is kept in the store's shared record, and read back.
 *
 * A post's words hold today's prices once `livePost` has filled them in. Kept like that, an edit
 * made to one sticker would freeze the price in its caption for good. So what the merchant did not
 * touch goes back to its token, and only what they typed stays as they typed it.
 */
export function toStored(post: Post, template: Post, catalogue: Catalogue): Post {
  const live = livePost(template, catalogue);
  const stored: Post = { ...post };
  if (post.caption === live.caption) stored.caption = template.caption;
  if (post.label === live.label) {
    stored.label = template.label;
  } else if (post.label && post.photo1 && catalogue.photos[post.photo1]?.full === post.label) {
    // The label the maker writes when a piece is chosen: it follows that piece's price too.
    stored.label = `{full:${post.photo1}}`;
  }
  return stored;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function readSticker(value: unknown): Sticker | null {
  if (!isObject(value)) return null;
  const { id, x, y, s } = value;
  if (typeof id !== "string" || !STICKERS[id]) return null;
  if (![x, y, s].every((n) => typeof n === "number" && Number.isFinite(n))) return null;
  return value as unknown as Sticker;
}

/**
 * A stored post, or null when it cannot be drawn. A kept post comes from a browser, and one bad
 * row must not take the whole page down: a sticker or template the kit no longer has is dropped,
 * and a field a later version added comes from the post as it ships.
 */
export function fromStored(value: unknown, template: Post, catalogue: Catalogue): Post | null {
  if (!isObject(value) || value.key !== template.key) return null;
  if (typeof value.tpl !== "string" || !TEMPLATES[value.tpl]) return null;
  if (typeof value.tone !== "string" || !TONES[value.tone]) return null;
  if (typeof value.caption !== "string") return null;
  const stickers = Array.isArray(value.stickers)
    ? value.stickers.map(readSticker).filter((st): st is Sticker => st !== null)
    : [];
  return livePost({ ...template, ...(value as Partial<Post>), stickers }, catalogue);
}

/** A photo got a new key (it moved to the store's shared record): every use of it follows. */
export function withRenamedPhotos(post: Post, renames: Record<string, string>): Post {
  const renamed = (key: string | undefined) => (key && renames[key]) || key;
  return {
    ...post,
    photo1: renamed(post.photo1),
    photo2: renamed(post.photo2),
    stickers: post.stickers.map((st) => (st.photo ? { ...st, photo: renamed(st.photo) } : st)),
  };
}

/**
 * What this device has not got into the shared record yet: a post to save, or null to take it
 * back to how it came. `at` is when it was changed; 0 for a post from before the shared record.
 */
export type OutboxEntry = { post: Post | null; at: number };
export type Outbox = Record<string, OutboxEntry>;

/**
 * What to send when a device opens the page. A change waiting from an earlier visit goes up unless
 * the shared record has moved on since: a phone that lost its connection last week must not
 * overwrite what the team did this morning.
 */
export function settleOutbox(outbox: Outbox, rows: { post_key: string; updated_at: string }[]) {
  const savedAt = new Map(rows.map((row) => [row.post_key, new Date(row.updated_at).getTime()]));
  const kept: Outbox = {};
  let dropped = 0;
  for (const [key, entry] of Object.entries(outbox)) {
    const saved = savedAt.get(key);
    if (saved !== undefined && saved >= entry.at) dropped += 1;
    else kept[key] = entry;
  }
  return { kept, dropped };
}
