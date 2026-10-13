import type { FormatKey } from "@/features/content-studio/engine/scene";

/**
 * Where a template's content may end, as a fraction of the height: on a story
 * above Instagram's reply bar (the bottom 14% belongs to it), on a feed post
 * above the footer line with the handle and contact.
 */
export const CONTENT_BOTTOM: Record<FormatKey, number> = {
  story: 0.86,
  portrait: 0.9,
  square: 0.89,
};

/**
 * The height a photo gets when the copy is set below it: everything between
 * its top and the copy, so a short headline leaves a larger photo instead of
 * an empty foot. Never less than `min`, where a long text gives way.
 */
export function photoHeight({
  top,
  bottom,
  below,
  min,
}: {
  /** Where the photo starts. */
  top: number;
  /** Where the content must end (CONTENT_BOTTOM in pixels). */
  bottom: number;
  /** The height of everything set under the photo, gaps included. */
  below: number;
  min: number;
}): number {
  return Math.max(min, bottom - below - top);
}
