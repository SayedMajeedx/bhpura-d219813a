import {
  applyMask,
  edgeSamples,
  keptBounds,
  readBackdrop,
  softenEdge,
  trimEdge,
  type Backdrop,
  type Pixels,
} from "./cutout";
import { loadImage } from "./saved";

/* The browser's side of a cut-out: reading a picture's pixels and writing the sticker's PNG. */

/** The longest side a cut-out is worked at: enough for a sticker, quick enough for a brush. */
export const CUTOUT_LONG = 1200;

/**
 * A picture's pixels at the working size. Null when the browser will not let them be read (a
 * picture from a host that does not allow it), so the screen can say so.
 */
export function readPixels(img: HTMLImageElement, long = CUTOUT_LONG): Pixels | null {
  try {
    const k = Math.min(
      1,
      long / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height),
    );
    const width = Math.max(1, Math.round((img.naturalWidth || img.width) * k));
    const height = Math.max(1, Math.round((img.naturalHeight || img.height) * k));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, width, height);
    const { data } = ctx.getImageData(0, 0, width, height);
    return { data, width, height };
  } catch {
    return null;
  }
}

/** The cut as a PNG, trimmed to what is kept. Null when nothing is kept. */
export async function cutoutPng(
  px: Pixels,
  mask: Uint8Array,
): Promise<{ blob: Blob; width: number; height: number } | null> {
  const soft = softenEdge(trimEdge(mask, px.width, px.height), px.width, px.height);
  const box = keptBounds(soft, px.width, px.height);
  if (!box) return null;
  const full = document.createElement("canvas");
  full.width = px.width;
  full.height = px.height;
  full
    .getContext("2d")
    ?.putImageData(new ImageData(applyMask(px, soft), px.width, px.height), 0, 0);
  const out = document.createElement("canvas");
  out.width = box.w;
  out.height = box.h;
  out.getContext("2d")?.drawImage(full, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
  const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, "image/png"));
  return blob ? { blob, width: box.w, height: box.h } : null;
}

/**
 * What an upload is: its size, and its edge, to offer taking a flat background off. Read from its
 * edge only; anything that cannot be read is left out, and the upload goes on without it.
 */
export async function uploadFacts(
  blob: Blob,
): Promise<{ width?: number; height?: number; backdrop?: Backdrop }> {
  let url = "";
  try {
    url = URL.createObjectURL(blob);
    const img = await loadImage(url);
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    if (!width || !height) return {};
    const px = readPixels(img, 400);
    return { width, height, backdrop: px ? readBackdrop(edgeSamples(px)) : undefined };
  } catch {
    return {};
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
}
