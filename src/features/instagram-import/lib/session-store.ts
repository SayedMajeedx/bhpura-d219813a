import { z } from "zod";
import { productDraftItemSchema } from "./draft-schema";
import type { MergeableDraft } from "./merge-drafts";

/**
 * An import in review is kept in this browser, so closing the window or refreshing the page does
 * not throw away pictures already copied and captions already read (which cost time and AI quota).
 * It is read back when the importer opens, and removed once the products are saved or discarded.
 */

const VERSION = 1;
/** The pictures stay in our storage, but a review left for weeks is probably forgotten. */
export const SESSION_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
/** Well under the usual 5 MB a browser allows for a site's saved data. */
const MAX_BYTES = 3_500_000;

export type ImportSession = {
  version: number;
  savedAt: number;
  username: string;
  drafts: MergeableDraft[];
};

const sessionSchema = z.object({
  version: z.literal(VERSION),
  savedAt: z.number(),
  username: z.string(),
  drafts: z.array(productDraftItemSchema),
});

const keyFor = (brandId: string) => `boutq.instagram-import.session.${brandId}`;

function defaultStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Keeps the review. False when it could not be kept (storage full or unavailable): it never throws. */
export function saveSession(
  brandId: string,
  session: { username: string; drafts: MergeableDraft[] },
  now = Date.now(),
  storage: Storage | null = defaultStorage(),
): boolean {
  if (!storage) return false;
  try {
    const text = JSON.stringify({ version: VERSION, savedAt: now, ...session });
    if (text.length > MAX_BYTES) return false;
    storage.setItem(keyFor(brandId), text);
    return true;
  } catch {
    return false;
  }
}

export function clearSession(brandId: string, storage: Storage | null = defaultStorage()) {
  try {
    storage?.removeItem(keyFor(brandId));
  } catch {
    /* nothing to clear */
  }
}

/** The kept review, or null: none, too old, empty, or not readable (a damaged one is removed). */
export function loadSession(
  brandId: string,
  now = Date.now(),
  storage: Storage | null = defaultStorage(),
): ImportSession | null {
  if (!storage) return null;
  let raw: string | null = null;
  try {
    raw = storage.getItem(keyFor(brandId));
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = sessionSchema.parse(JSON.parse(raw));
    const expired = now - parsed.savedAt > SESSION_MAX_AGE_MS;
    if (expired || parsed.drafts.length === 0) {
      clearSession(brandId, storage);
      return null;
    }
    return { ...parsed, drafts: parsed.drafts as unknown as MergeableDraft[] };
  } catch {
    clearSession(brandId, storage);
    return null;
  }
}
