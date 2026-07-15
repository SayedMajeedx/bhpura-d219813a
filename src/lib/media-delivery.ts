export type ResponsiveImagePreset = "thumb" | "card" | "product" | "hero" | "content";

const PRESET_WIDTHS: Record<ResponsiveImagePreset, number[]> = {
  thumb: [96, 160, 240, 320],
  card: [320, 480, 640, 960],
  product: [480, 640, 960, 1200],
  hero: [640, 768, 1280, 1600, 1920],
  content: [480, 768, 960, 1280, 1600],
};

export function imageWidths(preset: ResponsiveImagePreset): number[] {
  return PRESET_WIDTHS[preset];
}

export function cloudflareImageUrl(source: string, width: number, quality = 82): string {
  if (!source || source.startsWith("data:") || source.toLowerCase().includes(".svg")) return source;
  try {
    const url = new URL(source, typeof window === "undefined" ? "https://boutq.store" : window.location.origin);
    // The Free Images plan stops creating new variants at its monthly limit.
    // `onerror=redirect` makes Cloudflare serve the original R2 asset instead
    // of breaking the storefront, and the free plan never overage-bills.
    const options = `width=${width},fit=scale-down,quality=${quality},format=auto,metadata=none,onerror=redirect`;
    // R2 media is served from a Cloudflare-controlled custom hostname, so the
    // transformation can use the same-origin path and retain an inexpensive
    // original fallback when transformations are unavailable.
    if (url.hostname === "media.boutq.store" || url.hostname.endsWith(".boutq.store")) {
      return `${url.origin}/cdn-cgi/image/${options}${url.pathname}${url.search}`;
    }
    const zoneOrigin = typeof window === "undefined" ? "https://boutq.store" : window.location.origin;
    return `${zoneOrigin}/cdn-cgi/image/${options}/${encodeURI(url.toString())}`;
  } catch {
    return source;
  }
}

export function cloudflareImageSrcSet(source: string, preset: ResponsiveImagePreset, quality = 82): string {
  return imageWidths(preset).map((width) => `${cloudflareImageUrl(source, width, quality)} ${width}w`).join(", ");
}

const IMAGEKIT_URL_ENDPOINT = (import.meta.env.VITE_IMAGEKIT_URL_ENDPOINT || "").trim().replace(/\/+$/, "");
const IMAGEKIT_VIDEO_TRANSFORMATION = "w-1280,q-55,f-auto,ac-none";

function imageKitAssetPath(source: string): string | null {
  if (!IMAGEKIT_URL_ENDPOINT || !source || source.startsWith("data:")) return null;
  try {
    const sourceUrl = new URL(source);
    const endpointUrl = new URL(IMAGEKIT_URL_ENDPOINT);
    const isPublicR2Media = sourceUrl.hostname === "media.boutq.store" || sourceUrl.hostname.endsWith(".boutq.store");
    const isImageKitAsset = sourceUrl.hostname === endpointUrl.hostname && sourceUrl.pathname.startsWith(endpointUrl.pathname);
    if (!isPublicR2Media && !isImageKitAsset) return null;

    const endpointPath = endpointUrl.pathname.replace(/^\/+|\/+$/g, "");
    let assetPath = sourceUrl.pathname.replace(/^\/+/, "");
    if (isImageKitAsset && endpointPath && assetPath.startsWith(`${endpointPath}/`)) {
      assetPath = assetPath.slice(endpointPath.length + 1);
    }
    // Do not stack transformations when an ImageKit URL is passed back in.
    assetPath = assetPath.replace(/^tr:[^/]+\//, "");
    return assetPath || null;
  } catch {
    return null;
  }
}

/**
 * Builds one shared ImageKit rendition for all storefront video placements.
 * Keeping this transformation stable prevents every viewport from consuming a
 * separate video-processing unit on the free plan.
 */
export function imageKitVideoUrl(source: string): string | null {
  const assetPath = imageKitAssetPath(source);
  if (!assetPath) return null;
  return `${IMAGEKIT_URL_ENDPOINT}/tr:${IMAGEKIT_VIDEO_TRANSFORMATION}/${assetPath}`;
}

export function imageKitVideoPosterUrl(source: string): string | null {
  const assetPath = imageKitAssetPath(source);
  if (!assetPath) return null;
  return `${IMAGEKIT_URL_ENDPOINT}/${assetPath}/ik-thumbnail.jpg?tr=w-1280,q-72,f-webp`;
}

export function isLikelyImageUrl(source?: string | null): boolean {
  if (!source) return false;
  try {
    return /\.(avif|gif|jpe?g|png|svg|webp)(?:$|\?)/i.test(new URL(source, "https://boutq.store").pathname);
  } catch {
    return false;
  }
}

export type StreamMedia = {
  stream_uid?: string | null;
  stream_iframe_url?: string | null;
  poster_url?: string | null;
};
