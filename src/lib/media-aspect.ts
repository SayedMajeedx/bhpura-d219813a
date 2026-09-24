import { useEffect, useState } from "react";

/**
 * Hero framing contract.
 *
 * Every hero upload records its own aspect ratio (width / height). The
 * storefront sizes the full-bleed frame to that ratio, clamped by CSS
 * max/min heights, and only falls back to letterboxing ("contain" over a
 * blurred ambient fill) when the clamp makes the frame differ from the media.
 */

/** Cropping below this fraction is visually lossless, so we fill instead of letterboxing. */
export const HERO_COVER_TOLERANCE = 0.05;

export type HeroMediaFit = "cover" | "contain";

export function isValidAspect(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0.1 && value < 10;
}

export function aspectFromSize(width: number, height: number): number | null {
  if (!width || !height) return null;
  const aspect = Math.round((width / height) * 10000) / 10000;
  return isValidAspect(aspect) ? aspect : null;
}

/** Fraction of the media that `object-fit: cover` would cut off in this frame. */
export function coverCropFraction(mediaAspect: number, frameAspect: number): number {
  const ratio = mediaAspect / frameAspect;
  return 1 - Math.min(ratio, 1 / ratio);
}

export function heroMediaFit(
  mediaAspect: number | null | undefined,
  frameAspect: number | null | undefined,
  tolerance = HERO_COVER_TOLERANCE,
): HeroMediaFit {
  if (!isValidAspect(mediaAspect) || !isValidAspect(frameAspect)) return "cover";
  return coverCropFraction(mediaAspect, frameAspect) <= tolerance ? "cover" : "contain";
}

/** Reads the intrinsic aspect of a local image or video file before upload. */
export function probeMediaAspect(file: Blob): Promise<number | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  const url = URL.createObjectURL(file);
  const isVideo = file.type.startsWith("video/");
  return measureUrl(url, isVideo).finally(() => URL.revokeObjectURL(url));
}

/**
 * Keeps an uploaded hero image at its original shape. Only oversized images
 * are downscaled (longest edge ≤ maxEdge) so uploads stay under the 12 MB cap;
 * the CDN still serves responsive widths from the stored original.
 */
export async function prepareHeroImage(
  file: File,
  maxEdge = 2560,
): Promise<{ blob: Blob; aspect: number | null }> {
  if (typeof window === "undefined" || typeof createImageBitmap !== "function") {
    return { blob: file, aspect: await probeMediaAspect(file) };
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return { blob: file, aspect: await probeMediaAspect(file) };
  }
  const aspect = aspectFromSize(bitmap.width, bitmap.height);
  const longest = Math.max(bitmap.width, bitmap.height);
  if (longest <= maxEdge) {
    bitmap.close();
    return { blob: file, aspect };
  }
  const scale = maxEdge / longest;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return { blob: file, aspect };
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.9),
  );
  return { blob: blob ?? file, aspect };
}

function measureUrl(url: string, isVideo: boolean): Promise<number | null> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(null), 15000);
    const done = (aspect: number | null) => {
      window.clearTimeout(timer);
      resolve(aspect);
    };
    if (isVideo) {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.muted = true;
      video.playsInline = true;
      video.onloadedmetadata = () => {
        done(aspectFromSize(video.videoWidth, video.videoHeight));
        video.removeAttribute("src");
        video.load();
      };
      video.onerror = () => done(null);
      video.src = url;
    } else {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => done(aspectFromSize(img.naturalWidth, img.naturalHeight));
      img.onerror = () => done(null);
      img.src = url;
    }
  });
}

const measuredAspects = new Map<string, number | null>();
const pendingAspects = new Map<string, Promise<number | null>>();

function measureRemote(url: string, isVideo: boolean): Promise<number | null> {
  if (measuredAspects.has(url)) return Promise.resolve(measuredAspects.get(url) ?? null);
  let pending = pendingAspects.get(url);
  if (!pending) {
    pending = measureUrl(url, isVideo).then((aspect) => {
      measuredAspects.set(url, aspect);
      pendingAspects.delete(url);
      return aspect;
    });
    pendingAspects.set(url, pending);
  }
  return pending;
}

export type AspectProbe = { key: string; url: string; isVideo: boolean };

/**
 * Client-side fallback for media uploaded before aspects were recorded.
 * Prefer passing a poster image for videos: it is already in the HTTP cache
 * as the LCP element, so measuring it costs nothing.
 */
export function useMeasuredAspects(probes: AspectProbe[]): Record<string, number> {
  const signature = probes.map((p) => `${p.key}|${p.url}`).join("\n");
  const [aspects, setAspects] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    for (const probe of probes) {
      const known = measuredAspects.get(probe.url);
      if (isValidAspect(known)) initial[probe.key] = known;
    }
    return initial;
  });

  useEffect(() => {
    if (!probes.length) return;
    let cancelled = false;
    for (const probe of probes) {
      void measureRemote(probe.url, probe.isVideo).then((aspect) => {
        if (cancelled || !isValidAspect(aspect)) return;
        setAspects((prev) =>
          prev[probe.key] === aspect ? prev : { ...prev, [probe.key]: aspect },
        );
      });
    }
    return () => {
      cancelled = true;
    };
    // `signature` captures every probe key and URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return aspects;
}
