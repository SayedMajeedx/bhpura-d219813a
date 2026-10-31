import type { CardFont, Shape } from "./geometry";
import { CARD_FACES, cardFontFamily, roughMeasure, type Measure } from "./type";
import type { CardFontFiles, LogoInfo } from "./content";

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

/** A font address made safe to write inside CSS's url("..."). */
export const cssUrl = (url: string) => url.replace(/["'()\\\s<>]/g, "");

const registered = new Set<string>();

/**
 * Loads the card's faces, and the store's own card fonts when it uploaded them (a canvas does not
 * wait for web fonts). A font that cannot load leaves the cards' own face in its place.
 */
export async function loadCardFonts(files?: CardFontFiles | null): Promise<void> {
  const fonts = globalThis.document?.fonts;
  if (!fonts) return;
  const custom = (["ar", "en"] as const).flatMap((lang) => {
    const url = files?.[lang];
    if (!url) return [];
    const family = cardFontFamily(lang, url);
    if (!registered.has(family) && typeof FontFace !== "undefined") {
      registered.add(family);
      fonts.add(new FontFace(family, `url("${cssUrl(url)}")`, { weight: "100 900" }));
    }
    return [`400 40px "${family}"`];
  });
  await Promise.all([...CARD_FACES, ...custom].map((face) => fonts.load(face).catch(() => [])));
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

/** The rows and columns a picture's mark fills (alpha above a whisper), as fractions of it. */
export function inkBounds(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): { x: number; y: number; w: number; h: number } | null {
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 16) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < x0 || y1 < y0) return null;
  return {
    x: x0 / width,
    y: y0 / height,
    w: (x1 - x0 + 1) / width,
    h: (y1 - y0 + 1) / height,
  };
}

const logos = new Map<string, Promise<LogoInfo | null>>();

/**
 * The store's logo as a card draws it, or null when it cannot be set in one ink: a picture at
 * least 200 pixels wide (or an SVG) whose corners are see-through. A logo on a white box would
 * print as a white box on every coloured card, so the store's name is set instead. Its
 * see-through margins are measured away, so the mark itself, not its padding, meets the card's
 * margin and the line it stands on.
 */
export function inspectLogo(href: string | null | undefined): Promise<LogoInfo | null> {
  if (!href) return Promise.resolve(null);
  let found = logos.get(href);
  if (!found) {
    found = measureLogo(href);
    logos.set(href, found);
  }
  return found;
}

async function measureLogo(href: string): Promise<LogoInfo | null> {
  const svg = /\.svg(\?|$)/i.test(href);
  const img = await loadImage(href);
  if (!img) return null;
  const nw = img.naturalWidth || (svg ? 600 : 0);
  const nh = img.naturalHeight || (svg ? 600 : 0);
  if (!svg && nw < 200) return null;
  const whole = { href, aspect: nw / Math.max(nh, 1), crop: { x: 0, y: 0, w: 1, h: 1 } };
  try {
    // Read at most 600 pixels across: enough to place a mark to a tenth of a millimetre.
    const scale = Math.min(1, 600 / Math.max(nw, nh));
    const w = Math.max(1, Math.round(nw * scale));
    const h = Math.max(1, Math.round(nh * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return svg ? whole : null;
    ctx.drawImage(img, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    const corner = (x: number, y: number) => data[(y * w + x) * 4 + 3];
    if (
      !svg &&
      [corner(0, 0), corner(w - 1, 0), corner(0, h - 1), corner(w - 1, h - 1)].some((a) => a >= 24)
    ) {
      return null;
    }
    const crop = inkBounds(data, w, h);
    if (!crop) return null;
    return { href, aspect: (crop.w * nw) / Math.max(crop.h * nh, 1), crop };
  } catch {
    // A picture the page may not read: an SVG is drawn whole, anything else is not trusted.
    return svg ? whole : null;
  }
}

/** Whether a photo is large enough to fill a printed card's photo window. */
export async function photoUsable(href: string): Promise<boolean> {
  const img = await loadImage(href);
  return Boolean(img && Math.min(img.naturalWidth, img.naturalHeight) >= 700);
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
  // The trimmed mark, exactly in its rectangle, laid in the store's ink.
  const c = shape.crop;
  const tinted = document.createElement("canvas");
  tinted.width = Math.max(Math.round(boxW), 1);
  tinted.height = Math.max(Math.round(boxH), 1);
  const t = tinted.getContext("2d");
  if (!t) return;
  t.drawImage(
    img,
    c.x * img.naturalWidth,
    c.y * img.naturalHeight,
    c.w * img.naturalWidth,
    c.h * img.naturalHeight,
    0,
    0,
    tinted.width,
    tinted.height,
  );
  t.globalCompositeOperation = "source-in";
  t.fillStyle = shape.tint;
  t.fillRect(0, 0, tinted.width, tinted.height);
  ctx.drawImage(tinted, shape.x * s, shape.y * s, boxW, boxH);
}

/** A face as a PNG picture of the trimmed card at 300 dpi. */
export async function cardPng(
  shapes: Shape[],
  size: { w: number; h: number },
  fonts?: CardFontFiles | null,
): Promise<Blob> {
  await loadCardFonts(fonts);
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
