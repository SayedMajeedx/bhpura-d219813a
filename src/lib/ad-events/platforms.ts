import { metaPlatform } from "./meta-conversions";
import { snapPlatform } from "./snap-conversions";
import { tiktokPlatform } from "./tiktok-events";
import type { AdPlatform, SendResult } from "./shared";

/**
 * The ad platforms a store's server sends its events to, each with its pixel's switch and id on
 * `brand_tracking_settings` and its token among the store's encrypted credentials.
 */
export const AD_PLATFORM_KEYS = ["meta", "tiktok", "snap"] as const;
export type AdPlatformKey = (typeof AD_PLATFORM_KEYS)[number];

export const AD_PLATFORMS: Record<AdPlatformKey, AdPlatform> = {
  meta: metaPlatform,
  tiktok: tiktokPlatform,
  snap: snapPlatform,
};

/** The pixel columns each platform reads. */
export const PIXEL_COLUMNS: Record<AdPlatformKey, { enabled: string; id: string }> = {
  meta: { enabled: "meta_pixel_enabled", id: "meta_pixel_id" },
  tiktok: { enabled: "tiktok_pixel_enabled", id: "tiktok_pixel_id" },
  snap: { enabled: "snap_pixel_enabled", id: "snap_pixel_id" },
};

/** The platform credentials, kept with the store's other keys and edited under each pixel. */
export const AD_CREDENTIALS: ReadonlySet<string> = new Set(
  AD_PLATFORM_KEYS.map((key) => AD_PLATFORMS[key].credential),
);

/** A pixel that is on and has an id of its platform's shape, or null. */
export function pixelOf(
  key: AdPlatformKey,
  tracking: Record<string, unknown> | null | undefined,
): string | null {
  const columns = PIXEL_COLUMNS[key];
  const id = tracking?.[columns.id];
  return tracking?.[columns.enabled] === true &&
    typeof id === "string" &&
    AD_PLATFORMS[key].validPixel(id)
    ? id
    : null;
}

/** What each platform answered for one event (a platform the store did not set up is absent). */
export type AdResults = Partial<Record<AdPlatformKey, SendResult>>;
