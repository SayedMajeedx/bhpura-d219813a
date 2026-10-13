import {
  drawCover,
  drawRuns,
  drawShade,
  font,
  measureRuns,
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
import {
  clipTo,
  drawRisingWords,
  layoutWords,
  wipeBox,
} from "@/features/content-studio/engine/motion";

const DURATION = 7;

const LAYOUT: Record<FormatKey, { topY: number; minPhotoH: number; footerY: number | null }> = {
  story: { topY: 0.11, minPhotoH: 0.34, footerY: null },
  portrait: { topY: 0.05, minPhotoH: 0.3, footerY: 0.94 },
  square: { topY: 0.055, minPhotoH: 0.26, footerY: 0.935 },
};

/** The words the template says itself, in the post's language. */
const WORDS = {
  en: { eyebrow: "Last chance", ends: (day: string) => `Ends ${day}`, code: "Code" },
  ar: { eyebrow: "فرصة أخيرة", ends: (day: string) => `ينتهي ${day}`, code: "كود" },
};

/**
 * The clock hand's turn at `t`: one tick a second, each landing with a small
 * overshoot, a full turn every twelve seconds. In turns (1 is a full circle).
 */
export function clockTurn(t: number): number {
  const whole = Math.floor(t);
  const tick = ease.outBack(Math.min(1, (t - whole) / 0.25));
  return (whole + tick) / 12;
}

function drawClock(
  ctx: CanvasRenderingContext2D,
  t: number,
  {
    cx,
    cy,
    r,
    ink,
    accent,
    u,
  }: { cx: number; cy: number; r: number; ink: string; accent: string; u: number },
) {
  const appear = progress(t, 0.9, 0.6, ease.outBack);
  if (appear <= 0) return;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(appear, appear);
  ctx.lineCap = "round";
  ctx.strokeStyle = ink;
  ctx.lineWidth = 5 * u;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
  // The hour marks.
  for (let mark = 0; mark < 12; mark++) {
    const angle = (mark / 12) * Math.PI * 2;
    const inner = mark % 3 === 0 ? r * 0.72 : r * 0.82;
    ctx.lineWidth = (mark % 3 === 0 ? 4 : 2) * u;
    ctx.beginPath();
    ctx.moveTo(Math.sin(angle) * inner, -Math.cos(angle) * inner);
    ctx.lineTo(Math.sin(angle) * r * 0.9, -Math.cos(angle) * r * 0.9);
    ctx.stroke();
  }
  // The hour hand stays near the end of the day; the minute hand ticks round.
  ctx.lineWidth = 7 * u;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  const hour = Math.PI * 2 * (11 / 12);
  ctx.lineTo(Math.sin(hour) * r * 0.45, -Math.cos(hour) * r * 0.45);
  ctx.stroke();
  const minute = Math.PI * 2 * clockTurn(t);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 5 * u;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.sin(minute) * r * 0.72, -Math.cos(minute) * r * 0.72);
  ctx.stroke();
  ctx.fillStyle = ink;
  ctx.beginPath();
  ctx.arc(0, 0, 8 * u, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function render(ctx: CanvasRenderingContext2D, t: number, scene: SceneData) {
  const { width: W, height: H, brand, lang } = scene;
  const { palette } = brand;
  const u = W / 1080;
  const layout = LAYOUT[scene.format];
  const rtl = lang === "ar";
  const words = WORDS[lang];
  const margin = 80 * u;
  const startX = rtl ? W - margin : margin;
  const deadline = scene.deadline ?? null;

  ctx.fillStyle = palette.ground;
  ctx.fillRect(0, 0, W, H);

  // What sits under the photo, measured first.
  const eyebrowSize = 92 * u;
  const eyebrowFamily = displayFont(lang, brand.displayFamilies);
  const clockR = 64 * u;
  const hasOffer = Boolean(deadline?.code || deadline?.offer?.length);
  const below =
    0.035 * H +
    eyebrowSize * 1.2 +
    28 * u +
    (deadline ? clockR * 2 + 28 * u : 0) +
    (hasOffer ? 110 * u : 0) +
    (scene.price ? 70 * u : 0);
  const photo: Box = {
    x: 0,
    y: 0,
    w: W,
    h: photoHeight({
      top: 0,
      bottom: CONTENT_BOTTOM[scene.format] * H,
      below,
      min: layout.minPhotoH * H,
    }),
  };

  // The photo, full width, wiping down and settling.
  const shown = wipeBox(photo, progress(t, 0, 0.8, ease.outExpo), "top", rtl);
  if (shown.h > 0) {
    ctx.save();
    clipTo(ctx, shown);
    if (scene.media) {
      drawCover(ctx, scene.media, photo, {
        zoom: mix(1.12, 1, progress(t, 0, DURATION, ease.outCubic)),
        focusY: 0.4,
      });
    } else {
      ctx.fillStyle = withAlpha(palette.ink, 0.1);
      ctx.fillRect(photo.x, photo.y, photo.w, photo.h);
    }
    drawShade(ctx, W, photo.h, { height: 0.26, alpha: 0.38 }, { from: 1, alpha: 0 });
    ctx.restore();
  }
  ctx.save();
  ctx.globalAlpha = presence(t, { start: 0.3, end: DURATION });
  drawBrandMark(ctx, brand, {
    x: startX,
    y: layout.topY * H,
    u,
    align: rtl ? "right" : "left",
    onPhoto: true,
    ink: palette.ink,
  });
  ctx.restore();

  // "Last chance", word by word.
  let y = photo.h + 0.035 * H;
  ctx.fillStyle = palette.ink;
  ctx.font = font(eyebrowSize, eyebrowFamily, 600);
  const eyebrowWords = layoutWords([words.eyebrow], (text) => ctx.measureText(text).width, {
    x: startX,
    y,
    lineHeight: eyebrowSize * 1.15,
    dir: rtl ? "rtl" : "ltr",
  });
  drawRisingWords(ctx, eyebrowWords, {
    size: eyebrowSize,
    lineHeight: eyebrowSize * 1.15,
    reveal: (word) => progress(t, 0.5 + word.order * 0.12, 0.6, ease.outExpo),
  });
  y += eyebrowSize * 1.2;

  // The product's name, quietly, under it.
  const name = (scene.headline.trim() || scene.productName).trim();
  if (name) {
    const nameFit = fitText(
      name,
      { maxWidth: W - 2 * margin, maxLines: 1, min: 24 * u, max: 34 * u },
      (size) => {
        ctx.font = font(size, STUDIO_FONTS.body, 500);
        return (text) => ctx.measureText(text).width;
      },
    );
    ctx.save();
    ctx.globalAlpha = presence(t, { start: 0.9, end: DURATION }) * 0.8;
    ctx.font = font(nameFit.size, STUDIO_FONTS.body, 500);
    ctx.textAlign = rtl ? "right" : "left";
    ctx.textBaseline = "top";
    ctx.direction = textDirection(name);
    ctx.fillText(nameFit.lines[0] ?? name, startX, y - 6 * u);
    ctx.restore();
  }
  y += 28 * u;

  // The clock and the last day beside it.
  if (deadline) {
    const cy = y + clockR + 14 * u;
    const clockX = rtl ? W - margin - clockR : margin + clockR;
    drawClock(ctx, t, { cx: clockX, cy, r: clockR, ink: palette.ink, accent: palette.accent, u });
    const textX = rtl ? clockX - clockR - 32 * u : clockX + clockR + 32 * u;
    const reveal = progress(t, 1.1, 0.6, ease.outExpo);
    ctx.save();
    ctx.globalAlpha = presence(t, { start: 1.1, end: DURATION });
    ctx.fillStyle = palette.ink;
    ctx.textAlign = rtl ? "right" : "left";
    ctx.textBaseline = "alphabetic";
    const dayText = words.ends(deadline.day);
    const dayFit = fitText(
      dayText,
      { maxWidth: W - 2 * margin - 2 * clockR - 40 * u, maxLines: 1, min: 34 * u, max: 64 * u },
      (size) => {
        ctx.font = font(size, STUDIO_FONTS.body, 600);
        return (text) => ctx.measureText(text).width;
      },
    );
    ctx.font = font(dayFit.size, STUDIO_FONTS.body, 600);
    ctx.direction = textDirection(dayText);
    ctx.fillText(
      dayFit.lines[0] ?? dayText,
      textX + (1 - reveal) * 30 * u * (rtl ? 1 : -1),
      cy + 4 * u,
    );
    ctx.globalAlpha *= 0.7;
    ctx.font = font(30 * u, STUDIO_FONTS.body, 400);
    ctx.direction = textDirection(deadline.date);
    ctx.fillText(deadline.date, textX, cy + 46 * u);
    ctx.restore();
    y = cy + clockR + 28 * u;
  }

  // The code and what it takes off, on a ticket stamped in.
  if (deadline && hasOffer) {
    const stamp = progress(t, 1.6, 0.55, ease.outBack);
    if (stamp > 0) {
      ctx.save();
      const offer = (deadline.offer ?? []).map((text) => ({ text }));
      const code = deadline.code ? `${words.code} ${deadline.code}` : "";
      ctx.font = font(34 * u, STUDIO_FONTS.body, 600);
      const offerW = offer.length > 0 ? measureRuns(ctx, offer, 10 * u).total : 0;
      ctx.font = font(28 * u, STUDIO_FONTS.body, 500);
      const codeW = code ? ctx.measureText(code).width : 0;
      const pad = 30 * u;
      const ticket: Box = {
        x: 0,
        y,
        w: offerW + codeW + pad * (offer.length > 0 && code ? 3 : 2),
        h: 80 * u,
      };
      ticket.x = rtl ? startX - ticket.w : startX;
      const cx = ticket.x + ticket.w / 2;
      const cy = ticket.y + ticket.h / 2;
      ctx.globalAlpha = presence(t, { start: 1.6, end: DURATION, enter: 0.2 });
      ctx.translate(cx, cy);
      ctx.rotate(mix(-0.2, -0.03, stamp) * (rtl ? -1 : 1));
      ctx.scale(mix(1.4, 1, stamp), mix(1.4, 1, stamp));
      ctx.translate(-cx, -cy);
      roundedRect(ctx, ticket, 12 * u);
      ctx.fillStyle = palette.ink;
      ctx.fill();
      // A dashed tear line between what it takes off and the code.
      ctx.fillStyle = palette.ground;
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      const first = rtl ? ticket.x + ticket.w - pad - offerW : ticket.x + pad;
      if (offer.length > 0) {
        ctx.font = font(34 * u, STUDIO_FONTS.body, 600);
        // Each piece on its own: an amount and a word never reorder into each other.
        drawRuns(ctx, offer, {
          x: rtl ? first + offerW : first,
          y: cy + u,
          lineDir: rtl ? "rtl" : "ltr",
          gap: 10 * u,
        });
      }
      if (code) {
        const codeX = rtl ? ticket.x + pad : ticket.x + ticket.w - pad - codeW;
        if (offer.length > 0) {
          const tearX = rtl ? codeX + codeW + pad / 2 : codeX - pad / 2;
          ctx.save();
          ctx.strokeStyle = withAlpha(palette.ground, 0.5);
          ctx.setLineDash([6 * u, 6 * u]);
          ctx.lineWidth = 2 * u;
          ctx.beginPath();
          ctx.moveTo(tearX, ticket.y + 12 * u);
          ctx.lineTo(tearX, ticket.y + ticket.h - 12 * u);
          ctx.stroke();
          ctx.restore();
        }
        ctx.font = font(28 * u, STUDIO_FONTS.body, 500);
        ctx.direction = textDirection(code);
        ctx.fillText(code, codeX, cy + u);
      }
      ctx.restore();
    }
    y += 110 * u;
  }

  // The price, and the price before the sale struck through beside it.
  if (scene.price) {
    ctx.save();
    ctx.globalAlpha = presence(t, { start: 2, end: DURATION });
    ctx.fillStyle = palette.ink;
    ctx.textAlign = rtl ? "right" : "left";
    ctx.textBaseline = "top";
    ctx.font = font(40 * u, STUDIO_FONTS.body, 600);
    // An Arabic price ("30.000 د.ب.") reads right to left: number first, then the currency.
    ctx.direction = textDirection(scene.price);
    ctx.fillText(scene.price, startX, y);
    const priceW = ctx.measureText(scene.price).width;
    if (scene.originalPrice) {
      ctx.globalAlpha *= 0.55;
      ctx.font = font(30 * u, STUDIO_FONTS.body, 400);
      ctx.direction = textDirection(scene.originalPrice);
      const wasW = ctx.measureText(scene.originalPrice).width;
      const wasX = rtl ? startX - priceW - 24 * u : startX + priceW + 24 * u;
      ctx.fillText(scene.originalPrice, wasX, y + 8 * u);
      const strike = progress(t, 2.4, 0.4, ease.inOutCubic);
      const left = rtl ? wasX - wasW : wasX;
      ctx.fillRect(left, y + 26 * u, wasW * strike, Math.max(1, 2.5 * u));
    }
    ctx.restore();
  }

  if (layout.footerY !== null) {
    const footer = [brand.handle, brand.contact].filter(Boolean).join("   ·   ");
    if (footer) {
      ctx.save();
      ctx.globalAlpha = presence(t, { start: 2.2, end: DURATION }) * 0.75;
      ctx.fillStyle = palette.ink;
      ctx.font = font(26 * u, STUDIO_FONTS.body, 400);
      ctx.direction = "ltr";
      ctx.textAlign = rtl ? "right" : "left";
      ctx.textBaseline = "middle";
      ctx.fillText(footer, startX, layout.footerY * H);
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

/** A sale's last days: the clock ticking, the last day named, the code on a ticket. */
export const lastChance: StudioTemplate = {
  id: "last-chance",
  name: { en: "Last Chance", ar: "فرصة أخيرة" },
  goal: { en: "Offer ending", ar: "عرض ينتهي" },
  duration: DURATION,
  render,
};
