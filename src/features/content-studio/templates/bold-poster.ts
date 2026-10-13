import { drawCover, drawShade, font, type Box } from "@/features/content-studio/engine/draw";
import { drawBrandMark } from "@/features/content-studio/engine/brand-mark";
import { displayFont, STUDIO_FONTS } from "@/features/content-studio/engine/fonts";
import type { FormatKey, SceneData, StudioTemplate } from "@/features/content-studio/engine/scene";
import { fitText, textDirection } from "@/features/content-studio/engine/text-layout";
import { ease, mix, presence, progress } from "@/features/content-studio/engine/timeline";
import { CONTENT_BOTTOM } from "@/features/content-studio/engine/safe-area";
import {
  clipTo,
  drawRisingWords,
  layoutWords,
  tickerOffset,
  wipeBox,
} from "@/features/content-studio/engine/motion";

const DURATION = 7;

/**
 * Fractions of the height: the photo above, the ticker on its edge, the
 * headline below. Stories keep the wordmark under Instagram's top bar; posts
 * close with a footer line.
 */
const LAYOUT: Record<
  FormatKey,
  { photoH: number; topRowY: number; footerY: number | null; headlineMax: number; sticker: number }
> = {
  story: { photoH: 0.56, topRowY: 0.11, footerY: null, headlineMax: 200, sticker: 124 },
  portrait: { photoH: 0.52, topRowY: 0.05, footerY: 0.945, headlineMax: 160, sticker: 108 },
  square: { photoH: 0.46, topRowY: 0.055, footerY: 0.94, headlineMax: 128, sticker: 96 },
};

/** The ticker's height and speed (reference pixels, pixels a second). */
const TICKER_H = 78;
const TICKER_SPEED = 110;

/**
 * The headline's face: the store's own when the merchant uses it, else the
 * studio's heavy sans in both languages (a poster wants weight, not a serif).
 */
function posterFamily(scene: SceneData, dir: "rtl" | "ltr") {
  return scene.brand.displayFamilies
    ? displayFont(dir === "rtl" ? "ar" : "en", scene.brand.displayFamilies)
    : STUDIO_FONTS.body;
}

function render(ctx: CanvasRenderingContext2D, t: number, scene: SceneData) {
  const { width: W, height: H, brand, lang } = scene;
  const { palette } = brand;
  const u = W / 1080;
  const layout = LAYOUT[scene.format];
  const rtl = lang === "ar";
  const margin = 80 * u;
  const startX = rtl ? W - margin : margin;

  ctx.fillStyle = palette.ground;
  ctx.fillRect(0, 0, W, H);

  // The photo, full width, wiping down from the top while it settles.
  const photo: Box = { x: 0, y: 0, w: W, h: layout.photoH * H };
  const shown = wipeBox(photo, progress(t, 0.05, 0.9, ease.outExpo), "top", rtl);
  if (shown.h > 0) {
    ctx.save();
    clipTo(ctx, shown);
    if (scene.media) {
      drawCover(ctx, scene.media, photo, {
        zoom: mix(1.14, 1, progress(t, 0, DURATION, ease.outCubic)),
        focusY: 0.38,
      });
    } else {
      const fill = ctx.createLinearGradient(0, 0, W, photo.h);
      fill.addColorStop(0, palette.accent);
      fill.addColorStop(1, palette.ink);
      ctx.fillStyle = fill;
      ctx.fillRect(photo.x, photo.y, photo.w, photo.h);
    }
    drawShade(ctx, W, photo.h, { height: 0.28, alpha: 0.4 }, { from: 1, alpha: 0 });
    ctx.restore();
  }

  // Wordmark on the photo, and on stories the handle opposite it.
  ctx.save();
  ctx.globalAlpha = presence(t, { start: 0.3, end: DURATION });
  drawBrandMark(ctx, brand, {
    x: startX,
    y: layout.topRowY * H,
    u,
    align: rtl ? "right" : "left",
    onPhoto: true,
    ink: palette.ink,
  });
  const topHandle = layout.footerY === null ? brand.handle || brand.contact : null;
  if (topHandle) {
    ctx.fillStyle = "#ffffff";
    ctx.font = font(26 * u, STUDIO_FONTS.body, 500);
    ctx.direction = "ltr";
    ctx.textAlign = rtl ? "left" : "right";
    ctx.textBaseline = "middle";
    ctx.fillText(topHandle, rtl ? margin : W - margin, layout.topRowY * H);
  }
  ctx.restore();

  // The ticker on the photo's edge: the store and the piece, running in the reading direction.
  const band: Box = { x: 0, y: photo.h - (TICKER_H * u) / 2, w: W, h: TICKER_H * u };
  drawTicker(ctx, t, scene, { band, u, rtl });

  // The headline, as large as the space allows, each word rising from behind its line.
  const headline = (scene.headline.trim() || scene.productName).trim();
  const dir = textDirection(headline);
  const family = posterFamily(scene, dir);
  const text = dir === "ltr" ? headline.toUpperCase() : headline;
  const top = band.y + band.h + 0.035 * H;
  const bottom = (layout.footerY === null ? CONTENT_BOTTOM.story : layout.footerY - 0.045) * H;
  const body = scene.body.trim();
  const bodyRoom = body ? 72 * u : 0;
  // Capitals set tight; Arabic needs room for its marks and descenders.
  const leading = dir === "rtl" ? 1.22 : 0.98;
  let max = layout.headlineMax * u;
  let fit = fitText(text, { maxWidth: W - 2 * margin, maxLines: 3, min: 64 * u, max }, (size) => {
    ctx.font = font(size, family, 600);
    return (line) => ctx.measureText(line).width;
  });
  // A long headline also has to fit the height left: shrink until it does.
  for (
    let step = 0;
    step < 8 && fit.lines.length * fit.size * leading > bottom - top - bodyRoom;
    step++
  ) {
    max = fit.size * 0.88;
    fit = fitText(text, { maxWidth: W - 2 * margin, maxLines: 3, min: 48 * u, max }, (size) => {
      ctx.font = font(size, family, 600);
      return (line) => ctx.measureText(line).width;
    });
  }
  const lineHeight = fit.size * leading;
  ctx.fillStyle = palette.ink;
  ctx.font = font(fit.size, family, 600);
  const words = layoutWords(fit.lines, (word) => ctx.measureText(word).width, {
    x: startX,
    y: top,
    lineHeight,
    dir: rtl ? "rtl" : "ltr",
  });
  ctx.save();
  ctx.globalAlpha = presence(t, { start: 0, end: DURATION, enter: 0.01 });
  drawRisingWords(ctx, words, {
    size: fit.size,
    lineHeight,
    reveal: (word) => progress(t, 0.75 + word.order * 0.075, 0.6, ease.outExpo),
  });
  ctx.restore();

  // One line of body copy under it.
  if (body) {
    const bodyFit = fitText(
      body,
      { maxWidth: W - 2 * margin, maxLines: 1, min: 22 * u, max: 30 * u },
      (size) => {
        ctx.font = font(size, STUDIO_FONTS.body, 400);
        return (line) => ctx.measureText(line).width;
      },
    );
    ctx.save();
    ctx.globalAlpha = presence(t, { start: 1.5, end: DURATION }) * 0.75;
    ctx.fillStyle = palette.ink;
    ctx.font = font(bodyFit.size, STUDIO_FONTS.body, 400);
    ctx.direction = textDirection(body);
    ctx.textAlign = rtl ? "right" : "left";
    ctx.textBaseline = "top";
    ctx.fillText(
      bodyFit.lines[0] ?? body,
      startX,
      top + fit.lines.length * lineHeight + (dir === "rtl" ? 8 : 24) * u,
    );
    ctx.restore();
  }

  // The price sticker, spun onto the photo's corner at the end of the line.
  if (scene.priceAmount) {
    const r = layout.sticker * u;
    drawSticker(ctx, t, scene, {
      r,
      u,
      cx: rtl ? margin + r : W - margin - r,
      cy: band.y - r * 0.55,
    });
  }

  if (layout.footerY !== null) {
    const footer = [brand.handle, brand.contact].filter(Boolean).join("   ·   ");
    if (footer) {
      ctx.save();
      ctx.globalAlpha = presence(t, { start: 1.8, end: DURATION }) * 0.75;
      ctx.fillStyle = palette.ink;
      ctx.font = font(26 * u, STUDIO_FONTS.body, 400);
      ctx.direction = "ltr";
      ctx.textAlign = rtl ? "right" : "left";
      ctx.textBaseline = "middle";
      ctx.fillText(footer, startX, layout.footerY * H);
      ctx.restore();
    }
  }

  // Fade to the ground before the loop starts again on it.
  const fade = progress(t, DURATION - 0.45, 0.45, ease.inCubic);
  if (fade > 0) {
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.fillStyle = palette.ground;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
}

/** The band of the store's ink with its name and the piece's, scrolling without end. */
function drawTicker(
  ctx: CanvasRenderingContext2D,
  t: number,
  scene: SceneData,
  { band, u, rtl }: { band: Box; u: number; rtl: boolean },
) {
  const { palette } = scene.brand;
  const reveal = progress(t, 0.55, 0.6, ease.inOutCubic);
  if (reveal <= 0) return;
  const items = [scene.brand.name, scene.productName]
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => (textDirection(item) === "ltr" ? item.toUpperCase() : item));
  if (items.length === 0) return;
  const shown = wipeBox(band, reveal, "start", rtl);
  ctx.save();
  clipTo(ctx, shown);
  ctx.fillStyle = palette.ink;
  ctx.fillRect(band.x, band.y, band.w, band.h);
  ctx.fillStyle = palette.ground;
  ctx.font = font(30 * u, STUDIO_FONTS.body, 600);
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  const gap = 44 * u;
  const star = "✦";
  const starW = ctx.measureText(star).width;
  // One cycle: each item followed by a star; repeated until the band is covered.
  const parts = items.flatMap((item) => [item, star]);
  const widths = parts.map((part) => (part === star ? starW : ctx.measureText(part).width));
  const cycle = widths.reduce((sum, w) => sum + w + gap, 0);
  const offset = tickerOffset(t, TICKER_SPEED * u, cycle);
  const y = band.y + band.h / 2 + u;
  // Left to right in English (moving left); right to left in Arabic (moving right).
  let x = rtl ? band.w - cycle + offset : -offset;
  if (rtl) while (x > -cycle) x -= cycle;
  for (let pass = 0; x < band.w && pass < 40; pass++) {
    const order = rtl ? [...parts.keys()].reverse() : [...parts.keys()];
    for (const index of order) {
      ctx.direction = parts[index] === star ? "ltr" : textDirection(parts[index]);
      ctx.fillText(parts[index], x, y);
      x += widths[index] + gap;
    }
  }
  ctx.restore();
}

/** A round sticker in the store's colours: the saving above, the amount, the currency under it. */
function drawSticker(
  ctx: CanvasRenderingContext2D,
  t: number,
  scene: SceneData,
  { r, u, cx, cy }: { r: number; u: number; cx: number; cy: number },
) {
  const { palette } = scene.brand;
  const spin = progress(t, 1.2, 0.7, ease.outBack);
  if (spin <= 0 || !scene.priceAmount) return;
  ctx.save();
  ctx.globalAlpha = presence(t, { start: 1.2, end: DURATION, enter: 0.25 });
  ctx.translate(cx, cy);
  ctx.rotate(mix(-1.1, -0.16, spin));
  ctx.scale(spin, spin);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = palette.ground;
  ctx.fill();
  ctx.lineWidth = 4 * u;
  ctx.strokeStyle = palette.ink;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, r - 14 * u, 0, Math.PI * 2);
  ctx.lineWidth = 1.5 * u;
  ctx.stroke();
  ctx.fillStyle = palette.ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const amountFit = fitText(
    scene.priceAmount,
    { maxWidth: r * 1.5, maxLines: 1, min: 28 * u, max: r * 0.56 },
    (size) => {
      ctx.font = font(size, STUDIO_FONTS.body, 600);
      return (line) => ctx.measureText(line).width;
    },
  );
  ctx.font = font(amountFit.size, STUDIO_FONTS.body, 600);
  ctx.direction = "ltr";
  ctx.fillText(scene.priceAmount, 0, 0);
  ctx.font = font(r * 0.2, STUDIO_FONTS.body, 500);
  ctx.direction = textDirection(scene.currencyLabel);
  ctx.fillText(scene.currencyLabel, 0, amountFit.size * 0.72);
  if (scene.discountPercent) {
    ctx.font = font(r * 0.2, STUDIO_FONTS.body, 600);
    ctx.direction = "ltr";
    ctx.fillText(`-${scene.discountPercent}%`, 0, -amountFit.size * 0.74);
  }
  ctx.restore();
}

/** Stop the scroll: a full-width photo, a running ticker and a headline set huge. */
export const boldPoster: StudioTemplate = {
  id: "bold-poster",
  name: { en: "Bold Poster", ar: "بوستر جريء" },
  goal: { en: "Stop the scroll", ar: "يوقف التمرير" },
  duration: DURATION,
  render,
};
