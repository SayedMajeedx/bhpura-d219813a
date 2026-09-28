import { drawBrandMark } from "@/features/content-studio/engine/brand-mark";
import {
  drawCover,
  drawLines,
  font,
  withAlpha,
  type Box,
} from "@/features/content-studio/engine/draw";
import { displayFont, STUDIO_FONTS } from "@/features/content-studio/engine/fonts";
import type { FormatKey, SceneData, StudioTemplate } from "@/features/content-studio/engine/scene";
import { fitText, textDirection } from "@/features/content-studio/engine/text-layout";
import { ease, mix, presence, progress } from "@/features/content-studio/engine/timeline";

const DURATION = 7;
const OVER_PHOTO = "#ffffff";

/**
 * Where things sit in each format (fractions of the height). On stories the
 * wordmark row sits below Instagram's top bar and the prices end above its
 * reply bar; feed posts end with a footer line.
 */
const LAYOUT: Record<
  FormatKey,
  { topRowY: number; photoH: number; footerY: number | null; priceMax: number }
> = {
  story: { topRowY: 0.11, photoH: 0.63, footerY: null, priceMax: 190 },
  portrait: { topRowY: 0.05, photoH: 0.58, footerY: 0.945, priceMax: 170 },
  square: { topRowY: 0.055, photoH: 0.48, footerY: 0.94, priceMax: 140 },
};

function render(ctx: CanvasRenderingContext2D, t: number, scene: SceneData) {
  const { width: W, height: H, brand, lang } = scene;
  const { palette } = brand;
  const u = W / 1080;
  const layout = LAYOUT[scene.format];
  const rtl = lang === "ar";
  const margin = 80 * u;
  const startX = rtl ? W - margin : margin;
  const onSale = Boolean(scene.originalAmount && scene.discountPercent);
  const out = (start: number, enter?: number) =>
    presence(t, { start, end: DURATION, ...(enter ? { enter } : {}) });

  ctx.fillStyle = palette.ground;
  ctx.fillRect(0, 0, W, H);

  // Full-bleed photo that settles slowly and fades into the ground below.
  const photo: Box = { x: 0, y: 0, w: W, h: layout.photoH * H };
  ctx.save();
  ctx.globalAlpha = out(0, 0.9);
  if (scene.media) {
    drawCover(ctx, scene.media, photo, {
      zoom: mix(1.12, 1, progress(t, 0, DURATION, ease.outCubic)),
    });
  } else {
    const fill = ctx.createLinearGradient(0, 0, W, photo.h);
    fill.addColorStop(0, palette.accent);
    fill.addColorStop(1, palette.ground);
    ctx.fillStyle = fill;
    ctx.fillRect(photo.x, photo.y, photo.w, photo.h);
  }
  const fade = ctx.createLinearGradient(0, photo.h * 0.62, 0, photo.h);
  fade.addColorStop(0, withAlpha(palette.ground, 0));
  fade.addColorStop(1, withAlpha(palette.ground, 1));
  ctx.fillStyle = fade;
  ctx.fillRect(0, photo.h * 0.62, W, photo.h * 0.38 + 1);
  const shade = ctx.createLinearGradient(0, 0, 0, layout.topRowY * H + 90 * u);
  shade.addColorStop(0, "rgba(0,0,0,0.38)");
  shade.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, W, layout.topRowY * H + 90 * u);
  ctx.restore();

  // Top row over the photo: the logo, and on stories the handle opposite.
  ctx.save();
  ctx.globalAlpha = out(0.2);
  drawBrandMark(ctx, brand, {
    x: startX,
    y: layout.topRowY * H,
    u,
    align: rtl ? "right" : "left",
    onPhoto: true,
    ink: palette.ink,
  });
  ctx.fillStyle = OVER_PHOTO;
  ctx.textBaseline = "middle";
  const topHandle = layout.footerY === null ? brand.handle || brand.contact : null;
  if (topHandle) {
    ctx.font = font(26 * u, STUDIO_FONTS.body, 400);
    ctx.direction = "ltr";
    ctx.textAlign = rtl ? "left" : "right";
    ctx.fillText(topHandle, rtl ? margin : W - margin, layout.topRowY * H);
  }
  ctx.restore();

  // Eyebrow: the headline, small and spaced.
  const eyebrow = (scene.headline.trim() || scene.productName).slice(0, 60);
  const eyebrowY = photo.h + 0.012 * H;
  ctx.save();
  ctx.globalAlpha = out(0.9);
  ctx.fillStyle = palette.accent;
  ctx.font = font(30 * u, STUDIO_FONTS.body, 500);
  ctx.direction = textDirection(eyebrow);
  ctx.textAlign = rtl ? "right" : "left";
  ctx.textBaseline = "top";
  ctx.fillText(
    textDirection(eyebrow) === "rtl" ? eyebrow : eyebrow.toUpperCase(),
    startX,
    eyebrowY,
  );
  ctx.restore();

  if (!scene.priceAmount) return;

  // The price before the sale, then a line drawn through it.
  let cursorY = eyebrowY + 64 * u;
  if (onSale && scene.originalPrice) {
    ctx.save();
    ctx.globalAlpha = out(1.2) * 0.6;
    ctx.fillStyle = palette.ink;
    ctx.font = font(52 * u, STUDIO_FONTS.body, 400);
    ctx.direction = textDirection(scene.originalPrice);
    ctx.textBaseline = "top";
    const oldW = ctx.measureText(scene.originalPrice).width;
    const oldX = rtl ? startX - oldW : startX;
    ctx.textAlign = "left";
    ctx.fillText(scene.originalPrice, oldX, cursorY);
    const strike = Math.min(
      progress(t, 1.7, 0.5, ease.inOutCubic),
      1 - progress(t, DURATION - 0.5, 0.45, ease.inCubic),
    );
    if (strike > 0) {
      ctx.globalAlpha = out(1.2);
      ctx.fillStyle = palette.accent;
      const lineW = (oldW + 16 * u) * strike;
      ctx.fillRect(
        rtl ? oldX + oldW + 8 * u - lineW : oldX - 8 * u,
        cursorY + 30 * u,
        lineW,
        4 * u,
      );
    }
    ctx.restore();
    cursorY += 84 * u;
  }

  // The new price, flipping up into place: large amount, small currency.
  const amountSize = Math.min(
    layout.priceMax * u,
    (W - 2 * margin) * 0.62 * (6 / Math.max(6, scene.priceAmount.length)),
  );
  const currencySize = amountSize * 0.26;
  const flipStart = onSale ? 2.2 : 1.3;
  const flip = progress(t, flipStart, 0.7, ease.outExpo);
  const alpha = out(flipStart, 0.5);
  if (alpha > 0) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = palette.ink;
    ctx.direction = "ltr";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.font = font(amountSize, displayFont("en"), 600);
    const amountW = ctx.measureText(scene.priceAmount).width;
    ctx.font = font(currencySize, STUDIO_FONTS.body, 500);
    const currencyW = ctx.measureText(scene.currencyLabel).width;
    const gap = 16 * u;
    const totalW = amountW + gap + currencyW;
    const x = rtl ? startX - totalW : startX;
    const baseline = cursorY + amountSize * 0.86;
    ctx.translate(0, baseline);
    ctx.scale(1, mix(0.15, 1, flip));
    ctx.translate(0, -baseline);
    // In reading order: the amount, then the currency (so in Arabic the currency sits to its left).
    const amountX = rtl ? x + currencyW + gap : x;
    const currencyX = rtl ? x : x + amountW + gap;
    ctx.font = font(amountSize, displayFont("en"), 600);
    ctx.fillText(scene.priceAmount, amountX, baseline);
    ctx.font = font(currencySize, STUDIO_FONTS.body, 500);
    ctx.direction = textDirection(scene.currencyLabel);
    ctx.fillText(scene.currencyLabel, currencyX, baseline);
    ctx.restore();
  }

  // The body copy under the price, two lines at most.
  const body = scene.body.trim();
  if (body) {
    const bodyFit = fitText(
      body,
      { maxWidth: W - 2 * margin, maxLines: 2, min: 22 * u, max: 28 * u },
      (size) => {
        ctx.font = font(size, STUDIO_FONTS.body, 400);
        return (text) => ctx.measureText(text).width;
      },
    );
    ctx.save();
    ctx.globalAlpha = out(flipStart + 0.5) * 0.75;
    ctx.fillStyle = palette.ink;
    ctx.font = font(bodyFit.size, STUDIO_FONTS.body, 400);
    drawLines(ctx, bodyFit.lines.slice(0, 2), {
      x: startX,
      // Below the amount's descenders (the display figures dip under the line).
      y: cursorY + amountSize * 1.16 + 14 * u,
      lineHeight: bodyFit.size * 1.45,
      dir: textDirection(body),
    });
    ctx.restore();
  }

  // The saving: a badge that pops onto the photo's edge, then breathes.
  if (onSale && scene.discountPercent) {
    const pop = progress(t, 2.7, 0.6, ease.outBack);
    const badgeAlpha = out(2.7, 0.3);
    if (badgeAlpha > 0) {
      const r = 105 * u;
      const cx = rtl ? margin + r : W - margin - r;
      const cy = photo.h - r * 0.35;
      const breathe = 1 + 0.03 * Math.sin(Math.max(0, t - 3.4) * Math.PI);
      ctx.save();
      ctx.globalAlpha = badgeAlpha;
      ctx.translate(cx, cy);
      ctx.rotate(mix(-0.35, 0, pop));
      ctx.scale(pop * breathe, pop * breathe);
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = palette.accent;
      ctx.fill();
      ctx.fillStyle = palette.ground;
      ctx.textAlign = "center";
      ctx.direction = "ltr";
      ctx.textBaseline = "middle";
      ctx.font = font(64 * u, STUDIO_FONTS.body, 600);
      ctx.fillText(`−${scene.discountPercent}%`, 0, -8 * u);
      ctx.font = font(22 * u, STUDIO_FONTS.body, 500);
      ctx.fillText(rtl ? "خصم" : "OFF", 0, 42 * u);
      ctx.restore();
    }
  }

  // Feed posts close with the handle and contact.
  if (layout.footerY !== null) {
    const footer = [brand.handle, brand.contact].filter(Boolean).join("   ·   ");
    if (footer) {
      ctx.save();
      ctx.globalAlpha = out(3) * 0.75;
      ctx.fillStyle = palette.ink;
      ctx.font = font(26 * u, STUDIO_FONTS.body, 400);
      ctx.direction = "ltr";
      ctx.textAlign = rtl ? "right" : "left";
      ctx.textBaseline = "middle";
      ctx.fillText(footer, startX, layout.footerY * H);
      ctx.restore();
    }
  }
}

/** Sale: the old price is struck through, the new one flips in, the saving pops. */
export const priceDrop: StudioTemplate = {
  id: "price-drop",
  name: { en: "Price Drop", ar: "تخفيض السعر" },
  goal: { en: "Sale", ar: "عرض" },
  duration: DURATION,
  render,
};
