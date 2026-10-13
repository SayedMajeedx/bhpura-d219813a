import { drawCover, font, withAlpha, type Box } from "@/features/content-studio/engine/draw";
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
  wipeBox,
} from "@/features/content-studio/engine/motion";

const DURATION = 8;
/** The rows arrive from here, one after another. */
const ROWS_START = 1.1;
const ROW_STEP = 0.14;
/** The highlight runs down the rows in this window. */
const SPOTLIGHT = { start: 3, end: 6.9 };

/** Fractions of the height: the mark, the title, and where a feed post's footer sits. */
const LAYOUT: Record<FormatKey, { topY: number; titleY: number; footerY: number | null }> = {
  story: { topY: 0.11, titleY: 0.175, footerY: null },
  portrait: { topY: 0.06, titleY: 0.105, footerY: 0.94 },
  square: { topY: 0.065, titleY: 0.115, footerY: 0.935 },
};

/** The rows of the menu: the collection, or the product alone. */
function rowsOf(scene: SceneData) {
  if (scene.collection && scene.collection.length > 0) return scene.collection;
  return [{ name: scene.productName, price: scene.price, media: scene.media, note: null }];
}

/**
 * Where each row sits between the title and the foot, as tall as the space
 * allows but never taller than a row needs.
 */
export function menuRows(count: number, top: number, bottom: number, u: number) {
  const height = Math.min(190 * u, Math.max(96 * u, (bottom - top) / Math.max(1, count)));
  const used = height * count;
  // A short menu sits in the middle of its space rather than at its top.
  const start = top + Math.max(0, (bottom - top - used) / 2);
  return Array.from({ length: count }, (_, index) => ({ y: start + index * height, h: height }));
}

function render(ctx: CanvasRenderingContext2D, t: number, scene: SceneData) {
  const { width: W, height: H, brand, lang } = scene;
  const { palette } = brand;
  const u = W / 1080;
  const layout = LAYOUT[scene.format];
  const rtl = lang === "ar";
  const margin = 96 * u;
  const rows = rowsOf(scene);

  ctx.fillStyle = palette.ground;
  ctx.fillRect(0, 0, W, H);

  // A fine frame, drawn round the card like a menu's border.
  const inset = 40 * u;
  const frame: Box = { x: inset, y: inset, w: W - 2 * inset, h: H - 2 * inset };
  const trace = progress(t, 0.1, 1.4, ease.inOutCubic);
  if (trace > 0) {
    const perimeter = 2 * (frame.w + frame.h);
    ctx.save();
    ctx.strokeStyle = withAlpha(palette.ink, 0.22);
    ctx.lineWidth = Math.max(1, 2 * u);
    ctx.setLineDash([perimeter * trace, perimeter]);
    ctx.strokeRect(frame.x, frame.y, frame.w, frame.h);
    ctx.restore();
  }

  ctx.save();
  ctx.globalAlpha = presence(t, { start: 0.1, end: DURATION });
  drawBrandMark(ctx, brand, {
    x: W / 2,
    y: layout.topY * H,
    u,
    align: "center",
    onPhoto: false,
    ink: palette.ink,
  });
  ctx.restore();

  // The title, word by word, centred, with a short rule under it.
  const title = (scene.headline.trim() || scene.productName).trim();
  const titleDir = textDirection(title);
  const family = displayFont(titleDir === "rtl" ? "ar" : "en", brand.displayFamilies);
  const titleFit = fitText(
    title,
    { maxWidth: W - 2 * margin, maxLines: 2, min: 52 * u, max: 96 * u },
    (size) => {
      ctx.font = font(size, family, 600);
      return (text) => ctx.measureText(text).width;
    },
  );
  const titleLineH = titleFit.size * (titleDir === "rtl" ? 1.25 : 1.05);
  const titleY = layout.titleY * H;
  ctx.fillStyle = palette.ink;
  ctx.font = font(titleFit.size, family, 600);
  const titleWords = layoutWords(titleFit.lines, (text) => ctx.measureText(text).width, {
    x: W / 2,
    y: titleY,
    lineHeight: titleLineH,
    dir: rtl ? "rtl" : "ltr",
    align: "center",
  });
  drawRisingWords(ctx, titleWords, {
    size: titleFit.size,
    lineHeight: titleLineH,
    reveal: (word) => progress(t, 0.35 + word.order * 0.08, 0.6, ease.outExpo),
  });
  const ruleY = titleY + titleFit.lines.length * titleLineH + 26 * u;
  const rule = progress(t, 0.8, 0.6, ease.inOutCubic);
  if (rule > 0) {
    ctx.fillStyle = palette.accent;
    const w = 120 * u * rule;
    ctx.fillRect(W / 2 - w / 2, ruleY, w, Math.max(1, 3 * u));
  }

  // The rows: name and note at the reading start, the price at the end, dots between.
  const body = scene.body.trim();
  const bottomLimit =
    (layout.footerY === null ? CONTENT_BOTTOM.story : layout.footerY - 0.05) * H -
    (body ? 70 * u : 0);
  const slots = menuRows(rows.length, ruleY + 50 * u, bottomLimit, u);
  const startX = rtl ? W - margin : margin;
  const endX = rtl ? margin : W - margin;
  const towardEnd = rtl ? -1 : 1;
  const spot = progress(t, SPOTLIGHT.start, SPOTLIGHT.end - SPOTLIGHT.start, ease.linear);

  rows.forEach((row, index) => {
    const slot = slots[index];
    const arrive = progress(t, ROWS_START + index * ROW_STEP, 0.7, ease.outExpo);
    if (arrive <= 0) return;
    const alpha = presence(t, { start: ROWS_START + index * ROW_STEP, end: DURATION, enter: 0.5 });

    // The highlight passes over each row in turn.
    const here = spot * rows.length - index;
    const glow = here > 0 && here < 1 ? Math.sin(here * Math.PI) : 0;
    if (glow > 0) {
      ctx.save();
      ctx.globalAlpha = glow * 0.9;
      ctx.fillStyle = withAlpha(palette.ink, 0.06);
      ctx.fillRect(inset + 16 * u, slot.y + 6 * u, W - 2 * inset - 32 * u, slot.h - 12 * u);
      ctx.restore();
    }

    ctx.save();
    ctx.globalAlpha = alpha;
    clipTo(ctx, wipeBox({ x: 0, y: slot.y, w: W, h: slot.h }, arrive, "start", rtl));
    const mid = slot.y + slot.h / 2;

    // A small round photo, when the item has one.
    const r = Math.min(slot.h * 0.32, 52 * u);
    let textStart = startX;
    if (row.media) {
      const cx = startX + towardEnd * r;
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, mid, r, 0, Math.PI * 2);
      ctx.clip();
      drawCover(
        ctx,
        row.media,
        { x: cx - r, y: mid - r, w: 2 * r, h: 2 * r },
        {
          zoom: mix(1.15, 1, arrive),
        },
      );
      ctx.restore();
      textStart = startX + towardEnd * (2 * r + 28 * u);
    }

    // The price at the end of the line.
    let priceW = 0;
    if (row.price) {
      ctx.font = font(36 * u, STUDIO_FONTS.body, 500);
      priceW = ctx.measureText(row.price).width;
      ctx.fillStyle = palette.ink;
      ctx.textBaseline = "middle";
      ctx.textAlign = rtl ? "left" : "right";
      // An Arabic price ("3.500 د.ب.") reads right to left: number first, then the currency.
      ctx.direction = textDirection(row.price);
      ctx.fillText(row.price, endX, row.note ? mid - 18 * u : mid);
    }

    // The name, as large as its room allows, and the note under it.
    const room = Math.abs(endX - textStart) - priceW - 70 * u;
    const nameDir = textDirection(row.name);
    const nameFamily = displayFont(nameDir === "rtl" ? "ar" : "en", brand.displayFamilies);
    const nameFit = fitText(
      row.name,
      { maxWidth: Math.max(80 * u, room), maxLines: 1, min: 26 * u, max: 50 * u },
      (size) => {
        ctx.font = font(size, nameFamily, 600);
        return (text) => ctx.measureText(text).width;
      },
    );
    const name = nameFit.lines[0] ?? row.name;
    ctx.font = font(nameFit.size, nameFamily, 600);
    const nameW = ctx.measureText(name).width;
    const nameY = row.note ? mid - 18 * u : mid;
    ctx.fillStyle = palette.ink;
    ctx.textBaseline = "middle";
    ctx.textAlign = rtl ? "right" : "left";
    ctx.direction = nameDir;
    ctx.fillText(name, textStart, nameY);
    if (row.note) {
      ctx.save();
      ctx.globalAlpha = alpha * 0.65;
      ctx.font = font(26 * u, STUDIO_FONTS.body, 400);
      ctx.direction = textDirection(row.note);
      ctx.fillText(row.note, textStart, mid + 26 * u);
      ctx.restore();
    }

    // Dot leaders between the name and the price, drawn out from the name.
    if (row.price) {
      const from = textStart + towardEnd * (nameW + 20 * u);
      const to = endX - towardEnd * (priceW + 20 * u);
      const span = (to - from) * towardEnd;
      const lead = progress(t, ROWS_START + index * ROW_STEP + 0.25, 0.6, ease.outCubic);
      if (span > 20 * u && lead > 0) {
        ctx.fillStyle = withAlpha(palette.ink, 0.35);
        const step = 16 * u;
        const dots = Math.floor((span * lead) / step);
        for (let d = 0; d <= dots; d++) {
          ctx.beginPath();
          ctx.arc(
            from + towardEnd * d * step,
            nameY + 10 * u,
            Math.max(1, 2.4 * u),
            0,
            Math.PI * 2,
          );
          ctx.fill();
        }
      }
    }
    ctx.restore();

    // A hairline under every row but the last.
    if (index < rows.length - 1) {
      ctx.save();
      ctx.globalAlpha = alpha * 0.5;
      ctx.fillStyle = withAlpha(palette.ink, 0.12);
      const w = (W - 2 * margin) * arrive;
      ctx.fillRect(rtl ? W - margin - w : margin, slot.y + slot.h, w, Math.max(1, u));
      ctx.restore();
    }
  });

  // The body copy under the menu, and the footer on feed posts.
  if (body) {
    const bodyFit = fitText(
      body,
      { maxWidth: W - 2 * margin, maxLines: 1, min: 22 * u, max: 30 * u },
      (size) => {
        ctx.font = font(size, STUDIO_FONTS.body, 400);
        return (text) => ctx.measureText(text).width;
      },
    );
    ctx.save();
    ctx.globalAlpha = presence(t, { start: 2, end: DURATION }) * 0.75;
    ctx.fillStyle = palette.ink;
    ctx.font = font(bodyFit.size, STUDIO_FONTS.body, 400);
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.direction = textDirection(body);
    ctx.fillText(bodyFit.lines[0] ?? body, W / 2, bottomLimit + 24 * u);
    ctx.restore();
  }
  const footer =
    layout.footerY === null
      ? brand.handle || brand.contact
      : [brand.handle, brand.contact].filter(Boolean).join("   ·   ");
  if (footer) {
    ctx.save();
    ctx.globalAlpha = presence(t, { start: 2.2, end: DURATION }) * 0.75;
    ctx.fillStyle = palette.ink;
    ctx.font = font(26 * u, STUDIO_FONTS.body, 400);
    ctx.direction = "ltr";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // On a story the handle sits under the mark; the foot belongs to Instagram.
    const y = layout.footerY === null ? layout.topY * H + 50 * u : layout.footerY * H;
    ctx.fillText(footer, W / 2, y);
    ctx.restore();
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

/** A café's drinks or a salon's services: rows with prices (and lengths), a highlight passing down them. */
export const menuBoard: StudioTemplate = {
  id: "menu-board",
  name: { en: "Menu", ar: "القائمة" },
  goal: { en: "Menu & services", ar: "المنيو والخدمات" },
  duration: DURATION,
  posterTime: 2.8,
  render,
};
