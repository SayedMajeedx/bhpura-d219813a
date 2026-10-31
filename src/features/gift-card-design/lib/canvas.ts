import type { Align, CardFont, Shape } from "./geometry";
import { CARD_FACES, roughMeasure, type Measure } from "./type";

/**
 * The browser's side of a card (never run on the server): measuring text in the card's faces,
 * loading its pictures, checking a logo can be set in one ink, and drawing a face on a canvas for
 * the picture a buyer shares on WhatsApp (300 dpi: 1240 x 1748 pixels for a portrait A6).
 */

/** Pixels per millimetre at 300 dpi. */
export const PRINT_SCALE = 300 / 25.4;

const fontString = (font: CardFont, pxPerMm: number) =>
  `${font.weight} ${font.size * pxPerMm}px ${font.family}`;

let measurer: CanvasRenderingContext2D | null | undefined;

/** Measures text as the page will set it (the card's fonts must be loaded first). */
export function pageMeasure(): Measure {
  if (measurer === undefined) {
    measurer =
      typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
  }
  const ctx = measurer;
  if (!ctx) return roughMeasure;
  return (text, font) => {
    ctx.font = fontString(font, 10);
    const width = ctx.measureText(text).width / 10;
    return width + Math.max([...text].length - 1, 0) * (font.spacing ?? 0);
  };
}

/** Loads the card's faces (a canvas does not wait for web fonts). */
export async function loadCardFonts(): Promise<void> {
  const fonts = globalThis.document?.fonts;
  if (!fonts) return;
  await Promise.all(CARD_FACES.map((face) => fonts.load(face).catch(() => [])));
}

const images = new Map<string, Promise<HTMLImageElement | null>>();

/** A picture, loaded once, readable by a canvas (the media host serves it to other pages). */
export function loadImage(href: string): Promise<HTMLImageElement | null> {
  let found = images.get(href);
  if (!found) {
    found = new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.decoding = "async";
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = href;
    });
    images.set(href, found);
  }
  return found;
}

/**
 * Whether a logo can be set in one ink: an SVG, or a picture at least 200 pixels wide whose
 * corners are see-through. A logo on a white box would print as a white box on every coloured
 * card, so the store's name is set instead.
 */
export async function logoUsable(href: string | null | undefined): Promise<boolean> {
  if (!href) return false;
  if (/\.svg(\?|$)/i.test(href)) return true;
  const img = await loadImage(href);
  if (!img || img.naturalWidth < 200) return false;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;
    ctx.drawImage(img, 0, 0);
    const w = img.naturalWidth - 1;
    const h = img.naturalHeight - 1;
    return [
      [0, 0],
      [w, 0],
      [0, h],
      [w, h],
    ].every(([x, y]) => ctx.getImageData(x, y, 1, 1).data[3] < 24);
  } catch {
    return false;
  }
}

/** Whether a photo is large enough to fill a printed card's photo window. */
export async function photoUsable(href: string): Promise<boolean> {
  const img = await loadImage(href);
  return Boolean(img && Math.min(img.naturalWidth, img.naturalHeight) >= 700);
}

function alignedX(align: Align, x: number, w: number, drawn: number) {
  if (align === "left") return x;
  if (align === "right") return x + w - drawn;
  return x + (w - drawn) / 2;
}

async function drawShape(ctx: CanvasRenderingContext2D, shape: Shape, s: number) {
  if (shape.kind === "rect") {
    ctx.beginPath();
    if (shape.radius && "roundRect" in ctx) {
      ctx.roundRect(shape.x * s, shape.y * s, shape.w * s, shape.h * s, shape.radius * s);
    } else {
      ctx.rect(shape.x * s, shape.y * s, shape.w * s, shape.h * s);
    }
    if (shape.fill) {
      ctx.fillStyle = shape.fill;
      ctx.fill();
    }
    if (shape.stroke) {
      ctx.strokeStyle = shape.stroke;
      ctx.lineWidth = (shape.width ?? 0.25) * s;
      ctx.stroke();
    }
    return;
  }
  if (shape.kind === "path") {
    ctx.save();
    ctx.scale(s, s);
    const path = new Path2D(shape.d);
    if (shape.fill) {
      ctx.fillStyle = shape.fill;
      ctx.fill(path);
    }
    if (shape.stroke) {
      ctx.strokeStyle = shape.stroke;
      ctx.lineWidth = shape.width ?? 0.25;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke(path);
    }
    ctx.restore();
    return;
  }
  if (shape.kind === "text") {
    ctx.save();
    ctx.font = fontString(shape.font, s);
    ctx.direction = shape.dir;
    ctx.textAlign = shape.align;
    ctx.textBaseline = "alphabetic";
    if ("letterSpacing" in ctx) {
      (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing =
        `${(shape.font.spacing ?? 0) * s}px`;
    }
    ctx.fillStyle = shape.fill;
    ctx.fillText(shape.text, shape.x * s, shape.y * s);
    ctx.restore();
    return;
  }
  const img = await loadImage(shape.href);
  if (!img || !img.naturalWidth) return;
  const boxW = shape.w * s;
  const boxH = shape.h * s;
  if (shape.kind === "image") {
    const scale = Math.max(boxW / img.naturalWidth, boxH / img.naturalHeight);
    const sw = boxW / scale;
    const sh = boxH / scale;
    ctx.drawImage(
      img,
      (img.naturalWidth - sw) / 2,
      (img.naturalHeight - sh) / 2,
      sw,
      sh,
      shape.x * s,
      shape.y * s,
      boxW,
      boxH,
    );
    return;
  }
  const scale = Math.min(boxW / img.naturalWidth, boxH / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  const tinted = document.createElement("canvas");
  tinted.width = Math.max(Math.round(dw), 1);
  tinted.height = Math.max(Math.round(dh), 1);
  const t = tinted.getContext("2d");
  if (!t) return;
  t.drawImage(img, 0, 0, tinted.width, tinted.height);
  t.globalCompositeOperation = "source-in";
  t.fillStyle = shape.tint;
  t.fillRect(0, 0, tinted.width, tinted.height);
  ctx.drawImage(
    tinted,
    alignedX(shape.align, shape.x * s, boxW, dw),
    shape.y * s + (boxH - dh) / 2,
  );
}

/** A face as a PNG picture of the trimmed card at 300 dpi. */
export async function cardPng(shapes: Shape[], size: { w: number; h: number }): Promise<Blob> {
  await loadCardFonts();
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(size.w * PRINT_SCALE);
  canvas.height = Math.round(size.h * PRINT_SCALE);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("CANVAS_UNAVAILABLE");
  for (const shape of shapes) await drawShape(ctx, shape, PRINT_SCALE);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("PNG_FAILED"))), "image/png"),
  );
}
