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

const DURATION = 7;
/** The stamp lands here; the photo answers with a small shake. */
const STAMP_AT = 1.15;

const LAYOUT: Record<
  FormatKey,
  { topY: number; photoY: number; minPhotoH: number; footerY: number | null }
> = {
  story: { topY: 0.11, photoY: 0.16, minPhotoH: 0.36, footerY: null },
  portrait: { topY: 0.05, photoY: 0.1, minPhotoH: 0.34, footerY: 0.94 },
  square: { topY: 0.055, photoY: 0.105, minPhotoH: 0.3, footerY: 0.935 },
};

const WORDS = {
  en: { stamp: ["BACK IN", "STOCK"], asked: (n: number) => `${n} asked for it` },
  ar: { stamp: ["رجعت", "من جديد"], asked: (n: number) => `${n} طلبوها` },
};

/** The photo's sideways shake after the stamp lands (pixels at reference size), dying away. */
export function stampShake(t: number): number {
  const since = t - STAMP_AT - 0.18;
  if (since < 0 || since > 0.5) return 0;
  return Math.sin(since * 60) * 10 * (1 - since / 0.5);
}

/** An arch-topped frame: the photo's shape, a doorway rather than a box. */
function archPath(ctx: CanvasRenderingContext2D, box: Box) {
  // A round dome, never more than a third of the frame.
  const rise = Math.min(box.w * 0.5, box.h * 0.3);
  ctx.beginPath();
  ctx.moveTo(box.x, box.y + box.h);
  ctx.lineTo(box.x, box.y + rise);
  ctx.quadraticCurveTo(box.x, box.y, box.x + box.w / 2, box.y);
  ctx.quadraticCurveTo(box.x + box.w, box.y, box.x + box.w, box.y + rise);
  ctx.lineTo(box.x + box.w, box.y + box.h);
  ctx.closePath();
}

function render(ctx: CanvasRenderingContext2D, t: number, scene: SceneData) {
  const { width: W, height: H, brand, lang } = scene;
  const { palette } = brand;
  const u = W / 1080;
  const layout = LAYOUT[scene.format];
  const rtl = lang === "ar";
  const words = WORDS[lang];
  const margin = 80 * u;
  const restock = scene.restock ?? null;
  const options = restock?.options ?? [];

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

  // What goes under the photo, measured first.
  const name = (scene.headline.trim() || scene.productName).trim();
  const nameDir = textDirection(name);
  const family = displayFont(nameDir === "rtl" ? "ar" : "en", brand.displayFamilies);
  const nameFit = fitText(
    name,
    { maxWidth: W - 2 * margin, maxLines: 2, min: 48 * u, max: 84 * u },
    (size) => {
      ctx.font = font(size, family, 600);
      return (text) => ctx.measureText(text).width;
    },
  );
  const nameLineH = nameFit.size * (nameDir === "rtl" ? 1.25 : 1.06);
  const below =
    0.035 * H +
    nameFit.lines.length * nameLineH +
    (options.length > 0 ? 94 * u : 0) +
    (restock?.asked ? 46 * u : 0) +
    (scene.price ? 56 * u : 0);
  const photoW = W * 0.7;
  const photo: Box = {
    x: (W - photoW) / 2,
    y: layout.photoY * H,
    w: photoW,
    h: photoHeight({
      top: layout.photoY * H,
      bottom: CONTENT_BOTTOM[scene.format] * H,
      below,
      min: layout.minPhotoH * H,
    }),
  };

  // The photo in its arch, rising in, then shaken by the stamp.
  const rise = progress(t, 0.1, 0.9, ease.outExpo);
  const shake = stampShake(t) * u;
  ctx.save();
  ctx.globalAlpha = presence(t, { start: 0.1, end: DURATION, enter: 0.6 });
  ctx.translate(shake, (1 - rise) * 60 * u);
  archPath(ctx, photo);
  ctx.clip();
  if (scene.media) {
    drawCover(ctx, scene.media, photo, {
      zoom: mix(1.1, 1, progress(t, 0, DURATION, ease.outCubic)),
    });
  } else {
    ctx.fillStyle = withAlpha(palette.ink, 0.08);
    ctx.fillRect(photo.x, photo.y, photo.w, photo.h);
  }
  ctx.restore();

  // The stamp: a round seal slammed onto the photo's corner.
  const slam = progress(t, STAMP_AT - 0.2, 0.32, ease.inCubic);
  if (slam > 0) {
    const r = Math.min(150 * u, photo.w * 0.24);
    const cx = rtl ? photo.x + r * 0.55 : photo.x + photo.w - r * 0.55;
    const cy = photo.y + photo.h * 0.72;
    ctx.save();
    ctx.globalAlpha = Math.min(1, slam * 2) * presence(t, { start: 0, end: DURATION, enter: 0.01 });
    ctx.translate(cx, cy);
    ctx.rotate((rtl ? 1 : -1) * 0.22);
    ctx.scale(mix(2.4, 1, slam), mix(2.4, 1, slam));
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = palette.ink;
    ctx.fill();
    ctx.strokeStyle = palette.ground;
    ctx.lineWidth = 3 * u;
    ctx.setLineDash([8 * u, 7 * u]);
    ctx.beginPath();
    ctx.arc(0, 0, r - 14 * u, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = palette.ground;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const lines = words.stamp;
    // As large as the seal allows: its widest line fits inside the ring.
    ctx.font = font(100, STUDIO_FONTS.body, 600);
    const widest = Math.max(...lines.map((line) => ctx.measureText(line).width));
    const size = Math.min(r * 0.34, (r * 1.4 * 100) / Math.max(1, widest));
    ctx.font = font(size, STUDIO_FONTS.body, 600);
    lines.forEach((line, index) => {
      ctx.direction = textDirection(line);
      ctx.fillText(line, 0, (index - (lines.length - 1) / 2) * size * 1.2);
    });
    ctx.restore();
  }

  // The name, centred under the arch.
  let y = photo.y + photo.h + 0.035 * H;
  ctx.save();
  ctx.globalAlpha = presence(t, { start: 1.5, end: DURATION });
  ctx.fillStyle = palette.ink;
  ctx.font = font(nameFit.size, family, 600);
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.direction = nameDir;
  nameFit.lines.forEach((line, index) => ctx.fillText(line, W / 2, y + index * nameLineH));
  ctx.restore();
  y += nameFit.lines.length * nameLineH + 18 * u;

  // The options a shopper can buy now, as chips arriving one by one.
  if (options.length > 0) {
    ctx.save();
    ctx.font = font(32 * u, STUDIO_FONTS.body, 500);
    const pad = 28 * u;
    const gap = 14 * u;
    const h = 68 * u;
    const widths = options.map((option) => ctx.measureText(option).width + 2 * pad);
    const total = widths.reduce((sum, w) => sum + w, 0) + gap * (options.length - 1);
    // In Arabic the first option sits at the right.
    let x = rtl ? W / 2 + total / 2 : W / 2 - total / 2;
    options.forEach((option, index) => {
      const w = widths[index];
      const left = rtl ? x - w : x;
      const pop = progress(t, 1.8 + index * 0.1, 0.45, ease.outBack);
      if (pop > 0) {
        const chip: Box = { x: left, y, w, h };
        const cx = left + w / 2;
        const cy = y + h / 2;
        ctx.save();
        ctx.globalAlpha = presence(t, { start: 1.8 + index * 0.1, end: DURATION, enter: 0.2 });
        ctx.translate(cx, cy);
        ctx.scale(pop, pop);
        ctx.translate(-cx, -cy);
        roundedRect(ctx, chip, h / 2);
        ctx.strokeStyle = palette.ink;
        ctx.lineWidth = 2.5 * u;
        ctx.stroke();
        ctx.fillStyle = palette.ink;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.direction = textDirection(option);
        ctx.fillText(option, cx, cy + u);
        ctx.restore();
      }
      x = rtl ? x - w - gap : x + w + gap;
    });
    ctx.restore();
    y += h + 26 * u;
  }

  // How many asked for it, when the merchant shows it.
  if (restock?.asked) {
    const line = words.asked(restock.asked);
    ctx.save();
    ctx.globalAlpha = presence(t, { start: 2.4, end: DURATION }) * 0.75;
    ctx.fillStyle = palette.accent;
    ctx.font = font(28 * u, STUDIO_FONTS.body, 500);
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.direction = textDirection(line);
    ctx.fillText(line, W / 2, y);
    ctx.restore();
    y += 46 * u;
  }

  if (scene.price) {
    ctx.save();
    ctx.globalAlpha = presence(t, { start: 2.6, end: DURATION }) * 0.9;
    ctx.fillStyle = palette.ink;
    ctx.font = font(36 * u, STUDIO_FONTS.body, 500);
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
      ctx.globalAlpha = presence(t, { start: 2.8, end: DURATION }) * 0.75;
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

/** A piece back on the shelf: the stamp lands, the sizes to buy now follow. */
export const backInStock: StudioTemplate = {
  id: "back-in-stock",
  name: { en: "Back in Stock", ar: "رجعت من جديد" },
  goal: { en: "Restocked", ar: "رجوع للمخزون" },
  duration: DURATION,
  render,
};
