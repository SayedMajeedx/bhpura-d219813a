import {
  drawLines,
  font,
  roundedRect,
  withAlpha,
  type Box,
} from "@/features/content-studio/engine/draw";
import { drawBrandMark } from "@/features/content-studio/engine/brand-mark";
import { displayFont, STUDIO_FONTS } from "@/features/content-studio/engine/fonts";
import {
  arcPoints,
  archRise,
  burst,
  crescent,
  eightPointStar,
  flower,
  lantern,
  mortarboard,
  openBook,
  pencil,
  pointedArch,
  priceTag,
  star,
  stem,
  traceLines,
  waves,
  type Polyline,
} from "@/features/content-studio/engine/line-art";
import type { FormatKey, SceneData, StudioTemplate } from "@/features/content-studio/engine/scene";
import { fitText, textDirection } from "@/features/content-studio/engine/text-layout";
import { ease, mix, presence, progress, stagger } from "@/features/content-studio/engine/timeline";
import type { OccasionId } from "@/features/content-studio/lib/occasions";

const DURATION = 7;
/** Each arc's radius as a share of the arch's width: a gently pointed arch. */
const SHARPNESS = 0.6;

/**
 * The arch's width (share of W), where it springs and where it stands
 * (shares of H), and the greeting's largest size. Stories keep the foot clear
 * for Instagram's reply bar; posts close with a footer under the arch.
 */
const LAYOUT: Record<
  FormatKey,
  { archW: number; springY: number; bottom: number; greetingMax: number; footerY: number }
> = {
  story: { archW: 0.74, springY: 0.4, bottom: 0.8, greetingMax: 120, footerY: 0.84 },
  portrait: { archW: 0.68, springY: 0.43, bottom: 0.88, greetingMax: 104, footerY: 0.945 },
  square: { archW: 0.64, springY: 0.44, bottom: 0.875, greetingMax: 84, footerY: 0.94 },
};

type Art = { lines: Polyline[]; sparkles: Array<[number, number, number]> };

/**
 * Each occasion's line art: the motif in the arch's point, and the pieces
 * outside it (lanterns, fireworks, flowers). `c` is the motif's centre, `r`
 * its size; the arch spans `left` to `right`.
 */
function artFor(
  id: OccasionId,
  {
    cx,
    cy,
    r,
    left,
    right,
    W,
    H,
    u,
  }: {
    cx: number;
    cy: number;
    r: number;
    left: number;
    right: number;
    W: number;
    H: number;
    u: number;
  },
  rtl: boolean,
): Art {
  // The middles of the margins either side of the arch.
  const outerL = left / 2;
  const edgeR = right + (W - right) / 2;
  const sparkles: Art["sparkles"] = [
    [outerL, H * 0.5, 14 * u],
    [edgeR, H * 0.42, 12 * u],
    [cx - r * 1.9, cy + r * 0.2, 10 * u],
    [cx + r * 1.8, cy - r * 0.5, 12 * u],
  ];
  // The crescent opens towards the reading direction's end, its stars beside it.
  const side = rtl ? -1 : 1;
  switch (id) {
    case "ramadan":
      return {
        lines: [
          ...crescent(cx - side * r * 0.1, cy, r, rtl),
          star(cx + side * r * 0.5, cy - r * 0.08, r * 0.2, 5),
          ...lantern(outerL, 0, H * 0.1, 170 * u),
          ...lantern(edgeR, 0, H * 0.17, 140 * u),
        ],
        sparkles,
      };
    case "eid-al-fitr":
      return {
        lines: [
          ...crescent(cx - side * r * 0.3, cy, r * 0.9, rtl),
          star(cx + side * r * 0.45, cy - r * 0.25, r * 0.24, 5),
          star(cx + side * r * 0.95, cy + r * 0.3, r * 0.15, 5),
          star(cx + side * r * 0.85, cy - r * 0.85, r * 0.11, 5),
        ],
        sparkles: [...sparkles, [outerL, H * 0.22, 16 * u], [edgeR, H * 0.66, 14 * u]],
      };
    case "eid-al-adha":
      return {
        lines: eightPointStar(cx, cy, r),
        sparkles: [...sparkles, [outerL, H * 0.24, 16 * u], [edgeR, H * 0.68, 14 * u]],
      };
    case "national-day":
      return {
        lines: [
          ...burst(cx, cy, r, 14),
          ...burst(outerL, H * 0.25, 60 * u, 10),
          ...burst(edgeR, H * 0.55, 50 * u, 10),
          star(cx, cy, r * 0.22, 5),
        ],
        sparkles,
      };
    case "mothers-day":
      return {
        lines: [
          ...stem(cx, cy + r * 0.62, r * 0.75, rtl),
          ...flower(cx, cy - r * 0.15, r * 0.85),
          ...flower(outerL, H * 0.62, 40 * u),
          ...flower(edgeR, H * 0.27, 34 * u),
        ],
        sparkles,
      };
    // The seasonal pack.
    case "white-friday":
      return {
        lines: [
          ...priceTag(cx, cy, r * 1.9, rtl ? 0.35 : -0.35, rtl),
          ...burst(cx + side * r * 1.05, cy - r * 0.7, r * 0.45, 10),
          ...priceTag(outerL, H * 0.3, 70 * u, 0.5),
          ...priceTag(edgeR, H * 0.6, 60 * u, -0.5),
        ],
        sparkles,
      };
    case "new-year":
      return {
        lines: [
          ...burst(cx, cy, r, 16),
          ...burst(cx - r * 0.95, cy + r * 0.45, r * 0.4, 10),
          ...burst(cx + r * 0.95, cy - r * 0.55, r * 0.35, 10),
          ...burst(outerL, H * 0.25, 55 * u, 10),
          ...burst(edgeR, H * 0.55, 45 * u, 10),
        ],
        sparkles,
      };
    case "back-to-school":
      return {
        lines: [
          ...openBook(cx, cy - r * 0.05, r * 2),
          ...pencil(cx + side * r * 0.35, cy - r * 0.55, r * 1.5, rtl ? 0.6 : -0.6),
          ...pencil(outerL, H * 0.3, 90 * u, 1.2),
        ],
        sparkles,
      };
    case "graduation":
      return {
        lines: [
          ...mortarboard(cx, cy - r * 0.2, r * 2.1),
          star(cx - side * r * 1.05, cy - r * 0.8, r * 0.18, 5),
          star(cx + side * r * 1.15, cy + r * 0.2, r * 0.13, 5),
          ...mortarboard(edgeR, H * 0.27, 70 * u),
        ],
        sparkles,
      };
    case "summer":
      return {
        lines: [
          ...burst(cx, cy - r * 0.2, r * 0.95, 14),
          arcPoints(cx, cy - r * 0.2, r * 0.3, 0, Math.PI * 2, 48),
          ...waves(cx - r * 1.2, cy + r * 0.85, r * 2.4, 2, r * 0.22),
        ],
        sparkles,
      };
  }
}

function render(ctx: CanvasRenderingContext2D, t: number, scene: SceneData) {
  const { width: W, height: H, brand, lang } = scene;
  const { palette } = brand;
  const u = W / 1080;
  const layout = LAYOUT[scene.format];
  const rtl = lang === "ar";
  const occasion = scene.occasion ?? {
    id: "eid-al-fitr" as const,
    eyebrow: "",
    greeting: scene.headline,
    message: scene.body,
    offer: "",
  };
  const whole = presence(t, { start: 0, end: DURATION, enter: 0.3 });

  const archW = layout.archW * W;
  const archX = (W - archW) / 2;
  const springY = layout.springY * H;
  const bottom = layout.bottom * H;
  const rise = archRise(archW, SHARPNESS);
  const motif = { cx: W / 2, cy: springY - rise * 0.4, r: rise * 0.3 };

  ctx.fillStyle = palette.ground;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.globalAlpha = whole;
  // A soft glow behind the motif, arriving with it.
  const glowR = rise * 0.9;
  const glow = ctx.createRadialGradient(motif.cx, motif.cy, 0, motif.cx, motif.cy, glowR);
  glow.addColorStop(0, withAlpha(palette.accent, 0.16 * progress(t, 0.5, 1.2, ease.outCubic)));
  glow.addColorStop(1, withAlpha(palette.accent, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(motif.cx - glowR, motif.cy - glowR, glowR * 2, glowR * 2);

  // The arch, a double line, drawing up one side and down the other.
  ctx.strokeStyle = palette.accent;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const inset = 18 * u;
  const arches = [
    pointedArch(archX, archW, springY, bottom, SHARPNESS),
    pointedArch(archX + inset, archW - 2 * inset, springY, bottom - inset, SHARPNESS),
  ];
  ctx.lineWidth = 3 * u;
  traceLines(ctx, arches.slice(0, 1), () => progress(t, 0.1, 1.6, ease.inOutCubic));
  ctx.lineWidth = 1.5 * u;
  traceLines(ctx, arches.slice(1), () => progress(t, 0.3, 1.6, ease.inOutCubic));

  // The occasion's line art, stroke by stroke.
  const art = artFor(occasion.id, { ...motif, left: archX, right: archX + archW, W, H, u }, rtl);
  ctx.lineWidth = 2.5 * u;
  traceLines(ctx, art.lines, (index) => progress(t, stagger(0.6, index, 0.1), 1.1, ease.outCubic));

  // Sparkles, twinkling once the art is drawn.
  ctx.fillStyle = palette.accent;
  art.sparkles.forEach(([x, y, size], index) => {
    const on = progress(t, stagger(1.4, index, 0.15), 0.5, ease.outBack);
    if (on <= 0) return;
    const twinkle = 0.65 + 0.35 * Math.sin(t * 3 + index * 1.7);
    ctx.save();
    ctx.globalAlpha = whole * twinkle;
    const line = star(x, y, size * on, 4, 0.28);
    ctx.beginPath();
    line.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
    ctx.fill();
    ctx.restore();
  });
  ctx.restore();

  // The words, centred in the arch: eyebrow, greeting, message and the offer.
  const maxWidth = archW - 2 * 70 * u;
  const greeting = occasion.greeting.trim() || scene.brand.name;
  const family = displayFont(textDirection(greeting) === "rtl" ? "ar" : "en");
  const message = occasion.message.trim();
  const messageFit = message
    ? fitText(message, { maxWidth, maxLines: 2, min: 24 * u, max: 32 * u }, (px) => {
        ctx.font = font(px, STUDIO_FONTS.body, 400);
        return (text) => ctx.measureText(text).width;
      })
    : null;
  const offer = occasion.offer.trim();
  const eyebrow = occasion.eyebrow.trim();

  const eyebrowH = eyebrow ? 26 * u + 22 * u : 0;
  const messageLines = messageFit ? messageFit.lines.slice(0, 2) : [];
  const messageH = messageFit ? 20 * u + messageLines.length * messageFit.size * 1.45 : 0;
  const offerH = offer ? 30 * u + 64 * u : 0;
  const logoRoom = 150 * u;
  const areaTop = springY + 0.01 * H;
  const areaBottom = bottom - logoRoom;
  // The greeting takes the room the rest leaves, so nothing reaches the logo.
  const greetingRoom = areaBottom - areaTop - eyebrowH - messageH - offerH;
  const fitGreeting = (max: number) =>
    fitText(greeting, { maxWidth, maxLines: 2, min: Math.min(max, 52 * u), max }, (px) => {
      ctx.font = font(px, family, 600);
      return (text) => ctx.measureText(text).width;
    });
  let greetingFit = fitGreeting(layout.greetingMax * u);
  while (
    greetingFit.lines.length * greetingFit.size * 1.1 > greetingRoom &&
    greetingFit.size > 40 * u
  ) {
    greetingFit = fitGreeting(greetingFit.size - 6 * u);
  }
  const greetingLine = greetingFit.size * 1.1;
  const greetingH = greetingFit.lines.length * greetingLine;
  const stackH = eyebrowH + greetingH + messageH + offerH;
  let y = areaTop + Math.max(0, (areaBottom - areaTop - stackH) / 2);

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  if (eyebrow) {
    const p = presence(t, { start: 1.5, end: DURATION });
    if (p > 0) {
      ctx.globalAlpha = p;
      ctx.fillStyle = palette.accent;
      ctx.font = font(26 * u, STUDIO_FONTS.body, 500);
      ctx.direction = textDirection(eyebrow);
      ctx.fillText(textDirection(eyebrow) === "rtl" ? eyebrow : eyebrow.toUpperCase(), W / 2, y);
    }
    y += eyebrowH;
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = palette.ink;
  ctx.font = font(greetingFit.size, family, 600);
  drawLines(ctx, greetingFit.lines, {
    x: W / 2,
    y,
    lineHeight: greetingLine,
    dir: textDirection(greeting),
    align: "center",
    reveal: (index) => {
      const p = presence(t, { start: stagger(1.8, index, 0.12), end: DURATION });
      return { alpha: p, dy: (1 - p) * greetingFit.size * 0.4 };
    },
  });
  y += greetingH;
  if (messageFit) {
    const p = presence(t, { start: 2.2, end: DURATION });
    if (p > 0) {
      ctx.globalAlpha = p * 0.8;
      ctx.font = font(messageFit.size, STUDIO_FONTS.body, 400);
      drawLines(ctx, messageLines, {
        x: W / 2,
        y: y + 20 * u + (1 - p) * 16 * u,
        lineHeight: messageFit.size * 1.45,
        dir: textDirection(message),
        align: "center",
      });
    }
    y += messageH;
  }
  if (offer) {
    const alpha = presence(t, { start: 2.6, end: DURATION, enter: 0.3 });
    if (alpha > 0) {
      const stamp = progress(t, 2.6, 0.55, ease.outBack);
      ctx.font = font(28 * u, STUDIO_FONTS.body, 500);
      const pill: Box = {
        x: 0,
        y: y + 30 * u,
        w: ctx.measureText(offer).width + 60 * u,
        h: 64 * u,
      };
      pill.x = W / 2 - pill.w / 2;
      const scale = mix(1.3, 1, stamp);
      ctx.globalAlpha = alpha;
      ctx.translate(W / 2, pill.y + pill.h / 2);
      ctx.scale(scale, scale);
      ctx.translate(-W / 2, -(pill.y + pill.h / 2));
      roundedRect(ctx, pill, pill.h / 2);
      ctx.fillStyle = withAlpha(palette.accent, 0.12);
      ctx.fill();
      ctx.lineWidth = 2 * u;
      ctx.strokeStyle = palette.accent;
      ctx.stroke();
      ctx.fillStyle = palette.ink;
      ctx.textBaseline = "middle";
      ctx.direction = textDirection(offer);
      ctx.fillText(offer, W / 2, pill.y + pill.h / 2 + u);
    }
  }
  ctx.restore();

  // The logo rises last, at the foot of the arch.
  const logoIn = presence(t, { start: 2.9, end: DURATION });
  if (logoIn > 0) {
    ctx.save();
    ctx.globalAlpha = logoIn;
    drawBrandMark(ctx, brand, {
      x: W / 2,
      y: bottom - 80 * u + (1 - logoIn) * 24 * u,
      u,
      align: "center",
      onPhoto: false,
      ink: palette.ink,
      height: 56,
      maxWidth: 480,
    });
    ctx.restore();
  }

  const footer = [brand.handle, brand.contact].filter(Boolean).join("   ·   ");
  const footerIn = presence(t, { start: 3.2, end: DURATION });
  if (footer && footerIn > 0) {
    ctx.save();
    ctx.globalAlpha = footerIn * 0.75;
    ctx.fillStyle = palette.ink;
    ctx.font = font(26 * u, STUDIO_FONTS.body, 400);
    ctx.direction = "ltr";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(footer, W / 2, layout.footerY * H);
    ctx.restore();
  }
}

/** Greetings for the GCC calendar: line art draws itself, then the greeting and logo rise. */
export const occasionPack: StudioTemplate = {
  id: "occasion-pack",
  name: { en: "Occasion Pack", ar: "باقة المناسبات" },
  goal: { en: "Eid, Ramadan & more", ar: "الأعياد والمناسبات" },
  duration: DURATION,
  render,
};
