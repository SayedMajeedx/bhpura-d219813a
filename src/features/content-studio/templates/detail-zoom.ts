import {
  coverPoint,
  drawCover,
  drawLines,
  drawShade,
  font,
  mediaSize,
  roundedRect,
  withAlpha,
  type Box,
} from "@/features/content-studio/engine/draw";
import { drawBrandMark } from "@/features/content-studio/engine/brand-mark";
import { displayFont, STUDIO_FONTS } from "@/features/content-studio/engine/fonts";
import type { FormatKey, SceneData, StudioTemplate } from "@/features/content-studio/engine/scene";
import { fitText, textDirection } from "@/features/content-studio/engine/text-layout";
import { ease, mix, presence, progress } from "@/features/content-studio/engine/timeline";

const DURATION = 8;
/** How far the camera pushes in on the detail. */
const ZOOM = 2.3;
/** Where the detail sits when the merchant has not tapped one: the upper body. */
export const DEFAULT_DETAIL_POINT = { x: 0.5, y: 0.42 } as const;

/**
 * Fractions of the height: the top row, and the lowest a text block may end
 * (stories stay clear of Instagram's reply bar; posts keep room for the footer).
 */
const LAYOUT: Record<FormatKey, { topRowY: number; textBottom: number; footerY: number | null }> = {
  story: { topRowY: 0.11, textBottom: 0.8, footerY: null },
  portrait: { topRowY: 0.055, textBottom: 0.88, footerY: 0.945 },
  square: { topRowY: 0.06, textBottom: 0.86, footerY: 0.935 },
};

const WHITE = "#ffffff";

/** The camera's move: in on the detail, hold, and back out. 0 is the whole photo. */
function pushAt(t: number) {
  const pushIn = progress(t, 1.3, 1.9, ease.inOutCubic);
  const pullOut = progress(t, 5.5, 1.1, ease.inOutCubic);
  return pushIn * (1 - pullOut);
}

function render(ctx: CanvasRenderingContext2D, t: number, scene: SceneData) {
  const { width: W, height: H, brand, lang } = scene;
  const { palette } = brand;
  const u = W / 1080;
  const layout = LAYOUT[scene.format];
  const rtl = lang === "ar";
  const margin = 80 * u;
  const startX = rtl ? W - margin : margin;
  const detail = scene.detail ?? { ...DEFAULT_DETAIL_POINT, label: "", note: "" };
  const whole = presence(t, { start: 0, end: DURATION, enter: 0.4 });

  // The photo, full bleed, with the camera easing towards the detail and back.
  const frame: Box = { x: 0, y: 0, w: W, h: H };
  const push = pushAt(t);
  const drift = mix(1.05, 1, progress(t, 0, 1.4, ease.outCubic));
  const camera = {
    zoom: mix(1, ZOOM, push) * drift,
    focusX: mix(0.5, detail.x, push),
    focusY: mix(0.5, detail.y, push),
  };
  ctx.fillStyle = palette.ground;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.globalAlpha = whole;
  if (scene.media) {
    drawCover(ctx, scene.media, frame, camera);
  } else {
    const fill = ctx.createLinearGradient(0, 0, W, H);
    fill.addColorStop(0, palette.accent);
    fill.addColorStop(1, palette.ground);
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, W, H);
  }
  // Shades for the white type: a light one at the top, a deeper one at the foot.
  drawShade(ctx, W, H, { height: 0.2, alpha: 0.38 }, { from: 0.5, alpha: 0.66 });
  ctx.restore();

  // Top row: the logo (white on the photo unless the merchant chose otherwise).
  ctx.save();
  ctx.globalAlpha = whole;
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
    ctx.fillStyle = WHITE;
    ctx.globalAlpha = whole * 0.9;
    ctx.font = font(26 * u, STUDIO_FONTS.body, 400);
    ctx.direction = "ltr";
    ctx.textAlign = rtl ? "left" : "right";
    ctx.textBaseline = "middle";
    ctx.fillText(topHandle, rtl ? margin : W - margin, layout.topRowY * H);
  }
  ctx.restore();

  const textBottom = layout.textBottom * H;
  const maxWidth = W - 2 * margin;
  const eyebrow = rtl ? "عن قرب" : "IN DETAIL";

  // Opening: the eyebrow and the headline over the whole look, leaving as the camera moves in.
  const opening = presence(t, { start: 0.3, end: 1.9, exit: 0.5 });
  if (opening > 0) {
    const headline = scene.headline.trim() || scene.productName;
    const family = displayFont(
      textDirection(headline) === "rtl" ? "ar" : "en",
      scene.brand.displayFamilies,
    );
    const fit = fitText(headline, { maxWidth, maxLines: 2, min: 56 * u, max: 100 * u }, (size) => {
      ctx.font = font(size, family, 600);
      return (text) => ctx.measureText(text).width;
    });
    const lineHeight = fit.size * 1.06;
    const headlineY = textBottom - fit.lines.length * lineHeight;
    ctx.save();
    ctx.globalAlpha = opening;
    ctx.fillStyle = WHITE;
    ctx.font = font(24 * u, STUDIO_FONTS.body, 500);
    ctx.direction = rtl ? "rtl" : "ltr";
    ctx.textAlign = "start";
    ctx.textBaseline = "bottom";
    ctx.fillText(eyebrow, startX, headlineY - 18 * u);
    ctx.font = font(fit.size, family, 600);
    drawLines(ctx, fit.lines, {
      x: startX,
      y: headlineY + (1 - opening) * 30 * u,
      lineHeight,
      dir: textDirection(headline),
    });
    ctx.restore();
  }

  // The hotspot where the detail lands on screen, pinging while the label shows.
  const size = scene.media ? mediaSize(scene.media) : { w: W, h: H };
  const spot =
    size.w && size.h
      ? coverPoint(size.w, size.h, frame, detail, camera)
      : { x: detail.x * W, y: detail.y * H };
  const spotAlpha = presence(t, { start: 3.05, end: 5.7, enter: 0.35, exit: 0.35 }) * whole;
  if (spotAlpha > 0) {
    ctx.save();
    for (const start of [3.1, 3.8, 4.5]) {
      const ping = progress(t, start, 1.2, ease.outCubic);
      if (ping <= 0 || ping >= 1) continue;
      ctx.globalAlpha = spotAlpha * (1 - ping) * 0.8;
      ctx.beginPath();
      ctx.arc(spot.x, spot.y, mix(16, 64, ping) * u, 0, Math.PI * 2);
      ctx.lineWidth = 3 * u;
      ctx.strokeStyle = WHITE;
      ctx.stroke();
    }
    const pop = progress(t, 3.05, 0.5, ease.outBack);
    ctx.globalAlpha = spotAlpha;
    ctx.beginPath();
    ctx.arc(spot.x, spot.y, 22 * u * pop, 0, Math.PI * 2);
    ctx.fillStyle = withAlpha(WHITE, 0.28);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(spot.x, spot.y, 11 * u * pop, 0, Math.PI * 2);
    ctx.fillStyle = WHITE;
    ctx.fill();
    ctx.restore();
  }

  // The label: a leader line from the hotspot to a card naming the detail.
  const cardAlpha = presence(t, { start: 3.45, end: 5.6, enter: 0.5, exit: 0.35 }) * whole;
  if (cardAlpha > 0) {
    // A story is taller, so its card reads a size up.
    const cu = u * (scene.format === "story" ? 1.2 : 1);
    const label = detail.label.trim() || scene.productName;
    const note = detail.note.trim();
    const labelFamily = displayFont(
      textDirection(label) === "rtl" ? "ar" : "en",
      scene.brand.displayFamilies,
    );
    const pad = 30 * cu;
    const cardMax = W * 0.5;
    const labelFit = fitText(
      label,
      { maxWidth: cardMax - 2 * pad, maxLines: 2, min: 34 * cu, max: 50 * cu },
      (px) => {
        ctx.font = font(px, labelFamily, 600);
        return (text) => ctx.measureText(text).width;
      },
    );
    ctx.font = font(labelFit.size, labelFamily, 600);
    const labelW = Math.max(...labelFit.lines.map((line) => ctx.measureText(line).width));
    ctx.font = font(24 * cu, STUDIO_FONTS.body, 400);
    const noteText = note && ctx.measureText(note).width > cardMax - 2 * pad ? "" : note;
    const noteW = noteText ? ctx.measureText(noteText).width : 0;
    ctx.font = font(20 * cu, STUDIO_FONTS.body, 500);
    const eyebrowW = ctx.measureText(eyebrow).width;
    const cardW = Math.min(cardMax, Math.max(labelW, noteW, eyebrowW) + 2 * pad);
    const cardH =
      pad * 2 +
      20 * cu +
      12 * cu +
      labelFit.lines.length * labelFit.size * 1.1 +
      (noteText ? 40 * cu : 0);
    // The card sits on the side with more room, level with the hotspot where it fits.
    const toRight = spot.x < W / 2;
    const reach = 120 * cu;
    const card: Box = {
      x: toRight ? Math.min(spot.x + reach, W - margin * 0.5 - cardW) : 0,
      y: Math.min(Math.max(spot.y - cardH / 2, 0.16 * H), textBottom - cardH),
      w: cardW,
      h: cardH,
    };
    if (!toRight) card.x = Math.max(spot.x - reach - cardW, margin * 0.5);
    const slide = (1 - cardAlpha) * 20 * cu * (toRight ? 1 : -1);
    card.x += slide;

    // Leader line, drawn out from the hotspot.
    const draw = progress(t, 3.3, 0.45, ease.outCubic);
    const endX = toRight ? card.x : card.x + card.w;
    const endY = card.y + card.h / 2;
    ctx.save();
    ctx.globalAlpha = cardAlpha;
    ctx.beginPath();
    ctx.moveTo(spot.x, spot.y);
    ctx.lineTo(mix(spot.x, endX, draw), mix(spot.y, endY, draw));
    ctx.lineWidth = 2 * cu;
    ctx.strokeStyle = WHITE;
    ctx.stroke();

    roundedRect(ctx, card, 14 * cu);
    ctx.fillStyle = withAlpha(palette.ground, 0.94);
    ctx.fill();
    const textX = rtl ? card.x + card.w - pad : card.x + pad;
    ctx.textAlign = "start";
    ctx.textBaseline = "top";
    ctx.direction = rtl ? "rtl" : "ltr";
    ctx.fillStyle = palette.accent;
    ctx.font = font(20 * cu, STUDIO_FONTS.body, 500);
    ctx.fillText(eyebrow, textX, card.y + pad);
    ctx.fillStyle = palette.ink;
    ctx.font = font(labelFit.size, labelFamily, 600);
    drawLines(ctx, labelFit.lines, {
      x: textX,
      y: card.y + pad + 32 * cu,
      lineHeight: labelFit.size * 1.1,
      dir: textDirection(label),
    });
    if (noteText) {
      ctx.globalAlpha = cardAlpha * 0.7;
      ctx.font = font(24 * cu, STUDIO_FONTS.body, 400);
      ctx.direction = textDirection(noteText);
      ctx.fillText(
        noteText,
        textX,
        card.y + pad + 32 * cu + labelFit.lines.length * labelFit.size * 1.1 + 10 * cu,
      );
    }
    ctx.restore();
  }

  // Closing, back on the whole look: the product, its price and the body copy.
  const closing = presence(t, { start: 6.3, end: DURATION });
  if (closing > 0) {
    const name = scene.productName;
    const family = displayFont(
      textDirection(name) === "rtl" ? "ar" : "en",
      scene.brand.displayFamilies,
    );
    const fit = fitText(name, { maxWidth, maxLines: 2, min: 50 * u, max: 88 * u }, (px) => {
      ctx.font = font(px, family, 600);
      return (text) => ctx.measureText(text).width;
    });
    const body = scene.body.trim();
    const bodyFit = body
      ? fitText(body, { maxWidth, maxLines: 2, min: 22 * u, max: 28 * u }, (px) => {
          ctx.font = font(px, STUDIO_FONTS.body, 400);
          return (text) => ctx.measureText(text).width;
        })
      : null;
    const nameH = fit.lines.length * fit.size * 1.06;
    const priceH = scene.price ? 58 * u : 0;
    const bodyLines = bodyFit ? bodyFit.lines.slice(0, 2) : [];
    const bodyH = bodyFit ? 14 * u + bodyLines.length * bodyFit.size * 1.45 : 0;
    const blockTop = textBottom - nameH - priceH - bodyH;
    const rise = (1 - closing) * 30 * u;
    ctx.save();
    ctx.globalAlpha = closing;
    ctx.fillStyle = WHITE;
    ctx.font = font(fit.size, family, 600);
    drawLines(ctx, fit.lines, {
      x: startX,
      y: blockTop + rise,
      lineHeight: fit.size * 1.06,
      dir: textDirection(name),
    });
    let y = blockTop + nameH + rise;
    if (scene.price) {
      ctx.font = font(34 * u, STUDIO_FONTS.body, 500);
      ctx.direction = textDirection(scene.price);
      ctx.textAlign = rtl ? "right" : "left";
      ctx.textBaseline = "top";
      ctx.fillText(scene.price, startX, y + 14 * u);
      y += priceH;
    }
    if (bodyFit) {
      ctx.globalAlpha = closing * 0.85;
      ctx.font = font(bodyFit.size, STUDIO_FONTS.body, 400);
      drawLines(ctx, bodyLines, {
        x: startX,
        y: y + 14 * u,
        lineHeight: bodyFit.size * 1.45,
        dir: textDirection(body),
      });
    }
    ctx.restore();
  }

  if (layout.footerY !== null) {
    const footer = [brand.handle, brand.contact].filter(Boolean).join("   ·   ");
    if (footer) {
      ctx.save();
      ctx.globalAlpha = whole * 0.85;
      ctx.fillStyle = WHITE;
      ctx.font = font(26 * u, STUDIO_FONTS.body, 400);
      ctx.direction = "ltr";
      ctx.textAlign = rtl ? "right" : "left";
      ctx.textBaseline = "middle";
      ctx.fillText(footer, startX, layout.footerY * H);
      ctx.restore();
    }
  }
}

/** Craft: the camera pushes into a detail, a hotspot pings and a label names it. */
export const detailZoom: StudioTemplate = {
  id: "detail-zoom",
  name: { en: "Detail Zoom", ar: "عن قرب" },
  goal: { en: "Fabric & finish", ar: "القماش والتفاصيل" },
  duration: DURATION,
  render,
};
