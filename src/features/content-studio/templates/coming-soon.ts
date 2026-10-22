import { drawCover, font, withAlpha, type Box } from "@/features/content-studio/engine/draw";
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
import {
  clipTo,
  cutPunch,
  drawGrain,
  drawRisingWords,
  layoutWords,
  shotAt,
  type PlacedWord,
} from "@/features/content-studio/engine/motion";

const DURATION = 8;
/** The slit: a hairline drawn across, then opening from its middle. */
const OPEN = { line: 0.25, lineFor: 0.5, start: 0.75, length: 1.15 };
/** Three quick glimpses of other details, then back to the first. */
const FLASH = { start: 3.7, length: 0.3, count: 3 };
/** Where a glimpse looks when the product has one photo: its details, never the whole piece. */
const GLIMPSES = [
  { focusX: 0.3, focusY: 0.28 },
  { focusX: 0.7, focusY: 0.58 },
  { focusX: 0.42, focusY: 0.8 },
];

/**
 * A story reads like a poster: the date first, the piece through its slit
 * under it, and the foot left free above Instagram's reply bar for the
 * countdown sticker (the merchant adds it). A feed post shows the piece
 * first and the date under it, above the handle.
 */
const LAYOUT: Record<
  FormatKey,
  {
    topY: number;
    slitY: number;
    slitH: number;
    textY: number;
    /** The launch day's size at reference width. */
    display: number;
    footerY: number | null;
  }
> = {
  story: { topY: 0.065, slitY: 0.415, slitH: 0.355, textY: 0.115, display: 150, footerY: null },
  portrait: { topY: 0.06, slitY: 0.115, slitH: 0.34, textY: 0.5, display: 112, footerY: 0.94 },
  square: { topY: 0.065, slitY: 0.125, slitH: 0.27, textY: 0.445, display: 88, footerY: 0.935 },
};

const WORDS = {
  en: { soon: "Coming soon", secret: "Something new" },
  ar: { soon: "قريباً", secret: "شي جديد" },
};

/**
 * Where the slit stands at `t`: the box it will fill and the part open now.
 * It starts at the reading start's margin and runs off the far edge, so the
 * frame never sits centred and boxed.
 */
export function slitAt(
  t: number,
  { W, H, format, rtl, u }: { W: number; H: number; format: FormatKey; rtl: boolean; u: number },
): { full: Box; open: Box; line: number } {
  const layout = LAYOUT[format];
  const margin = 80 * u;
  const full: Box = {
    x: rtl ? 0 : margin,
    y: layout.slitY * H,
    w: W - margin,
    h: layout.slitH * H,
  };
  const line = progress(t, OPEN.line, OPEN.lineFor, ease.inOutCubic);
  const opening = progress(t, OPEN.start, OPEN.length, ease.inOutCubic);
  const h = mix(3 * u, full.h, opening);
  const w = full.w * line;
  return {
    full,
    open: { x: rtl ? full.x + full.w - w : full.x, y: full.y + (full.h - h) / 2, w, h },
    line,
  };
}

/** The photo and its framing at `t`: one detail panning slowly, three quick glimpses in the middle. */
function framing(t: number, scene: SceneData, rtl: boolean) {
  const main = scene.media;
  const pan = progress(t, 0, DURATION, ease.linear);
  const steady = {
    source: main,
    zoom: mix(1.32, 1.42, pan),
    // The pan follows the reading direction.
    focusX: rtl ? mix(0.62, 0.38, pan) : mix(0.38, 0.62, pan),
    focusY: 0.4,
  };
  const end = FLASH.start + FLASH.length * FLASH.count;
  const shot = t < end ? shotAt(t, FLASH) : null;
  if (!shot) {
    // Back to the first detail with the same punch a cut has.
    const punch = t >= end ? cutPunch(t - end, 0.05) : 1;
    return { ...steady, zoom: steady.zoom * punch };
  }
  const others = (scene.shots ?? []).filter((image) => image !== main);
  const glimpse = GLIMPSES[shot.index % GLIMPSES.length];
  const source: Drawable | null = others.length > 0 ? others[shot.index % others.length] : main;
  return {
    source,
    zoom: (others.length > 0 ? 1.5 : 2.1) * cutPunch(shot.sinceCut, 0.08, 0.25),
    focusX: glimpse.focusX,
    focusY: glimpse.focusY,
  };
}

/** Sets the canvas's letter spacing where it has one (tracked Latin capitals only). */
function track(ctx: CanvasRenderingContext2D, spacing: string) {
  const spaced = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  if ("letterSpacing" in spaced) spaced.letterSpacing = spacing;
}

function render(ctx: CanvasRenderingContext2D, t: number, scene: SceneData) {
  const { width: W, height: H, brand, lang } = scene;
  const { palette } = brand;
  const u = W / 1080;
  const layout = LAYOUT[scene.format];
  const rtl = lang === "ar";
  const words = WORDS[lang];
  const margin = 80 * u;
  // Everything is set from the reading start: the left in English, the right in Arabic.
  const startX = rtl ? W - margin : margin;
  const launch = scene.launch ?? { when: null, time: null, secret: true };
  const name = (scene.headline.trim() || scene.productName).trim();
  const teaser = launch.secret || !name ? words.secret : name;

  ctx.fillStyle = palette.ground;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.globalAlpha = presence(t, { start: 0.05, end: DURATION });
  drawBrandMark(ctx, brand, {
    x: startX,
    y: layout.topY * H,
    u,
    align: rtl ? "right" : "left",
    onPhoto: false,
    ink: palette.ink,
  });
  ctx.restore();

  // The slit, and the piece seen through it.
  const slit = slitAt(t, { W, H, format: scene.format, rtl, u });
  if (slit.line > 0) {
    const frame = framing(t, scene, rtl);
    ctx.save();
    ctx.globalAlpha = presence(t, { start: 0, end: DURATION, enter: 0.01 });
    clipTo(ctx, slit.open);
    if (frame.source) {
      drawCover(ctx, frame.source, slit.full, {
        zoom: frame.zoom,
        focusX: frame.focusX,
        focusY: frame.focusY,
      });
      // The hairline is the ink until the slit has opened enough to show the photo.
      const opening = progress(t, OPEN.start, 0.3, ease.linear);
      if (opening < 1) {
        ctx.globalAlpha *= 1 - opening;
        ctx.fillStyle = palette.ink;
        ctx.fillRect(slit.open.x, slit.open.y, slit.open.w, slit.open.h);
      }
    } else {
      ctx.fillStyle = withAlpha(palette.ink, 0.1);
      ctx.fillRect(slit.open.x, slit.open.y, slit.open.w, slit.open.h);
    }
    ctx.restore();
  }

  let y = layout.textY * H;

  // The small line above: a short rule, then "Coming soon" (or, with no date, the teaser).
  const eyebrow = launch.when ? words.soon : teaser;
  const eyebrowDir = textDirection(eyebrow);
  const ruleW = 56 * u;
  const rule = progress(t, 1.45, 0.5, ease.outCubic);
  ctx.save();
  ctx.globalAlpha = presence(t, { start: 1.45, end: DURATION });
  ctx.fillStyle = palette.accent;
  ctx.fillRect(rtl ? startX - ruleW * rule : startX, y + 15 * u, ruleW * rule, 2 * u);
  ctx.globalAlpha *= progress(t, 1.7, 0.5, ease.outCubic);
  ctx.font = font(30 * u, STUDIO_FONTS.body, 600);
  if (eyebrowDir === "ltr") track(ctx, `${(0.2 * 30 * u).toFixed(1)}px`);
  ctx.direction = eyebrowDir;
  ctx.textAlign = rtl ? "right" : "left";
  ctx.textBaseline = "middle";
  const eyebrowX = rtl ? startX - ruleW - 22 * u : startX + ruleW + 22 * u;
  ctx.fillText(eyebrowDir === "ltr" ? eyebrow.toUpperCase() : eyebrow, eyebrowX, y + 16 * u);
  ctx.restore();
  y += 72 * u;

  // The big line: the launch day over its date (the date set in a step), or "Coming soon".
  const big = launch.when ? [launch.when.day, launch.when.date] : [words.soon];
  const bigDir = textDirection(big.join(" "));
  const family = displayFont(bigDir === "rtl" ? "ar" : "en", brand.displayFamilies);
  const max = (launch.when ? layout.display : layout.display * 1.2) * u;
  // The same size for both lines: the size the longer one fits at.
  const size = Math.min(
    ...big.map(
      (line) =>
        fitText(
          line,
          { maxWidth: W - 2 * margin - 120 * u, maxLines: 1, min: max * 0.55, max },
          (at) => {
            ctx.font = font(at, family, 600);
            return (text) => ctx.measureText(text).width;
          },
        ).size,
    ),
  );
  const lineH = size * (bigDir === "rtl" ? 1.24 : 1.0);
  // The second line steps in from the start, as a magazine sets a dateline.
  const indent = launch.when ? 120 * u : 0;
  ctx.font = font(size, family, 600);
  const measure = (text: string) => ctx.measureText(text).width;
  const placed: PlacedWord[] = big.flatMap((line, index) =>
    layoutWords([line], measure, {
      x: index === 0 ? startX : rtl ? startX - indent : startX + indent,
      y: y + index * lineH,
      lineHeight: lineH,
      dir: bigDir,
    }).map((word) => ({ ...word, line: index, order: word.order + index * 10 })),
  );
  ctx.save();
  ctx.globalAlpha = presence(t, { start: 1.8, end: DURATION, enter: 0.01 });
  ctx.fillStyle = palette.ink;
  ctx.font = font(size, family, 600);
  drawRisingWords(ctx, placed, {
    size,
    lineHeight: lineH,
    reveal: (word) =>
      progress(t, 1.8 + word.line * 0.22 + (word.order % 10) * 0.08, 0.75, ease.outExpo),
  });
  ctx.restore();
  y += big.length * lineH + 26 * u;

  // The hour, under the date's step.
  if (launch.when && launch.time) {
    ctx.save();
    ctx.globalAlpha = presence(t, { start: 2.5, end: DURATION }) * 0.85;
    ctx.fillStyle = palette.ink;
    ctx.font = font(38 * u, STUDIO_FONTS.body, 500);
    ctx.direction = textDirection(launch.time);
    ctx.textAlign = rtl ? "right" : "left";
    ctx.textBaseline = "top";
    ctx.fillText(launch.time, rtl ? startX - indent : startX + indent, y);
    ctx.restore();
    y += 64 * u;
  }

  // What is coming, kept a secret unless the merchant names it.
  if (launch.when) {
    const lineDir = textDirection(teaser);
    const fit = fitText(
      teaser,
      { maxWidth: W - 2 * margin - indent, maxLines: 2, min: 28 * u, max: 34 * u },
      (at) => {
        ctx.font = font(at, STUDIO_FONTS.body, 400);
        return (text) => ctx.measureText(text).width;
      },
    );
    ctx.save();
    ctx.globalAlpha = presence(t, { start: 2.8, end: DURATION }) * 0.78;
    ctx.fillStyle = palette.ink;
    ctx.font = font(fit.size, STUDIO_FONTS.body, 400);
    ctx.direction = lineDir;
    ctx.textAlign = rtl ? "right" : "left";
    ctx.textBaseline = "top";
    fit.lines.forEach((line, index) =>
      ctx.fillText(line, rtl ? startX - indent : startX + indent, y + index * fit.size * 1.45),
    );
    ctx.restore();
  }

  if (layout.footerY !== null) {
    const footer = [brand.handle, brand.contact].filter(Boolean).join("   ·   ");
    if (footer) {
      ctx.save();
      ctx.globalAlpha = presence(t, { start: 3, end: DURATION }) * 0.7;
      ctx.fillStyle = palette.ink;
      ctx.font = font(26 * u, STUDIO_FONTS.body, 400);
      ctx.direction = "ltr";
      ctx.textAlign = rtl ? "right" : "left";
      ctx.textBaseline = "middle";
      ctx.fillText(footer, startX, layout.footerY * H);
      ctx.restore();
    }
  }

  drawGrain(ctx, W, H, t, 0.05);

  const fade = progress(t, DURATION - 0.45, 0.45, ease.inCubic);
  if (fade > 0) {
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.fillStyle = palette.ground;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
}

/** A teaser: the piece seen through a slit, the launch day set large, the name kept back. */
export const comingSoon: StudioTemplate = {
  id: "coming-soon",
  name: { en: "Coming Soon", ar: "قريباً" },
  goal: { en: "Launch teaser", ar: "تشويق قبل الإطلاق" },
  duration: DURATION,
  posterTime: 6,
  render,
};
