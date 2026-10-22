import {
  drawCover,
  drawShade,
  font,
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
import {
  clipTo,
  cutPunch,
  drawGrain,
  drawRisingWords,
  layoutWords,
  shotDrift,
} from "@/features/content-studio/engine/motion";

const DURATION = 9;
/** When each chapter starts; the last holds to the end. */
const CHAPTERS = [0.35, 2.95, 5.55] as const;
/** How far past the end the last chapter's words would leave: they stay until the loop's own fade. */
const MOTION_EXIT = 1;
/**
 * Where the first two chapters look when the product has one photo: the cut
 * at the shoulder and sleeve, then the cloth lower down. Never the face: a
 * chapter about the piece looks at the piece.
 */
const DETAILS = [
  { zoom: 1.8, focusX: 0.3, focusY: 0.5 },
  { zoom: 2.2, focusX: 0.6, focusY: 0.7 },
];

/**
 * A story and a portrait stack the photo over the words, the seam between
 * them; a square sets the photo at the far side and the words at the
 * reading start, the seam down the photo's edge.
 */
const LAYOUT: Record<
  FormatKey,
  {
    side: boolean;
    photo: number;
    textGap: number;
    /** The chapter's title and number at reference width (a reel is read at a glance). */
    title: number;
    number: number;
    footerY: number | null;
  }
> = {
  story: { side: false, photo: 0.6, textGap: 0.035, title: 108, number: 120, footerY: null },
  portrait: { side: false, photo: 0.55, textGap: 0.03, title: 86, number: 96, footerY: 0.94 },
  square: { side: true, photo: 0.52, textGap: 0, title: 70, number: 88, footerY: 0.935 },
};

const FALLBACK = {
  en: [
    { title: "Your details", line: "Just as you asked" },
    { title: "Made for you", line: "Once you order" },
    { title: "Yours", line: "" },
  ],
  ar: [
    { title: "تفاصيلك", line: "حسب طلبك" },
    { title: "صنع لك", line: "بعد طلبك" },
    { title: "طلبك", line: "" },
  ],
};

/** The chapter playing at `t` (0 before the first starts) and the time since it started. */
export function chapterAt(t: number): { index: number; since: number } {
  let index = 0;
  CHAPTERS.forEach((start, i) => {
    if (t >= start) index = i;
  });
  return { index, since: Math.max(0, t - CHAPTERS[index]) };
}

/**
 * How far the seam is sewn at `t` (0 to 1): steadily from the first chapter
 * to a beat before the end, so it reaches the edge as the last one settles.
 */
export function seamSewn(t: number): number {
  return progress(t, CHAPTERS[0], DURATION - 1.6 - CHAPTERS[0], ease.inOutCubic);
}

/** The photo and its framing for chapter `index`: two details, then the whole piece pulling back. */
function framing(index: number, since: number, scene: SceneData) {
  const main = scene.media;
  const others = (scene.shots ?? []).filter((image) => image !== main);
  const length = (CHAPTERS[index + 1] ?? DURATION) - CHAPTERS[index];
  const local = Math.min(1, since / length);
  const punch = index > 0 ? cutPunch(since, 0.06) : 1;
  if (index === CHAPTERS.length - 1) {
    return {
      source: main,
      zoom: mix(1.18, 1, progress(since, 0, 2.2, ease.outCubic)) * punch,
      focusX: 0.5,
      focusY: 0.42,
    };
  }
  const drift = shotDrift(index, local);
  const source: Drawable | null = others[index] ?? main;
  const detail = others[index] ? { zoom: 1.2, focusX: 0.5, focusY: 0.45 } : DETAILS[index];
  return {
    source,
    zoom: detail.zoom * drift.zoom * punch,
    focusX: detail.focusX + (drift.focusX - 0.5),
    focusY: detail.focusY,
  };
}

/** A line of stitches from `from` to `to`, drawn as far as `p`, with a needle's tick at its tip. */
function drawSeam(
  ctx: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  p: number,
  { color, u }: { color: string; u: number },
) {
  if (p <= 0) return;
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const dx = (to.x - from.x) / length;
  const dy = (to.y - from.y) / length;
  const sewn = length * p;
  const stitch = 26 * u;
  const gap = 14 * u;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 4.5 * u;
  ctx.lineCap = "round";
  ctx.beginPath();
  for (let at = 0; at < sewn; at += stitch + gap) {
    const end = Math.min(sewn, at + stitch);
    ctx.moveTo(from.x + dx * at, from.y + dy * at);
    ctx.lineTo(from.x + dx * end, from.y + dy * end);
  }
  ctx.stroke();
  if (p < 1) {
    // The needle: a short tick across the seam where it is being sewn.
    const tipX = from.x + dx * sewn;
    const tipY = from.y + dy * sewn;
    ctx.lineWidth = 2 * u;
    ctx.beginPath();
    ctx.moveTo(tipX - dy * 12 * u, tipY + dx * 12 * u);
    ctx.lineTo(tipX + dy * 12 * u, tipY - dx * 12 * u);
    ctx.stroke();
  }
  ctx.restore();
}

function render(ctx: CanvasRenderingContext2D, t: number, scene: SceneData) {
  const { width: W, height: H, brand, lang } = scene;
  const { palette } = brand;
  const u = W / 1080;
  const layout = LAYOUT[scene.format];
  const rtl = lang === "ar";
  const margin = 80 * u;
  const startX = rtl ? W - margin : margin;
  const align = rtl ? "right" : "left";
  const beats = scene.making?.beats ?? FALLBACK[lang];

  ctx.fillStyle = palette.ground;
  ctx.fillRect(0, 0, W, H);

  // The photo: full bleed across the top, or the far side of a square.
  const photo: Box = layout.side
    ? { x: rtl ? 0 : W * (1 - layout.photo), y: 0, w: W * layout.photo, h: H }
    : { x: 0, y: 0, w: W, h: H * layout.photo };
  const { index, since } = chapterAt(t);
  const frame = framing(index, since, scene);
  ctx.save();
  ctx.globalAlpha = presence(t, { start: 0, end: DURATION, enter: 0.5 });
  clipTo(ctx, photo);
  if (frame.source) {
    drawCover(ctx, frame.source, photo, {
      zoom: frame.zoom,
      focusX: frame.focusX,
      focusY: frame.focusY,
    });
    if (!layout.side) drawShade(ctx, W, H, { height: 0.14, alpha: 0.32 }, { from: 1, alpha: 0 });
  } else {
    ctx.fillStyle = withAlpha(palette.ink, 0.08);
    ctx.fillRect(photo.x, photo.y, photo.w, photo.h);
  }
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = presence(t, { start: 0.1, end: DURATION });
  drawBrandMark(ctx, brand, {
    x: startX,
    y: (layout.side ? 0.075 : 0.055) * H,
    u,
    align,
    onPhoto: !layout.side && Boolean(frame.source),
    ink: palette.ink,
  });
  ctx.restore();

  // The seam: sewn along the photo's edge as the chapters go by.
  const sewn = seamSewn(t);
  if (layout.side) {
    const x = rtl ? photo.x + photo.w + 26 * u : photo.x - 26 * u;
    drawSeam(ctx, { x, y: 0.06 * H }, { x, y: 0.94 * H }, sewn, { color: palette.accent, u });
  } else {
    const y = photo.y + photo.h + 26 * u;
    const from = { x: rtl ? W - margin : margin, y };
    const to = { x: rtl ? margin : W - margin, y };
    drawSeam(ctx, from, to, sewn, { color: palette.accent, u });
  }

  // The chapter's words: its number, its title rising in, its line.
  const textTop = layout.side ? 0.28 * H : photo.y + photo.h + layout.textGap * H + 26 * u;
  const textW = layout.side ? W - photo.w - 2 * margin - 40 * u : W - 2 * margin;
  const beat = beats[index] ?? beats[beats.length - 1];
  const start = CHAPTERS[index];
  const end = CHAPTERS[index + 1] ?? DURATION + MOTION_EXIT;
  const present = presence(t, { start, end: end - 0.05, enter: 0.01, exit: 0.3 });

  ctx.save();
  ctx.globalAlpha = present * progress(t, start + 0.05, 0.4, ease.outCubic);
  ctx.fillStyle = palette.accent;
  ctx.font = font(layout.number * u, displayFont("en", brand.displayFamilies), 600);
  ctx.direction = "ltr";
  ctx.textAlign = align;
  ctx.textBaseline = "top";
  const numberLift = (1 - progress(t, start + 0.05, 0.6, ease.outExpo)) * 30 * u;
  ctx.fillText(String(index + 1).padStart(2, "0"), startX, textTop + numberLift);
  ctx.restore();

  const titleDir = textDirection(beat.title);
  const family = displayFont(titleDir === "rtl" ? "ar" : "en", brand.displayFamilies);
  const titleFit = fitText(
    beat.title,
    { maxWidth: textW, maxLines: 2, min: 48 * u, max: layout.title * u },
    (size) => {
      ctx.font = font(size, family, 600);
      return (text) => ctx.measureText(text).width;
    },
  );
  const titleLineH = titleFit.size * (titleDir === "rtl" ? 1.25 : 1.04);
  const titleY = textTop + layout.number * 1.12 * u;
  ctx.font = font(titleFit.size, family, 600);
  const titleWords = layoutWords(titleFit.lines, (text) => ctx.measureText(text).width, {
    x: startX,
    y: titleY,
    lineHeight: titleLineH,
    dir: titleDir,
  });
  ctx.save();
  ctx.globalAlpha = present;
  ctx.fillStyle = palette.ink;
  ctx.font = font(titleFit.size, family, 600);
  drawRisingWords(ctx, titleWords, {
    size: titleFit.size,
    lineHeight: titleLineH,
    reveal: (word) => progress(t, start + 0.15 + word.order * 0.09, 0.7, ease.outExpo),
  });
  ctx.restore();

  if (beat.line) {
    const lineDir = textDirection(beat.line);
    const lineFit = fitText(
      beat.line,
      { maxWidth: textW, maxLines: 2, min: 28 * u, max: 42 * u },
      (size) => {
        ctx.font = font(size, STUDIO_FONTS.body, 400);
        return (text) => ctx.measureText(text).width;
      },
    );
    const lineY = titleY + titleFit.lines.length * titleLineH + 22 * u;
    ctx.save();
    ctx.globalAlpha = present * progress(t, start + 0.45, 0.5, ease.outCubic) * 0.82;
    ctx.fillStyle = palette.ink;
    ctx.font = font(lineFit.size, STUDIO_FONTS.body, 400);
    ctx.direction = lineDir;
    ctx.textAlign = align;
    ctx.textBaseline = "top";
    lineFit.lines.forEach((line, i) => ctx.fillText(line, startX, lineY + i * lineFit.size * 1.45));
    ctx.restore();
  }

  if (layout.footerY !== null) {
    const footer = [brand.handle, brand.contact].filter(Boolean).join("   ·   ");
    if (footer) {
      ctx.save();
      ctx.globalAlpha = presence(t, { start: 1, end: DURATION }) * 0.7;
      ctx.fillStyle = palette.ink;
      ctx.font = font(26 * u, STUDIO_FONTS.body, 400);
      ctx.direction = "ltr";
      ctx.textAlign = align;
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

/** A made-to-order piece in three chapters, a seam sewn across the frame as they pass. */
export const madeForYou: StudioTemplate = {
  id: "made-for-you",
  name: { en: "Made for You", ar: "صُنعت لك" },
  goal: { en: "Made to order", ar: "حسب الطلب" },
  duration: DURATION,
  posterTime: 7.6,
  render,
};
