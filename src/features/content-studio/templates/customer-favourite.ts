import {
  drawCover,
  font,
  roundedRect,
  withAlpha,
  type Box,
} from "@/features/content-studio/engine/draw";
import { drawBrandMark } from "@/features/content-studio/engine/brand-mark";
import { displayFont, STUDIO_FONTS } from "@/features/content-studio/engine/fonts";
import type { FormatKey, SceneData, StudioTemplate } from "@/features/content-studio/engine/scene";
import { fitText, textDirection } from "@/features/content-studio/engine/text-layout";
import { ease, mix, presence, progress } from "@/features/content-studio/engine/timeline";
import { CONTENT_BOTTOM, photoHeight } from "@/features/content-studio/engine/safe-area";
import { star } from "@/features/content-studio/engine/line-art";

const DURATION = 7;
/** The stars fill one after another from here. */
const STARS_AT = 1.2;
const STAR_STEP = 0.18;

const LAYOUT: Record<
  FormatKey,
  { topY: number; photoY: number; minPhotoH: number; footerY: number | null }
> = {
  story: { topY: 0.11, photoY: 0.155, minPhotoH: 0.34, footerY: null },
  portrait: { topY: 0.05, photoY: 0.095, minPhotoH: 0.3, footerY: 0.94 },
  square: { topY: 0.055, photoY: 0.1, minPhotoH: 0.26, footerY: 0.935 },
};

const WORDS = {
  en: { eyebrow: "Customer favourite", from: (n: number) => `from ${n} reviews` },
  ar: { eyebrow: "الأكثر حباً", from: (n: number) => `من ${n} تقييم` },
};

/**
 * How full each of the five stars is at `t` for an average of `average`:
 * they fill in turn, the last one only as far as the average reaches.
 */
export function starFills(average: number, t: number): number[] {
  return [0, 1, 2, 3, 4].map((index) => {
    const share = Math.min(1, Math.max(0, average - index));
    return share * progress(t, STARS_AT + index * STAR_STEP, 0.3, ease.outCubic);
  });
}

/** The rating shown while it counts up to the average ("4.8"). */
export function countedRating(average: number, t: number): string {
  return (average * progress(t, STARS_AT, 0.9, ease.outCubic)).toFixed(1);
}

function render(ctx: CanvasRenderingContext2D, t: number, scene: SceneData) {
  const { width: W, height: H, brand, lang } = scene;
  const { palette } = brand;
  const u = W / 1080;
  const layout = LAYOUT[scene.format];
  const rtl = lang === "ar";
  const words = WORDS[lang];
  const margin = 80 * u;
  const rating = scene.rating ?? null;

  ctx.fillStyle = palette.ground;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.globalAlpha = presence(t, { start: 0.05, end: DURATION });
  drawBrandMark(ctx, brand, {
    x: W / 2,
    y: layout.topY * H,
    u,
    align: "center",
    onPhoto: false,
    ink: palette.ink,
  });
  ctx.restore();

  // What sits under the photo, measured first.
  const name = (scene.headline.trim() || scene.productName).trim();
  const nameDir = textDirection(name);
  const nameFamily = displayFont(nameDir === "rtl" ? "ar" : "en", brand.displayFamilies);
  const starR = 34 * u;
  const below =
    0.035 * H +
    44 * u +
    (rating ? starR * 2 + 28 * u + 64 * u : 0) +
    (rating && rating.highlights.length > 0 ? 80 * u : 0) +
    70 * u +
    (scene.price ? 52 * u : 0);
  const photoW = W - 2 * margin;
  const photo: Box = {
    x: margin,
    y: layout.photoY * H,
    w: photoW,
    h: photoHeight({
      top: layout.photoY * H,
      bottom: CONTENT_BOTTOM[scene.format] * H,
      below,
      min: layout.minPhotoH * H,
    }),
  };

  // The photo, opening from its centre.
  const open = progress(t, 0.1, 1, ease.outExpo);
  if (open > 0) {
    const inset = (1 - open) * photo.w * 0.08;
    const box: Box = {
      x: photo.x + inset,
      y: photo.y + inset,
      w: photo.w - 2 * inset,
      h: photo.h - 2 * inset,
    };
    ctx.save();
    ctx.globalAlpha = presence(t, { start: 0.1, end: DURATION, enter: 0.5 });
    roundedRect(ctx, box, 18 * u);
    ctx.clip();
    if (scene.media) {
      drawCover(ctx, scene.media, photo, {
        zoom: mix(1.12, 1, progress(t, 0, DURATION, ease.outCubic)),
      });
    } else {
      ctx.fillStyle = withAlpha(palette.ink, 0.08);
      ctx.fillRect(photo.x, photo.y, photo.w, photo.h);
    }
    ctx.restore();
  }

  let y = photo.y + photo.h + 0.035 * H;
  const at = (start: number) => presence(t, { start, end: DURATION });

  // The eyebrow.
  ctx.save();
  ctx.globalAlpha = at(0.8);
  ctx.fillStyle = palette.accent;
  ctx.font = font(30 * u, STUDIO_FONTS.body, 600);
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.direction = textDirection(words.eyebrow);
  ctx.fillText(lang === "en" ? words.eyebrow.toUpperCase() : words.eyebrow, W / 2, y);
  ctx.restore();
  y += 44 * u;

  if (rating) {
    // Five stars, filling in turn to the average (from the reading start).
    const fills = starFills(rating.average, t);
    const gap = 16 * u;
    const rowW = 5 * 2 * starR + 4 * gap;
    fills.forEach((fill, index) => {
      const order = rtl ? 4 - index : index;
      const cx = W / 2 - rowW / 2 + starR + order * (2 * starR + gap);
      const cy = y + starR;
      const outline = star(cx, cy, starR, 5, 0.45);
      const path = () => {
        ctx.beginPath();
        outline.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
        ctx.closePath();
      };
      ctx.save();
      ctx.globalAlpha = at(STARS_AT - 0.3);
      path();
      ctx.strokeStyle = withAlpha(palette.ink, 0.35);
      ctx.lineWidth = 2 * u;
      ctx.lineJoin = "round";
      ctx.stroke();
      if (fill > 0) {
        path();
        ctx.clip();
        ctx.fillStyle = palette.accent;
        // The fill grows from the reading start of the star.
        const w = 2 * starR * fill;
        ctx.fillRect(rtl ? cx + starR - w : cx - starR, cy - starR, w, 2 * starR);
      }
      ctx.restore();
    });
    y += starR * 2 + 28 * u;

    // The number counting up, and how many reviews it comes from.
    const figure = countedRating(rating.average, t);
    const from = words.from(rating.count);
    ctx.save();
    ctx.globalAlpha = at(STARS_AT);
    ctx.fillStyle = palette.ink;
    ctx.textBaseline = "alphabetic";
    ctx.font = font(64 * u, displayFont("en", brand.displayFamilies), 600);
    const figureW = ctx.measureText(figure).width;
    ctx.font = font(28 * u, STUDIO_FONTS.body, 400);
    const fromW = ctx.measureText(from).width;
    const total = figureW + 18 * u + fromW;
    const left = W / 2 - total / 2;
    // The figure at the reading start, the count after it.
    const figureX = rtl ? left + fromW + 18 * u : left;
    const fromX = rtl ? left : left + figureW + 18 * u;
    ctx.textAlign = "left";
    ctx.font = font(64 * u, displayFont("en", brand.displayFamilies), 600);
    ctx.direction = "ltr";
    ctx.fillText(figure, figureX, y + 48 * u);
    ctx.globalAlpha *= 0.7;
    ctx.font = font(28 * u, STUDIO_FONTS.body, 400);
    ctx.direction = textDirection(from);
    ctx.fillText(from, fromX, y + 46 * u);
    ctx.restore();
    y += 64 * u;

    // What customers praise most, as soft chips.
    if (rating.highlights.length > 0) {
      ctx.save();
      ctx.font = font(26 * u, STUDIO_FONTS.body, 500);
      const pad = 22 * u;
      const chipGap = 12 * u;
      const h = 54 * u;
      const widths = rating.highlights.map((text) => ctx.measureText(text).width + 2 * pad);
      const rowTotal = widths.reduce((sum, w) => sum + w, 0) + chipGap * (widths.length - 1);
      let x = rtl ? W / 2 + rowTotal / 2 : W / 2 - rowTotal / 2;
      rating.highlights.forEach((text, index) => {
        const w = widths[index];
        const chipLeft = rtl ? x - w : x;
        const alpha = presence(t, { start: 2.2 + index * 0.12, end: DURATION, enter: 0.4 });
        if (alpha > 0) {
          ctx.save();
          ctx.globalAlpha = alpha;
          roundedRect(ctx, { x: chipLeft, y: y + 12 * u, w, h }, h / 2);
          ctx.fillStyle = withAlpha(palette.ink, 0.08);
          ctx.fill();
          ctx.fillStyle = palette.ink;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.direction = textDirection(text);
          ctx.fillText(text, chipLeft + w / 2, y + 12 * u + h / 2 + u);
          ctx.restore();
        }
        x = rtl ? x - w - chipGap : x + w + chipGap;
      });
      ctx.restore();
      y += 80 * u;
    }
  }

  // The piece's name and price.
  const nameFit = fitText(
    name,
    { maxWidth: W - 2 * margin, maxLines: 1, min: 34 * u, max: 56 * u },
    (size) => {
      ctx.font = font(size, nameFamily, 600);
      return (text) => ctx.measureText(text).width;
    },
  );
  ctx.save();
  ctx.globalAlpha = at(1.6);
  ctx.fillStyle = palette.ink;
  ctx.font = font(nameFit.size, nameFamily, 600);
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.direction = nameDir;
  ctx.fillText(nameFit.lines[0] ?? name, W / 2, y + 10 * u);
  ctx.restore();
  y += 70 * u;
  if (scene.price) {
    ctx.save();
    ctx.globalAlpha = at(1.8) * 0.85;
    ctx.fillStyle = palette.ink;
    ctx.font = font(32 * u, STUDIO_FONTS.body, 500);
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    // An Arabic price ("30.000 د.ب.") reads right to left: number first, then the currency.
    ctx.direction = textDirection(scene.price);
    ctx.fillText(scene.price, W / 2, y);
    ctx.restore();
  }

  if (layout.footerY !== null) {
    const footer = [brand.handle, brand.contact].filter(Boolean).join("   ·   ");
    if (footer) {
      ctx.save();
      ctx.globalAlpha = at(2.6) * 0.75;
      ctx.fillStyle = palette.ink;
      ctx.font = font(26 * u, STUDIO_FONTS.body, 400);
      ctx.direction = "ltr";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(footer, W / 2, layout.footerY * H);
      ctx.restore();
    }
  }

  const fade = progress(t, DURATION - 0.45, 0.45, ease.inCubic);
  if (fade > 0) {
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.fillStyle = palette.ground;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
}

/** What customers say, summed up: the stars fill to the store's rating, the praise follows. */
export const customerFavourite: StudioTemplate = {
  id: "customer-favourite",
  name: { en: "Customer Favourite", ar: "الأكثر حباً" },
  goal: { en: "Reviews & trust", ar: "التقييمات والثقة" },
  duration: DURATION,
  render,
};
