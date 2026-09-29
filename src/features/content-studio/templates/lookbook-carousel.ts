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

const DURATION = 12;
const INTRO = 0.6;
const OUTRO = 0.8;
/** How long one slide takes to glide to the next. */
const GLIDE = 0.8;

/**
 * Fractions of the height, and the card's shape (width over height): portrait,
 * so a garment is seen whole, with the neighbouring cards peeking in from the
 * sides. Stories keep clear of Instagram's own bars at the top and bottom.
 */
const LAYOUT: Record<
  FormatKey,
  {
    barsY: number;
    topRowY: number;
    cardY: number;
    cardH: number;
    aspect: number;
    nameLines: number;
    footerY: number | null;
  }
> = {
  story: {
    barsY: 0.085,
    topRowY: 0.115,
    cardY: 0.145,
    cardH: 0.515,
    aspect: 0.75,
    nameLines: 2,
    footerY: null,
  },
  portrait: {
    barsY: 0.04,
    topRowY: 0.08,
    cardY: 0.115,
    cardH: 0.5,
    aspect: 0.78,
    nameLines: 2,
    footerY: 0.955,
  },
  square: {
    barsY: 0.045,
    topRowY: 0.09,
    cardY: 0.135,
    cardH: 0.465,
    aspect: 0.8,
    nameLines: 1,
    footerY: 0.95,
  },
};

/** Height (fraction of H) the card gives up when the post has body copy. */
const BODY_ROOM: Record<FormatKey, number> = { story: 0.05, portrait: 0.06, square: 0.05 };

type Slide = NonNullable<SceneData["collection"]>[number];

/** The slides: the lookbook's products, or the chosen product on its own. */
function slidesOf(scene: SceneData): Slide[] {
  if (scene.collection && scene.collection.length > 0) return scene.collection;
  return [{ name: scene.productName, price: scene.price, media: scene.media }];
}

/** When each slide arrives, and how long it stays. */
function timing(count: number) {
  const segment = (DURATION - INTRO - OUTRO) / count;
  return { segment, startOf: (index: number) => INTRO + index * segment };
}

const counter = (index: number, count: number) =>
  `${String(index + 1).padStart(2, "0")} / ${String(count).padStart(2, "0")}`;

function render(ctx: CanvasRenderingContext2D, t: number, scene: SceneData) {
  const { width: W, height: H, brand, lang } = scene;
  const { palette } = brand;
  const u = W / 1080;
  const layout = LAYOUT[scene.format];
  const rtl = lang === "ar";
  const margin = 80 * u;
  const slides = slidesOf(scene);
  const n = slides.length;
  const { segment, startOf } = timing(n);
  const current = Math.min(n - 1, Math.max(0, Math.floor((t - INTRO) / segment)));
  const glide = current > 0 ? progress(t, startOf(current), GLIDE, ease.inOutCubic) : 1;
  // The track's position in slides: 1.5 is halfway from the second to the third.
  const position = current > 0 ? current - 1 + glide : 0;
  const whole = presence(t, { start: 0.05, end: DURATION });

  ctx.fillStyle = palette.ground;
  ctx.fillRect(0, 0, W, H);

  // Story-style progress bars, one per product, filling as each is shown.
  if (n > 1) {
    const gap = 8 * u;
    const barW = (W - 2 * margin - gap * (n - 1)) / n;
    const barH = 4 * u;
    ctx.save();
    ctx.globalAlpha = whole;
    for (let index = 0; index < n; index++) {
      const order = rtl ? n - 1 - index : index;
      const bar: Box = {
        x: margin + order * (barW + gap),
        y: layout.barsY * H,
        w: barW,
        h: barH,
      };
      roundedRect(ctx, bar, barH / 2);
      ctx.fillStyle = withAlpha(palette.ink, 0.16);
      ctx.fill();
      const filled = progress(t, startOf(index), segment);
      if (filled > 0) {
        const w = bar.w * filled;
        roundedRect(ctx, { ...bar, x: rtl ? bar.x + bar.w - w : bar.x, w }, barH / 2);
        ctx.fillStyle = palette.ink;
        ctx.fill();
      }
    }
    ctx.restore();
  }

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
  const topHandle = layout.footerY === null ? brand.handle || brand.contact : null;
  if (topHandle) {
    ctx.fillStyle = palette.ink;
    ctx.textBaseline = "middle";
    ctx.font = font(26 * u, STUDIO_FONTS.body, 400);
    ctx.direction = "ltr";
    ctx.textAlign = rtl ? "left" : "right";
    ctx.fillText(topHandle, rtl ? margin : W - margin, layout.topRowY * H);
  }
  ctx.restore();

  // The track: each product's card, gliding to the next with its neighbours peeking in.
  const body = scene.body.trim();
  const cardH = (layout.cardH - (body ? BODY_ROOM[scene.format] : 0)) * H;
  const cardW = Math.min(W - 200 * u, cardH * layout.aspect);
  const cardIn = progress(t, 0.1, 0.9, ease.outExpo);
  const cardY = layout.cardY * H + (1 - cardIn) * 40 * u;
  const step = (cardW + 28 * u) * (rtl ? -1 : 1);
  slides.forEach((slide, index) => {
    const offset = index - position;
    if (Math.abs(offset) > 1.6) return;
    const away = Math.min(1, Math.abs(offset));
    const box: Box = { x: W / 2 - cardW / 2 + offset * step, y: cardY, w: cardW, h: cardH };
    const scale = 1 - 0.06 * away;
    ctx.save();
    ctx.globalAlpha = whole * mix(1, 0.45, away) * mix(0.6, 1, cardIn);
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.translate(-cx, -cy);
    roundedRect(ctx, box, 16 * u);
    ctx.fillStyle = withAlpha(palette.ink, 0.06);
    ctx.fill();
    ctx.clip();
    if (slide.media) {
      // A slow push-in while the slide is on screen.
      const within = progress(t, startOf(index) - 0.4, segment + GLIDE, ease.outCubic);
      // Framed a little above centre: a garment's neckline and shoulders matter most.
      drawCover(ctx, slide.media, box, { zoom: mix(1.08, 1, within), focusY: 0.4 });
    }
    if (n > 1) {
      // The slide's number, as a chip in the card's leading corner.
      ctx.font = font(22 * u, STUDIO_FONTS.body, 500);
      const label = counter(index, n);
      const chip: Box = {
        x: 0,
        y: box.y + 24 * u,
        w: ctx.measureText(label).width + 32 * u,
        h: 44 * u,
      };
      chip.x = rtl ? box.x + box.w - 24 * u - chip.w : box.x + 24 * u;
      roundedRect(ctx, chip, chip.h / 2);
      ctx.fillStyle = withAlpha(palette.ground, 0.88);
      ctx.fill();
      ctx.fillStyle = palette.ink;
      ctx.direction = "ltr";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, chip.x + chip.w / 2, chip.y + chip.h / 2 + u);
    }
    ctx.restore();
  });

  // The eyebrow (the headline) stays; each product's name and price take turns.
  const below = layout.cardY * H + cardH + 0.028 * H;
  const eyebrow = scene.headline.trim().slice(0, 48);
  if (eyebrow) {
    ctx.save();
    ctx.globalAlpha = presence(t, { start: 0.5, end: DURATION });
    ctx.fillStyle = palette.accent;
    ctx.font = font(28 * u, STUDIO_FONTS.body, 500);
    ctx.direction = textDirection(eyebrow);
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(textDirection(eyebrow) === "rtl" ? eyebrow : eyebrow.toUpperCase(), W / 2, below);
    ctx.restore();
  }

  const nameY = below + (eyebrow ? 52 * u : 0);
  const fits = slides.map((slide) => {
    const dir = textDirection(slide.name);
    const family = displayFont(dir === "rtl" ? "ar" : "en", scene.brand.displayFamilies);
    const style = dir === "rtl" ? "normal" : "italic";
    const fit = fitText(
      slide.name,
      { maxWidth: W - 2 * margin, maxLines: layout.nameLines, min: 44 * u, max: 76 * u },
      (size) => {
        ctx.font = font(size, family, 600, style);
        return (text) => ctx.measureText(text).width;
      },
    );
    return { dir, family, style, ...fit, lines: fit.lines.slice(0, layout.nameLines) } as const;
  });
  const bodyFit = body
    ? fitText(body, { maxWidth: W - 2 * margin, maxLines: 2, min: 22 * u, max: 27 * u }, (size) => {
        ctx.font = font(size, STUDIO_FONTS.body, 400);
        return (text) => ctx.measureText(text).width;
      })
    : null;

  slides.forEach((slide, index) => {
    const alpha = presence(t, {
      start: startOf(index) + (index === 0 ? 0.3 : 0.35),
      end: index === n - 1 ? DURATION : startOf(index + 1) + 0.25,
      enter: 0.6,
      exit: 0.3,
    });
    if (alpha <= 0) return;
    const fit = fits[index];
    const rise = (1 - alpha) * 24 * u;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = palette.ink;
    ctx.font = font(fit.size, fit.family, 600, fit.style);
    ctx.direction = fit.dir;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    fit.lines.forEach((line, lineIndex) => {
      ctx.fillText(line, W / 2, nameY + rise + lineIndex * fit.size * 1.12);
    });
    let y = nameY + rise + fit.lines.length * fit.size * 1.12;
    if (slide.price) {
      ctx.globalAlpha = alpha * 0.9;
      ctx.font = font(34 * u, STUDIO_FONTS.body, 500);
      ctx.direction = textDirection(slide.price);
      ctx.fillText(slide.price, W / 2, y + 14 * u);
      y += 14 * u + 34 * u;
    }
    // The body copy follows each product's name and price, so it sits close under them.
    if (bodyFit) {
      ctx.globalAlpha = alpha * 0.75;
      ctx.font = font(bodyFit.size, STUDIO_FONTS.body, 400);
      ctx.direction = textDirection(body);
      bodyFit.lines.slice(0, 2).forEach((line, lineIndex) => {
        ctx.fillText(line, W / 2, y + 30 * u + lineIndex * bodyFit.size * 1.45);
      });
    }
    ctx.restore();
  });

  if (layout.footerY !== null) {
    const footer = [brand.handle, brand.contact].filter(Boolean).join("   ·   ");
    if (footer) {
      ctx.save();
      ctx.globalAlpha = presence(t, { start: 1.4, end: DURATION }) * 0.75;
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

/**
 * Each slide's settled frame, for the carousel export: just before the next
 * slide starts to glide in (and before the last one fades out).
 */
function slideTimes(scene: SceneData) {
  const count = slidesOf(scene).length;
  const { startOf } = timing(count);
  return Array.from({ length: count }, (_, index) => startOf(index + 1) - 0.05);
}

/** A collection: three to five products glide past, one card each. */
export const lookbookCarousel: StudioTemplate = {
  id: "lookbook-carousel",
  name: { en: "Lookbook", ar: "لوك بوك" },
  goal: { en: "A collection", ar: "تشكيلة منتجات" },
  duration: DURATION,
  render,
  slideTimes,
};
