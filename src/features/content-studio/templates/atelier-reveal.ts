import {
  drawCover,
  drawLines,
  font,
  roundedRect,
  type Box,
} from "@/features/content-studio/engine/draw";
import { drawBrandMark } from "@/features/content-studio/engine/brand-mark";
import { displayFont, STUDIO_FONTS } from "@/features/content-studio/engine/fonts";
import type { FormatKey, SceneData, StudioTemplate } from "@/features/content-studio/engine/scene";
import { fitText, textDirection } from "@/features/content-studio/engine/text-layout";
import { ease, mix, presence, progress, stagger } from "@/features/content-studio/engine/timeline";
import { CONTENT_BOTTOM, photoHeight } from "@/features/content-studio/engine/safe-area";

const DURATION = 7;

/**
 * Where things sit in each format, as fractions of the height. Stories keep
 * the top and bottom clear of Instagram's own buttons, so their handle sits
 * in the top row beside the wordmark (`footerY` null); feed posts have no
 * overlay and close with a footer line. The photo takes whatever height the
 * copy below it leaves, down to `minPhotoH`.
 */
const LAYOUT: Record<
  FormatKey,
  { logoY: number; photoY: number; minPhotoH: number; footerY: number | null; headlineMax: number }
> = {
  story: { logoY: 0.11, photoY: 0.155, minPhotoH: 0.36, footerY: null, headlineMax: 112 },
  portrait: { logoY: 0.045, photoY: 0.1, minPhotoH: 0.34, footerY: 0.94, headlineMax: 110 },
  square: { logoY: 0.045, photoY: 0.105, minPhotoH: 0.3, footerY: 0.935, headlineMax: 92 },
};

function render(ctx: CanvasRenderingContext2D, t: number, scene: SceneData) {
  const { width: W, height: H, brand, lang } = scene;
  const u = W / 1080;
  const layout = LAYOUT[scene.format];
  const rtl = lang === "ar";
  const margin = 80 * u;
  const startX = rtl ? W - margin : margin;
  const { palette } = brand;

  // Ground.
  ctx.fillStyle = palette.ground;
  ctx.fillRect(0, 0, W, H);

  // Wordmark, arriving first.
  ctx.save();
  ctx.globalAlpha = presence(t, { start: 0.05, end: DURATION });
  drawBrandMark(ctx, brand, {
    x: startX,
    y: layout.logoY * H,
    u,
    align: rtl ? "right" : "left",
    onPhoto: false,
    ink: palette.ink,
  });
  ctx.restore();

  // The copy is measured first: the photo takes the height it leaves.
  const headline = scene.headline.trim() || scene.productName;
  const family = displayFont(
    textDirection(headline) === "rtl" ? "ar" : "en",
    scene.brand.displayFamilies,
  );
  const fit = fitText(
    headline,
    { maxWidth: W - 2 * margin, maxLines: 2, min: 56 * u, max: layout.headlineMax * u },
    (size) => {
      ctx.font = font(size, family, 600);
      return (text) => ctx.measureText(text).width;
    },
  );
  const lineHeight = fit.size * 1.04;
  const body = scene.body.trim();
  const bodyFit = body
    ? fitText(body, { maxWidth: W - 2 * margin, maxLines: 2, min: 24 * u, max: 30 * u }, (size) => {
        ctx.font = font(size, STUDIO_FONTS.body, 400);
        return (text) => ctx.measureText(text).width;
      })
    : null;
  const bodyLines = bodyFit ? bodyFit.lines.slice(0, 2) : [];
  const bodyLineHeight = bodyFit ? bodyFit.size * 1.45 : 0;
  const priceSize = 34 * u;
  const below =
    0.035 * H +
    fit.lines.length * lineHeight +
    (bodyFit ? 0.012 * H + bodyLines.length * bodyLineHeight : 0) +
    0.016 * H +
    (scene.price ? 0.028 * H + priceSize * 1.9 : Math.max(1, 3 * u));

  // The photo, unveiled from below while it settles (a slow push out).
  const photo: Box = {
    x: margin,
    y: layout.photoY * H,
    w: W - 2 * margin,
    h: photoHeight({
      top: layout.photoY * H,
      bottom: CONTENT_BOTTOM[scene.format] * H,
      below,
      min: layout.minPhotoH * H,
    }),
  };
  const open = progress(t, 0.15, 1.1, ease.inOutCubic);
  const close = progress(t, DURATION - 0.55, 0.5, ease.inOutCubic);
  const visibleTop = photo.y + photo.h * (1 - open);
  const visibleBottom = photo.y + photo.h * (1 - close);
  if (visibleBottom > visibleTop) {
    ctx.save();
    roundedRect(ctx, photo, 10 * u);
    ctx.clip();
    ctx.beginPath();
    ctx.rect(photo.x, visibleTop, photo.w, visibleBottom - visibleTop);
    ctx.clip();
    if (scene.media) {
      const zoom = mix(1.16, 1, progress(t, 0, DURATION, ease.outCubic));
      drawCover(ctx, scene.media, photo, { zoom });
    } else {
      const fill = ctx.createLinearGradient(photo.x, photo.y, photo.x + photo.w, photo.y + photo.h);
      fill.addColorStop(0, palette.accent);
      fill.addColorStop(1, palette.ground);
      ctx.fillStyle = fill;
      ctx.fillRect(photo.x, photo.y, photo.w, photo.h);
    }
    // A soft shade at the foot of the photo, so it sits into the ground.
    const shade = ctx.createLinearGradient(0, photo.y + photo.h * 0.7, 0, photo.y + photo.h);
    shade.addColorStop(0, "rgba(0,0,0,0)");
    shade.addColorStop(1, "rgba(0,0,0,0.22)");
    ctx.fillStyle = shade;
    ctx.fillRect(photo.x, photo.y, photo.w, photo.h);
    ctx.restore();
  }

  // Headline: line by line, rising into place.
  const headlineY = photo.y + photo.h + 0.035 * H;
  ctx.fillStyle = palette.ink;
  ctx.font = font(fit.size, family, 600);
  drawLines(ctx, fit.lines, {
    x: startX,
    y: headlineY,
    lineHeight,
    dir: textDirection(headline),
    reveal: (index) => {
      const p = presence(t, { start: stagger(1.05, index, 0.12), end: DURATION });
      return { alpha: p, dy: (1 - p) * fit.size * 0.45 };
    },
  });

  // The body copy, two lines at most, following the headline in.
  let textBottom = headlineY + fit.lines.length * lineHeight;
  if (bodyFit) {
    const bodyY = textBottom + 0.012 * H;
    ctx.save();
    ctx.fillStyle = palette.ink;
    ctx.globalAlpha = 0.78;
    ctx.font = font(bodyFit.size, STUDIO_FONTS.body, 400);
    drawLines(ctx, bodyLines, {
      x: startX,
      y: bodyY,
      lineHeight: bodyLineHeight,
      dir: textDirection(body),
      reveal: (index) => {
        const p = presence(t, { start: stagger(1.35, index, 0.1), end: DURATION });
        return { alpha: p, dy: (1 - p) * bodyFit.size * 0.5 };
      },
    });
    ctx.restore();
    textBottom = bodyY + bodyLines.length * bodyLineHeight;
  }

  // A fine line drawn under the text, from the reading start.
  const ruleY = textBottom + 0.016 * H;
  const ruleP = Math.min(
    progress(t, 1.45, 0.7, ease.inOutCubic),
    1 - progress(t, DURATION - 0.5, 0.45, ease.inOutCubic),
  );
  if (ruleP > 0) {
    const ruleW = (W - 2 * margin) * 0.3 * ruleP;
    ctx.fillStyle = palette.accent;
    ctx.fillRect(rtl ? startX - ruleW : startX, ruleY, ruleW, Math.max(1, 3 * u));
  }

  // The price, stamped in.
  if (scene.price) {
    const stamp = progress(t, 1.75, 0.55, ease.outBack);
    const alpha = presence(t, { start: 1.75, end: DURATION, enter: 0.3 });
    if (alpha > 0) {
      const size = priceSize;
      ctx.save();
      ctx.font = font(size, STUDIO_FONTS.body, 500);
      const textW = ctx.measureText(scene.price).width;
      const pill: Box = {
        x: 0,
        y: ruleY + 0.028 * H,
        w: textW + 2 * 30 * u,
        h: size * 1.9,
      };
      pill.x = rtl ? startX - pill.w : startX;
      const scale = mix(1.35, 1, stamp);
      const cx = pill.x + pill.w / 2;
      const cy = pill.y + pill.h / 2;
      ctx.globalAlpha = alpha;
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);
      ctx.translate(-cx, -cy);
      roundedRect(ctx, pill, pill.h / 2);
      ctx.strokeStyle = palette.muted;
      ctx.lineWidth = Math.max(1, 2 * u);
      ctx.stroke();
      ctx.fillStyle = palette.ink;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      // An Arabic price ("30.000 د.ب.") reads right to left: number first, then the currency.
      ctx.direction = textDirection(scene.price);
      ctx.fillText(scene.price, cx, cy + size * 0.04);
      ctx.restore();
    }
  }

  // Handle and contact, last and quietest: a footer on feed posts, beside
  // the wordmark on stories (the story's foot belongs to Instagram).
  const footer =
    layout.footerY === null
      ? brand.handle || brand.contact
      : [brand.handle, brand.contact].filter(Boolean).join("   ·   ");
  if (footer) {
    ctx.save();
    ctx.globalAlpha = presence(t, { start: 2.2, end: DURATION }) * 0.8;
    ctx.fillStyle = palette.ink;
    ctx.font = font(26 * u, STUDIO_FONTS.body, 400);
    ctx.direction = "ltr";
    ctx.textBaseline = "middle";
    if (layout.footerY === null) {
      ctx.textAlign = rtl ? "left" : "right";
      ctx.fillText(footer, rtl ? margin : W - margin, layout.logoY * H);
    } else {
      ctx.textAlign = rtl ? "right" : "left";
      ctx.fillText(footer, startX, layout.footerY * H);
    }
    ctx.restore();
  }
}

/** Launch / new arrival: the photo is unveiled, the name rises, the price stamps in. */
export const atelierReveal: StudioTemplate = {
  id: "atelier-reveal",
  name: { en: "Atelier Reveal", ar: "كشف الأتيليه" },
  goal: { en: "New arrival", ar: "وصل حديثاً" },
  duration: DURATION,
  render,
};
