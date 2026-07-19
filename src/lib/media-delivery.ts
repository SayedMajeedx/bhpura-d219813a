import { getEnvVariable } from "@/integrations/supabase/auth-middleware";

export type ResponsiveImagePreset = "thumb" | "card" | "product" | "hero" | "content";

const PRESET_WIDTHS: Record<ResponsiveImagePreset, number[]> = {
  thumb: [96, 160, 240, 320],
  card: [320, 480, 640, 960],
  product: [480, 640, 960, 1200],
  hero: [640, 768, 1280, 1600, 1920],
  content: [480, 768, 960, 1280, 1600],
};

const CLOUDFLARE_IMAGE_TRANSFORM_ORIGIN = "https://media.boutq.store";

export function imageWidths(preset: ResponsiveImagePreset): number[] {
  return PRESET_WIDTHS[preset];
}

export function cloudflareImageUrl(source: string, width: number, quality = 82): string {
  if (!source || source.startsWith("data:") || source.toLowerCase().includes(".svg")) return source;
  try {
    const url = new URL(source, typeof window === "undefined" ? "https://boutq.store" : window.location.origin);
    const options = `width=${width},fit=scale-down,quality=${quality},format=auto,metadata=none,onerror=redirect`;
    
    // 1. If the source is on the media.boutq.store custom domain, we run same-host transformations 
    // directly on media.boutq.store, which natively supports Cloudflare Image Resizing.
    if (url.hostname === "media.boutq.store" || url.hostname.endsWith(".boutq.store")) {
      return `https://media.boutq.store/cdn-cgi/image/${options}${url.pathname}${url.search}`;
    }

    // 2. Otherwise, request transformations from the current active storefront origin (or zone)
    const transformOrigin = (typeof window !== "undefined" && window.location.origin)
      ? window.location.origin
      : CLOUDFLARE_IMAGE_TRANSFORM_ORIGIN;

    return `${transformOrigin}/cdn-cgi/image/${options}/${encodeURI(url.toString())}`;
  } catch {
    return source;
  }
}

export function cloudflareImageSrcSet(source: string, preset: ResponsiveImagePreset, quality = 82): string {
  return imageWidths(preset).map((width) => `${cloudflareImageUrl(source, width, quality)} ${width}w`).join(", ");
}

/**
 * Robust getter for the ImageKit URL endpoint, supporting both compiled VITE_ pre-bakes,
 * dynamic window environment variables injected during SSR layout script hydration, 
 * and dynamic Cloudflare Page dashboard context lookups at server runtime.
 */
function getImageKitEndpoint(): string {
  // 1. Try static client-side build injection
  const staticVal = (import.meta.env.VITE_IMAGEKIT_URL_ENDPOINT || "").trim();
  if (staticVal) return staticVal.replace(/\/+$/, "");

  // 2. Try window global injected during SSR layout script dehydration
  if (typeof window !== "undefined") {
    const injectedVal = ((window as any).__PUBLIC_ENV__?.VITE_IMAGEKIT_URL_ENDPOINT || "").trim();
    if (injectedVal) return injectedVal.replace(/\/+$/, "");
  }

  // 3. Try dynamic server-side worker context lookup
  const dynamicVal = (getEnvVariable("VITE_IMAGEKIT_URL_ENDPOINT") || getEnvVariable("IMAGEKIT_URL_ENDPOINT") || "").trim();
  return dynamicVal.replace(/\/+$/, "");
}

const IMAGEKIT_DESKTOP_VIDEO_TRANSFORMATION = "w-1280,q-55,f-auto,ac-none";
const IMAGEKIT_MOBILE_VIDEO_TRANSFORMATION = "w-720,q-48,f-auto,ac-none";

function imageKitAssetPath(source: string): string | null {
  const endpoint = getImageKitEndpoint();
  if (!endpoint || !source || source.startsWith("data:")) return null;
  try {
    const sourceUrl = new URL(source);
    const endpointUrl = new URL(endpoint);
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
export function imageKitVideoUrl(source: string, viewport: "mobile" | "desktop" = "desktop"): string | null {
  const assetPath = imageKitAssetPath(source);
  if (!assetPath) return null;
  const endpoint = getImageKitEndpoint();
  const transformation = viewport === "mobile"
    ? IMAGEKIT_MOBILE_VIDEO_TRANSFORMATION
    : IMAGEKIT_DESKTOP_VIDEO_TRANSFORMATION;
  return `${endpoint}/tr:${transformation}/${assetPath}`;
}

export function imageKitVideoPosterUrl(source: string): string | null {
  const assetPath = imageKitAssetPath(source);
  if (!assetPath) return null;
  const endpoint = getImageKitEndpoint();
  return `${endpoint}/${assetPath}/ik-thumbnail.jpg?tr=w-1280,q-72,f-webp`;
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
