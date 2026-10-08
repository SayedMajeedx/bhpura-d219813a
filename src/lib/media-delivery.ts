export type ResponsiveImagePreset = "thumb" | "card" | "product" | "hero" | "content";

const PRESET_WIDTHS: Record<ResponsiveImagePreset, number[]> = {
  thumb: [96, 160, 240, 320],
  card: [240, 360, 480, 640],
  product: [360, 480, 640, 800],
  hero: [380, 640, 960, 1280, 1600, 1920],
  content: [320, 480, 768, 1080],
};

export function imageWidths(preset: ResponsiveImagePreset): number[] {
  return PRESET_WIDTHS[preset];
}

// A page builds the same few addresses over and over (every card asks for each width of its
// picture on every render), and each build parses a URL; remembering the result is cheap and exact.
const urlCache = new Map<string, string>();
const URL_CACHE_LIMIT = 4000;

export function cloudflareImageUrl(source: string, width: number, quality = 75): string {
  if (!source || source.startsWith("data:") || source.toLowerCase().includes(".svg")) return source;
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const key = `${origin}|${width}|${quality}|${source}`;
  const known = urlCache.get(key);
  if (known !== undefined) return known;
  const built = buildCloudflareImageUrl(source, width, quality);
  if (urlCache.size >= URL_CACHE_LIMIT) urlCache.clear();
  urlCache.set(key, built);
  return built;
}

function buildCloudflareImageUrl(source: string, width: number, quality: number): string {
  try {
    const url = new URL(
      source,
      typeof window === "undefined" ? "https://boutq.store" : window.location.origin,
    );
    // ImageKit URLs are already transformed at their origin; proxying them
    // through Cloudflare Image Resizing can produce a transient 403.
    if (url.hostname.endsWith("imagekit.io")) return source;
    const options = `width=${width},fit=scale-down,quality=${quality},format=auto,metadata=none,onerror=redirect`;

    // Use relative same-origin path so requests share HTTP/2-3 connections without cross-origin TLS overhead
    return `/cdn-cgi/image/${options}/${encodeURI(url.toString())}`;
  } catch {
    return source;
  }
}

export function cloudflareImageSrcSet(
  source: string,
  preset: ResponsiveImagePreset,
  quality = 75,
): string | undefined {
  if (!source) return undefined;
  const widths = imageWidths(preset);
  const urls = widths.map((width) => cloudflareImageUrl(source, width, quality));
  if (urls.every((u) => u === urls[0])) {
    return undefined;
  }
  return widths.map((w, i) => `${urls[i]} ${w}w`).join(", ");
}

export function isLikelyImageUrl(source?: string | null): boolean {
  if (!source) return false;
  if (source.startsWith("data:image/") || source.startsWith("blob:")) return true;
  try {
    return /\.(avif|gif|jpe?g|png|svg|webp)(?:$|\?)/i.test(
      new URL(source, "https://boutq.store").pathname,
    );
  } catch {
    return false;
  }
}

export type StreamMedia = {
  stream_uid?: string | null;
  stream_iframe_url?: string | null;
  poster_url?: string | null;
};
