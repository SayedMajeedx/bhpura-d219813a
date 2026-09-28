import {
  drawCover,
  font,
  roundedRect,
  withAlpha,
  type Box,
} from "@/features/content-studio/engine/draw";
import { drawBrandMark } from "@/features/content-studio/engine/brand-mark";
import { displayFont, STUDIO_FONTS } from "@/features/content-studio/engine/fonts";
import type {
  Drawable,
  FormatKey,
  SceneData,
  StudioTemplate,
} from "@/features/content-studio/engine/scene";
import { fitText, textDirection } from "@/features/content-studio/engine/text-layout";
import { ease, mix, presence, progress } from "@/features/content-studio/engine/timeline";

const DURATION = 9;
const INTRO = 0.7;
const OUTRO = 0.7;

/** Fractions of the height. Stories keep clear of Instagram's top and bottom bars. */
const LAYOUT: Record<
  FormatKey,
  { topRowY: number; cardY: number; cardH: number; cardInset: number; footerY: number | null }
> = {
  story: { topRowY: 0.11, cardY: 0.155, cardH: 0.53, cardInset: 120, footerY: null },
  portrait: { topRowY: 0.05, cardY: 0.095, cardH: 0.52, cardInset: 170, footerY: 0.945 },
  square: { topRowY: 0.055, cardY: 0.1, cardH: 0.5, cardInset: 250, footerY: 0.94 },
};

/** Height (fraction of H) the card gives up when the post has body copy. */
const BODY_ROOM: Record<FormatKey, number> = { story: 0.06, portrait: 0.07, square: 0.09 };

type Stop = { label: string; color: string | null; media: Drawable | null };

/** The stops to run through: the product's options, or the product itself. */
function stopsOf(scene: SceneData): Stop[] {
  if (scene.options && scene.options.stops.length >= 2) return scene.options.stops;
  return [{ label: scene.productName, color: null, media: scene.media }];
}

function render(ctx: CanvasRenderingContext2D, t: number, scene: SceneData) {
  const { width: W, height: H, brand, lang } = scene;
  const { palette } = brand;
  const u = W / 1080;
  const layout = LAYOUT[scene.format];
  const rtl = lang === "ar";
  const margin = 80 * u;
  const stops = stopsOf(scene);
  const n = stops.length;
  const segment = (DURATION - INTRO - OUTRO) / n;
  const startOf = (i: number) => INTRO + i * segment;
  const current = Math.min(n - 1, Math.max(0, Math.floor((t - INTRO) / segment)));
  const turn = current > 0 ? progress(t, startOf(current), 0.6, ease.inOutCubic) : 1;
  const whole = presence(t, { start: 0.05, end: DURATION });

  ctx.fillStyle = palette.ground;
  ctx.fillRect(0, 0, W, H);

  // Top row: the logo, and on stories the handle opposite.
  ctx.save();
  ctx.globalAlpha = whole;
  drawBrandMark(ctx, brand, {
    x: rtl ? W - margin : margin,
    y: layout.topRowY * H,
    u,
    align: rtl ? "right" : "left",
    onPhoto: false,
    ink: palette.ink,
  });
  ctx.fillStyle = palette.ink;
  ctx.textBaseline = "middle";
  const topHandle = layout.footerY === null ? brand.handle || brand.contact : null;
  if (topHandle) {
    ctx.font = font(26 * u, STUDIO_FONTS.body, 400);
    ctx.direction = "ltr";
    ctx.textAlign = rtl ? "left" : "right";
    ctx.fillText(topHandle, rtl ? margin : W - margin, layout.topRowY * H);
  }
  ctx.restore();

  // The card: each option's own photo, crossfading with a gentle push.
  const inset = layout.cardInset * u;
  // The card gives up some height when there is body copy to set below.
  const bodyRoom = scene.body.trim() ? BODY_ROOM[scene.format] : 0;
  const card: Box = {
    x: inset,
    y: layout.cardY * H,
    w: W - 2 * inset,
    h: (layout.cardH - bodyRoom) * H,
  };
  const cardIn = progress(t, 0.1, 0.9, ease.outExpo);
  ctx.save();
  ctx.globalAlpha = whole;
  const grow = mix(0.96, 1, cardIn);
  const cx = card.x + card.w / 2;
  const cy = card.y + card.h / 2;
  ctx.translate(cx, cy);
  ctx.scale(grow, grow);
  ctx.translate(-cx, -cy);
  roundedRect(ctx, card, 14 * u);
  ctx.fillStyle = withAlpha(palette.ink, 0.06);
  ctx.fill();
  ctx.clip();
  const drawStop = (index: number, alpha: number, shift: number) => {
    const stop = stops[index];
    if (!stop?.media || alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = whole * alpha;
    const within = progress(t, startOf(index), segment + 0.6, ease.outCubic);
    const box = { ...card, x: card.x + shift };
    drawCover(ctx, stop.media, box, { zoom: mix(1.06, 1, within) });
    ctx.restore();
  };
  const push = 40 * u * (rtl ? 1 : -1);
  if (current > 0 && turn < 1) drawStop(current - 1, 1 - turn, push * turn);
  drawStop(current, current > 0 ? turn : 1, current > 0 ? -push * (1 - turn) : 0);
  ctx.restore();

  // Eyebrow (the headline), then the option's name rising in.
  const below = card.y + card.h + 0.03 * H;
  const eyebrow = (scene.headline.trim() || scene.productName).slice(0, 48);
  ctx.save();
  ctx.globalAlpha = presence(t, { start: 0.5, end: DURATION });
  ctx.fillStyle = palette.accent;
  ctx.font = font(28 * u, STUDIO_FONTS.body, 500);
  ctx.direction = textDirection(eyebrow);
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(textDirection(eyebrow) === "rtl" ? eyebrow : eyebrow.toUpperCase(), W / 2, below);
  ctx.restore();

  const nameY = below + 52 * u;
  stops.forEach((stop, index) => {
    const alpha = presence(t, {
      start: startOf(index) + (index === 0 ? 0.25 : 0.15),
      end: index === n - 1 ? DURATION : startOf(index + 1) + 0.3,
      enter: 0.6,
      exit: 0.3,
    });
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = palette.ink;
    const family = displayFont(textDirection(stop.label) === "rtl" ? "ar" : "en");
    ctx.font = font(84 * u, family, 600, textDirection(stop.label) === "rtl" ? "normal" : "italic");
    ctx.direction = textDirection(stop.label);
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(stop.label, W / 2, nameY + (1 - alpha) * 24 * u);
    ctx.restore();
  });

  // The swatch row (or chips), with the active one marked.
  let afterRow = nameY + 110 * u;
  if (n >= 2) {
    const rowY = nameY + 150 * u;
    const rowAlpha = presence(t, { start: 0.6, end: DURATION });
    ctx.save();
    ctx.globalAlpha = rowAlpha;
    if (scene.options?.swatch) {
      const r = 26 * u;
      const gap = 40 * u;
      const rowW = n * 2 * r + (n - 1) * gap;
      const xOf = (i: number) => {
        const order = rtl ? n - 1 - i : i;
        return W / 2 - rowW / 2 + r + order * (2 * r + gap);
      };
      stops.forEach((stop, index) => {
        ctx.beginPath();
        ctx.arc(xOf(index), rowY, r, 0, Math.PI * 2);
        ctx.fillStyle = stop.color ?? palette.muted;
        ctx.fill();
        ctx.lineWidth = 2 * u;
        ctx.strokeStyle = withAlpha(palette.ink, 0.18);
        ctx.stroke();
      });
      const ringX = current > 0 ? mix(xOf(current - 1), xOf(current), turn) : xOf(0);
      ctx.beginPath();
      ctx.arc(ringX, rowY, r + 11 * u, 0, Math.PI * 2);
      ctx.lineWidth = 3 * u;
      ctx.strokeStyle = palette.ink;
      ctx.stroke();
      afterRow = rowY + r + 40 * u;
    } else {
      ctx.font = font(26 * u, STUDIO_FONTS.body, 500);
      const pad = 26 * u;
      const h = 56 * u;
      const gap = 16 * u;
      const widths = stops.map((stop) => ctx.measureText(stop.label).width + 2 * pad);
      const rowW = widths.reduce((sum, w) => sum + w, 0) + gap * (n - 1);
      const ordered = rtl ? [...stops.keys()].reverse() : [...stops.keys()];
      let x = W / 2 - rowW / 2;
      for (const index of ordered) {
        const pill: Box = { x, y: rowY - h / 2, w: widths[index], h };
        const active =
          index === current ? (current > 0 ? turn : 1) : index === current - 1 ? 1 - turn : 0;
        roundedRect(ctx, pill, h / 2);
        ctx.fillStyle = withAlpha(palette.ink, 0.9 * active);
        ctx.fill();
        ctx.lineWidth = 2 * u;
        ctx.strokeStyle = withAlpha(palette.ink, 0.3);
        ctx.stroke();
        ctx.fillStyle = active > 0.5 ? palette.ground : palette.ink;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.direction = textDirection(stops[index].label);
        ctx.fillText(stops[index].label, pill.x + pill.w / 2, rowY + u);
        x += widths[index] + gap;
      }
      afterRow = rowY + h / 2 + 40 * u;
    }
    ctx.restore();
  }

  // The price, quietly, under the row, then the body copy.
  const body = scene.body.trim();
  if (body) {
    const bodyFit = fitText(
      body,
      { maxWidth: W - 2 * margin, maxLines: 2, min: 22 * u, max: 27 * u },
      (size) => {
        ctx.font = font(size, STUDIO_FONTS.body, 400);
        return (text) => ctx.measureText(text).width;
      },
    );
    const bodyY = afterRow + (scene.price ? 56 * u : 0);
    ctx.save();
    ctx.globalAlpha = presence(t, { start: 1.4, end: DURATION }) * 0.75;
    ctx.fillStyle = palette.ink;
    ctx.font = font(bodyFit.size, STUDIO_FONTS.body, 400);
    ctx.direction = textDirection(body);
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    bodyFit.lines.slice(0, 2).forEach((line, index) => {
      ctx.fillText(line, W / 2, bodyY + index * bodyFit.size * 1.45);
    });
    ctx.restore();
  }
  if (scene.price) {
    ctx.save();
    ctx.globalAlpha = presence(t, { start: 1.2, end: DURATION }) * 0.9;
    ctx.fillStyle = palette.ink;
    ctx.font = font(34 * u, STUDIO_FONTS.body, 500);
    ctx.direction = textDirection(scene.price);
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(scene.price, W / 2, afterRow);
    ctx.restore();
  }

  if (layout.footerY !== null) {
    const footer = [brand.handle, brand.contact].filter(Boolean).join("   ·   ");
    if (footer) {
      ctx.save();
      ctx.globalAlpha = presence(t, { start: 1.6, end: DURATION }) * 0.75;
      ctx.fillStyle = palette.ink;
      ctx.font = font(26 * u, STUDIO_FONTS.body, 400);
      ctx.direction = "ltr";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(footer, W / 2, layout.footerY * H);
      ctx.restore();
    }
  }
}

/** Colours (or any option): each variant's own photo, its name, and the swatch row. */
export const swatchRun: StudioTemplate = {
  id: "swatch-run",
  name: { en: "Swatch Run", ar: "جولة الألوان" },
  goal: { en: "Colours & options", ar: "الألوان والخيارات" },
  duration: DURATION,
  render,
};
