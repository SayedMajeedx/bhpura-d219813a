import { drawBrandMark } from "@/features/content-studio/engine/brand-mark";
import { CTA_HEIGHT, drawCallToAction } from "@/features/content-studio/engine/cta";
import {
  drawCover,
  drawLines,
  drawShade,
  font,
  roundedRect,
  withAlpha,
} from "@/features/content-studio/engine/draw";
import { displayFont, STUDIO_FONTS } from "@/features/content-studio/engine/fonts";
import { CONTENT_BOTTOM } from "@/features/content-studio/engine/safe-area";
import type { FormatKey, SceneData, StudioTemplate } from "@/features/content-studio/engine/scene";
import { fitText, textDirection } from "@/features/content-studio/engine/text-layout";
import { ease, mix, presence, progress } from "@/features/content-studio/engine/timeline";

const DURATION = 6;
const WHITE = "#ffffff";
const CTA_INK = "#141414";

/** Where the logo sits and how much of the foot is shaded, per format (fractions of the height). */
const LAYOUT: Record<FormatKey, { logoY: number; shadeFrom: number; headlineMax: number }> = {
  // Below Instagram's top bar on a story; the copy ends above its reply bar (CONTENT_BOTTOM).
  story: { logoY: 0.085, shadeFrom: 0.4, headlineMax: 118 },
  portrait: { logoY: 0.06, shadeFrom: 0.36, headlineMax: 104 },
  square: { logoY: 0.065, shadeFrom: 0.3, headlineMax: 92 },
};

/** A line of the copy block, measured once so the block can be set from its foot up. */
type Part = { height: number; gapAfter: number; draw: (top: number, alpha: number) => void };

function render(ctx: CanvasRenderingContext2D, t: number, scene: SceneData) {
  const { width: W, height: H, brand, lang } = scene;
  const u = W / 1080;
  const layout = LAYOUT[scene.format];
  const rtl = lang === "ar";
  const margin = 76 * u;
  const startX = rtl ? W - margin : margin;
  const align = rtl ? "right" : "left";
  const textW = W - 2 * margin;
  const story = scene.format === "story";
  const appear = (start: number) => presence(t, { start, end: DURATION, enter: 0.6 });
  const rise = (start: number) => (1 - progress(t, start, 0.7, ease.outCubic)) * 26 * u;

  // The photo, full bleed, settling slowly.
  ctx.fillStyle = brand.palette.ground;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.globalAlpha = presence(t, { start: 0, end: DURATION, enter: 0.5 });
  if (scene.media) {
    drawCover(
      ctx,
      scene.media,
      { x: 0, y: 0, w: W, h: H },
      {
        zoom: mix(1.08, 1, progress(t, 0, DURATION, ease.outCubic)),
        focusY: 0.38,
      },
    );
  } else {
    const fill = ctx.createLinearGradient(0, 0, 0, H);
    fill.addColorStop(0, brand.palette.accent);
    fill.addColorStop(1, brand.palette.ground);
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, W, H);
  }
  // Shade under the logo and under the words, so white type reads on any photo.
  drawShade(ctx, W, H, { height: 0.2, alpha: 0.42 }, { from: layout.shadeFrom, alpha: 0.86 });
  ctx.restore();

  // The logo, centred and large enough to read at a glance; on a story the handle under it.
  ctx.save();
  ctx.globalAlpha = appear(0.2);
  drawBrandMark(ctx, brand, {
    x: W / 2,
    y: layout.logoY * H,
    u,
    align: "center",
    onPhoto: true,
    ink: brand.palette.ink,
    height: 66,
    maxWidth: 460,
  });
  const contact = [brand.handle, brand.contact].filter(Boolean).join("   ·   ");
  if (story && contact) {
    ctx.globalAlpha *= 0.85;
    ctx.fillStyle = WHITE;
    ctx.font = font(25 * u, STUDIO_FONTS.body, 400);
    ctx.direction = "ltr";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(contact, W / 2, layout.logoY * H + 66 * u * brand.logoScale * 0.5 + 40 * u);
  }
  ctx.restore();

  // The copy block, set from the foot up so it always ends above the reply bar.
  const parts: Part[] = [];

  const kind = scene.productKind?.trim();
  if (kind) {
    const size = 30 * u;
    parts.push({
      height: size * 1.2,
      gapAfter: 14 * u,
      draw: (top, alpha) => {
        ctx.save();
        ctx.globalAlpha = alpha * 0.85;
        ctx.fillStyle = WHITE;
        ctx.font = font(size, STUDIO_FONTS.body, 500);
        const dir = textDirection(kind);
        ctx.direction = dir;
        ctx.textAlign = align;
        ctx.textBaseline = "top";
        // A short rule before the kind, on the reading side.
        const ruleW = 40 * u;
        ctx.fillRect(rtl ? startX - ruleW : startX, top + size * 0.55, ruleW, 2 * u);
        ctx.fillText(
          dir === "rtl" ? kind : kind.toUpperCase(),
          rtl ? startX - ruleW - 16 * u : startX + ruleW + 16 * u,
          top,
        );
        ctx.restore();
      },
    });
  }

  const headline = (scene.headline.trim() || scene.productName).trim();
  if (headline) {
    const headDir = textDirection(headline);
    const family = displayFont(headDir === "rtl" ? "ar" : "en", brand.displayFamilies);
    const fit = fitText(
      headline,
      { maxWidth: textW, maxLines: 2, min: 58 * u, max: layout.headlineMax * u },
      (size) => {
        ctx.font = font(size, family, 600);
        return (text) => ctx.measureText(text).width;
      },
    );
    const lines = fit.lines.slice(0, 2);
    const lineH = fit.size * (headDir === "rtl" ? 1.32 : 1.08);
    parts.push({
      height: lineH * lines.length,
      gapAfter: 18 * u,
      draw: (top, alpha) => {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = WHITE;
        ctx.font = font(fit.size, family, 600);
        drawLines(ctx, lines, { x: startX, y: top, lineHeight: lineH, dir: headDir });
        ctx.restore();
      },
    });
  }

  const body = scene.body.trim();
  if (body) {
    const fit = fitText(
      body,
      { maxWidth: textW, maxLines: 2, min: 26 * u, max: 32 * u },
      (size) => {
        ctx.font = font(size, STUDIO_FONTS.body, 400);
        return (text) => ctx.measureText(text).width;
      },
    );
    const lines = fit.lines.slice(0, 2);
    const lineH = fit.size * 1.5;
    parts.push({
      height: lineH * lines.length,
      gapAfter: 26 * u,
      draw: (top, alpha) => {
        ctx.save();
        ctx.globalAlpha = alpha * 0.88;
        ctx.fillStyle = WHITE;
        ctx.font = font(fit.size, STUDIO_FONTS.body, 400);
        drawLines(ctx, lines, { x: startX, y: top, lineHeight: lineH, dir: textDirection(body) });
        ctx.restore();
      },
    });
  }

  if (scene.priceAmount) {
    const amount = scene.priceAmount;
    const amountSize = 74 * u;
    const currencySize = 30 * u;
    const was = scene.originalPrice;
    const percent = scene.discountPercent;
    const ends = scene.saleEnds?.trim() || null;
    parts.push({
      height: amountSize * 1.05 + (ends ? 44 * u : 0),
      gapAfter: 30 * u,
      draw: (top, alpha) => {
        ctx.save();
        ctx.globalAlpha = alpha;
        const baseline = top + amountSize * 0.86;
        // In reading order: the amount and its currency, the old price struck, the saving.
        const pieces: Array<{ w: number; draw: (left: number) => void }> = [];
        ctx.font = font(amountSize, displayFont("en", brand.displayFamilies), 600);
        const amountW = ctx.measureText(amount).width;
        ctx.font = font(currencySize, STUDIO_FONTS.body, 500);
        const currencyW = ctx.measureText(scene.currencyLabel).width;
        const gap = 12 * u;
        pieces.push({
          w: amountW + gap + currencyW,
          draw: (left) => {
            ctx.fillStyle = WHITE;
            ctx.direction = "ltr";
            ctx.textAlign = "left";
            ctx.textBaseline = "alphabetic";
            const amountX = rtl ? left + currencyW + gap : left;
            const currencyX = rtl ? left : left + amountW + gap;
            ctx.font = font(amountSize, displayFont("en", brand.displayFamilies), 600);
            ctx.fillText(amount, amountX, baseline);
            ctx.font = font(currencySize, STUDIO_FONTS.body, 500);
            ctx.direction = textDirection(scene.currencyLabel);
            ctx.fillText(scene.currencyLabel, currencyX, baseline);
          },
        });
        if (was) {
          ctx.font = font(34 * u, STUDIO_FONTS.body, 400);
          const wasW = ctx.measureText(was).width;
          pieces.push({
            w: wasW,
            draw: (left) => {
              ctx.globalAlpha = alpha * 0.7;
              ctx.fillStyle = WHITE;
              ctx.font = font(34 * u, STUDIO_FONTS.body, 400);
              ctx.direction = textDirection(was);
              ctx.textAlign = "left";
              ctx.textBaseline = "alphabetic";
              ctx.fillText(was, left, baseline);
              ctx.fillRect(left - 4 * u, baseline - 12 * u, wasW + 8 * u, 3 * u);
              ctx.globalAlpha = alpha;
            },
          });
        }
        if (percent) {
          const label = `−${percent}%`;
          ctx.font = font(30 * u, STUDIO_FONTS.body, 600);
          const pillW = ctx.measureText(label).width + 36 * u;
          pieces.push({
            w: pillW,
            draw: (left) => {
              const h = 54 * u;
              roundedRect(ctx, { x: left, y: baseline - h * 0.78, w: pillW, h }, h / 2);
              ctx.fillStyle = brand.palette.accent;
              ctx.fill();
              ctx.fillStyle = WHITE;
              ctx.font = font(30 * u, STUDIO_FONTS.body, 600);
              ctx.direction = "ltr";
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillText(label, left + pillW / 2, baseline - h * 0.78 + h / 2);
            },
          });
        }
        const spacing = 26 * u;
        let cursor = startX;
        for (const piece of pieces) {
          const left = rtl ? cursor - piece.w : cursor;
          piece.draw(left);
          cursor = rtl ? left - spacing : left + piece.w + spacing;
        }
        if (ends) {
          ctx.globalAlpha = alpha * 0.85;
          ctx.fillStyle = WHITE;
          ctx.font = font(27 * u, STUDIO_FONTS.body, 500);
          ctx.direction = textDirection(ends);
          ctx.textAlign = align;
          ctx.textBaseline = "top";
          ctx.fillText(ends, startX, top + amountSize * 1.05 + 8 * u);
        }
        ctx.restore();
      },
    });
  }

  const cta = scene.cta?.trim();
  if (cta) {
    parts.push({
      height: CTA_HEIGHT * u,
      gapAfter: 0,
      draw: (top, alpha) =>
        drawCallToAction(ctx, cta, {
          x: startX,
          y: top + (CTA_HEIGHT * u) / 2,
          u,
          align,
          fill: WHITE,
          ink: CTA_INK,
          alpha,
        }),
    });
  }

  // Feed posts keep a footer line with the handle and contact under the block.
  const footerH = !story && contact ? 56 * u : 0;
  const bottom = CONTENT_BOTTOM[scene.format] * H - 8 * u;
  const total = parts.reduce(
    (sum, part, i) => sum + part.height + (i < parts.length - 1 ? part.gapAfter : 0),
    0,
  );
  let top = bottom - total;
  parts.forEach((part, index) => {
    const start = 0.6 + index * 0.22;
    part.draw(top + rise(start), appear(start));
    top += part.height + part.gapAfter;
  });

  if (footerH > 0) {
    ctx.save();
    ctx.globalAlpha = appear(1.6) * 0.8;
    ctx.fillStyle = WHITE;
    ctx.font = font(25 * u, STUDIO_FONTS.body, 400);
    ctx.direction = "ltr";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(contact, W / 2, H - (1 - CONTENT_BOTTOM[scene.format]) * H * 0.5);
    ctx.restore();
  }

  // A thin frame in the store's colour, drawn last, so a still reads as finished.
  ctx.save();
  ctx.globalAlpha = appear(0.4) * 0.5;
  ctx.strokeStyle = withAlpha(WHITE, 0.6);
  ctx.lineWidth = 2 * u;
  ctx.strokeRect(28 * u, 28 * u, W - 56 * u, H - 56 * u);
  ctx.restore();
}

/**
 * The post most stores start from: the product's photo or video full bleed, the logo at the top,
 * and the piece's kind, name, a line about it, its price (the offer's, while one is on) and what
 * to do, set from the foot up so it always ends above Instagram's reply bar.
 */
export const classic: StudioTemplate = {
  id: "classic",
  name: { en: "Classic", ar: "كلاسيكي" },
  goal: { en: "Photo or video", ar: "صورة أو فيديو المنتج" },
  duration: DURATION,
  posterTime: 4.5,
  render,
};
