import {
  drawCover,
  drawShade,
  font,
  roundedRect,
  type Box,
} from "@/features/content-studio/engine/draw";
import { drawBrandMark } from "@/features/content-studio/engine/brand-mark";
import { displayFont, STUDIO_FONTS } from "@/features/content-studio/engine/fonts";
import type { Drawable, SceneData, StudioTemplate } from "@/features/content-studio/engine/scene";
import { fitText, textDirection } from "@/features/content-studio/engine/text-layout";
import { ease, mix, presence, progress } from "@/features/content-studio/engine/timeline";
import {
  clipTo,
  cutPunch,
  drawGrain,
  drawRisingWords,
  layoutWords,
  shotAt,
  shotDrift,
  splitBoxes,
  wipeBox,
} from "@/features/content-studio/engine/motion";

const DURATION = 8;
/** The hook (the headline on the ground) hands over to the first shot here. */
const CUTS_START = 1.05;
/** The cuts end and the frame splits into the end card. */
const CUTS_END = 6.2;
const MAX_SHOTS = 4;

/** One shot of the cut: a photo and how it is framed. */
export type ReelShot = { media: Drawable; zoom: number; focusX: number; focusY: number };

/**
 * Details of one photo to cut between when a product has no other photos:
 * the whole piece, the neckline, the middle and the hem.
 */
const DETAILS = [
  { zoom: 1, focusX: 0.5, focusY: 0.4 },
  { zoom: 1.9, focusX: 0.5, focusY: 0.22 },
  { zoom: 1.7, focusX: 0.45, focusY: 0.55 },
  { zoom: 1.8, focusX: 0.55, focusY: 0.85 },
];

/**
 * The shots of the cut: the product's photos (up to four), or, with one
 * photo (or a video), four details of it. None without media.
 */
export function reelShots(scene: Pick<SceneData, "media" | "shots">): ReelShot[] {
  const photos = (scene.shots ?? []).filter(Boolean).slice(0, MAX_SHOTS);
  if (photos.length >= 2) {
    return photos.map((media) => ({ media, zoom: 1, focusX: 0.5, focusY: 0.4 }));
  }
  const media = photos[0] ?? scene.media;
  return media ? DETAILS.map((detail) => ({ media, ...detail })) : [];
}

/** Where the end card splits the frame: the photo keeps this much of the height. */
const END_PHOTO = { story: 0.6, portrait: 0.56, square: 0.5 } as const;

function render(ctx: CanvasRenderingContext2D, t: number, scene: SceneData) {
  const { width: W, height: H, brand, lang } = scene;
  const { palette } = brand;
  const u = W / 1080;
  const rtl = lang === "ar";
  const story = scene.format === "story";
  const margin = 80 * u;
  const startX = rtl ? W - margin : margin;
  const topY = (story ? 0.11 : 0.06) * H;
  const shots = reelShots(scene);
  const count = Math.max(1, shots.length);
  const length = (CUTS_END - CUTS_START) / count;
  const frame: Box = { x: 0, y: 0, w: W, h: H };

  ctx.fillStyle = palette.ground;
  ctx.fillRect(0, 0, W, H);

  // The hook: the headline, word by word, on the store's ground.
  const headline = scene.headline.trim() || scene.productName;
  const headDir = textDirection(headline);
  const family = displayFont(headDir === "rtl" ? "ar" : "en", brand.displayFamilies);
  const fit = fitText(
    headline,
    { maxWidth: W - 2 * margin, maxLines: 3, min: 72 * u, max: (story ? 150 : 124) * u },
    (size) => {
      ctx.font = font(size, family, 600);
      return (text) => ctx.measureText(text).width;
    },
  );
  const lineHeight = fit.size * 1.06;
  if (t < CUTS_START + 0.35) {
    ctx.save();
    ctx.globalAlpha = presence(t, { start: 0, end: DURATION, enter: 0.3 });
    drawBrandMark(ctx, brand, {
      x: startX,
      y: topY,
      u,
      align: rtl ? "right" : "left",
      onPhoto: false,
      ink: palette.ink,
    });
    ctx.restore();
    ctx.fillStyle = palette.ink;
    ctx.font = font(fit.size, family, 600);
    const words = layoutWords(fit.lines, (text) => ctx.measureText(text).width, {
      x: startX,
      y: H * 0.44 - (fit.lines.length * lineHeight) / 2,
      lineHeight,
      dir: rtl ? "rtl" : "ltr",
    });
    drawRisingWords(ctx, words, {
      size: fit.size,
      lineHeight,
      reveal: (word) => progress(t, 0.12 + word.order * 0.07, 0.5, ease.outExpo),
    });
  }

  // The cuts: the first shot wipes up over the hook, the rest cut in on the beat.
  const split = progress(t, CUTS_END, 0.6, ease.inOutCubic);
  const { first: photoBox, second: card } = splitBoxes(frame, split, {
    ratio: END_PHOTO[scene.format],
  });
  const timing = shotAt(t, { start: CUTS_START, length, count });
  if (timing) {
    const cover = wipeBox(photoBox, progress(t, CUTS_START, 0.4, ease.inOutCubic), "bottom", rtl);
    ctx.save();
    clipTo(ctx, cover);
    const shot = shots[timing.index];
    if (shot) {
      const drift = shotDrift(
        timing.index,
        progress(t, CUTS_START + timing.index * length, length + 0.6),
      );
      const punch = timing.index > 0 ? cutPunch(timing.sinceCut) : 1;
      drawCover(ctx, shot.media, photoBox, {
        zoom: shot.zoom * drift.zoom * punch,
        focusX: shot.focusX + (drift.focusX - 0.5),
        focusY: shot.focusY,
      });
    } else {
      const fill = ctx.createLinearGradient(0, 0, W, photoBox.h);
      fill.addColorStop(0, palette.accent);
      fill.addColorStop(1, palette.ground);
      ctx.fillStyle = fill;
      ctx.fillRect(photoBox.x, photoBox.y, photoBox.w, photoBox.h);
    }
    // White type reads on any photo: shade the top under the wordmark.
    drawShade(ctx, W, H, { height: 0.2, alpha: 0.38 }, { from: 0.72, alpha: 0.3 });
    ctx.restore();

    const onCuts = presence(t, { start: CUTS_START + 0.25, end: CUTS_END + 0.3, enter: 0.4 });
    if (onCuts > 0) {
      ctx.save();
      ctx.globalAlpha = onCuts;
      drawBrandMark(ctx, brand, {
        x: startX,
        y: topY,
        u,
        align: rtl ? "right" : "left",
        onPhoto: true,
        ink: palette.ink,
      });
      ctx.restore();
      drawNameTag(ctx, t, scene, { u, rtl, startX, y: photoBox.h * (story ? 0.74 : 0.78) });
    }
    if (timing.index === count - 1 && scene.priceAmount) {
      drawSticker(ctx, t, scene, {
        u,
        cx: rtl ? margin + 120 * u : W - margin - 120 * u,
        cy: photoBox.h * (story ? 0.6 : 0.56),
        start: CUTS_START + (count - 1) * length + 0.2,
      });
    }
  }

  // The end card: the frame splits, the brand rises into the lower part.
  if (split > 0) {
    ctx.fillStyle = palette.ground;
    ctx.fillRect(card.x, card.y, card.w, card.h);
    drawEndCard(ctx, t, scene, { card, u });
  }

  drawGrain(ctx, W, H, t, 0.045);

  // Fade to the ground before the loop starts again on it.
  const fade = progress(t, DURATION - 0.4, 0.4, ease.inCubic);
  if (fade > 0) {
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.fillStyle = palette.ground;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
}

/** The product's name on a tag in the store's colours, wiping in from the reading start. */
function drawNameTag(
  ctx: CanvasRenderingContext2D,
  t: number,
  scene: SceneData,
  { u, rtl, startX, y }: { u: number; rtl: boolean; startX: number; y: number },
) {
  const { palette } = scene.brand;
  const name = scene.productName.trim();
  if (!name) return;
  const size = 46 * u;
  ctx.save();
  ctx.font = font(size, STUDIO_FONTS.body, 600);
  const maxW = scene.width - 160 * u;
  const fitName = fitText(
    name,
    { maxWidth: maxW - 56 * u, maxLines: 1, min: 26 * u, max: size },
    (s) => {
      ctx.font = font(s, STUDIO_FONTS.body, 600);
      return (text) => ctx.measureText(text).width;
    },
  );
  ctx.font = font(fitName.size, STUDIO_FONTS.body, 600);
  const text = fitName.lines[0] ?? name;
  const tag: Box = { x: 0, y, w: ctx.measureText(text).width + 56 * u, h: fitName.size * 1.9 };
  tag.x = rtl ? startX - tag.w : startX;
  const shown = wipeBox(tag, progress(t, CUTS_START + 0.35, 0.5, ease.outExpo), "start", rtl);
  if (shown.w > 0) {
    clipTo(ctx, shown);
    roundedRect(ctx, tag, 8 * u);
    ctx.fillStyle = palette.ground;
    ctx.fill();
    ctx.fillStyle = palette.ink;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.direction = textDirection(text);
    ctx.fillText(text, tag.x + 28 * u, tag.y + tag.h / 2 + u);
  }
  ctx.restore();
}

/** The price stamped in on a round sticker: the amount large, the currency under it. */
function drawSticker(
  ctx: CanvasRenderingContext2D,
  t: number,
  scene: SceneData,
  { u, cx, cy, start }: { u: number; cx: number; cy: number; start: number },
) {
  const { palette } = scene.brand;
  const stamp = progress(t, start, 0.55, ease.outBack);
  if (stamp <= 0 || !scene.priceAmount) return;
  const r = 112 * u;
  ctx.save();
  ctx.globalAlpha = presence(t, { start, end: CUTS_END + 0.2, enter: 0.2, exit: 0.3 });
  ctx.translate(cx, cy);
  ctx.rotate(mix(-0.5, -0.12, stamp));
  ctx.scale(stamp, stamp);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = palette.ink;
  ctx.fill();
  ctx.fillStyle = palette.ground;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.direction = "ltr";
  const amountFit = fitText(
    scene.priceAmount,
    { maxWidth: r * 1.6, maxLines: 1, min: 30 * u, max: 64 * u },
    (s) => {
      ctx.font = font(s, STUDIO_FONTS.body, 600);
      return (text) => ctx.measureText(text).width;
    },
  );
  ctx.font = font(amountFit.size, STUDIO_FONTS.body, 600);
  ctx.fillText(scene.priceAmount, 0, -8 * u);
  ctx.font = font(26 * u, STUDIO_FONTS.body, 500);
  ctx.direction = textDirection(scene.currencyLabel);
  ctx.fillText(scene.currencyLabel, 0, amountFit.size * 0.62);
  if (scene.discountPercent) {
    ctx.font = font(24 * u, STUDIO_FONTS.body, 600);
    ctx.direction = "ltr";
    ctx.fillText(`-${scene.discountPercent}%`, 0, -amountFit.size * 0.85);
  }
  ctx.restore();
}

/** The end card under the photo: the mark, the name, the price and where to find the store. */
function drawEndCard(
  ctx: CanvasRenderingContext2D,
  t: number,
  scene: SceneData,
  { card, u }: { card: Box; u: number },
) {
  const { brand } = scene;
  const { palette } = brand;
  const W = scene.width;
  const at = (start: number) => presence(t, { start: CUTS_END + start, end: DURATION, enter: 0.5 });
  const cx = W / 2;
  let y = card.y + card.h * 0.17;

  ctx.save();
  ctx.globalAlpha = at(0.25);
  drawBrandMark(ctx, brand, {
    x: cx,
    y,
    u,
    align: "center",
    onPhoto: false,
    ink: palette.ink,
    maxWidth: 520,
  });
  ctx.restore();

  const name = scene.productName.trim();
  y += 78 * u;
  if (name) {
    const family = displayFont(textDirection(name) === "rtl" ? "ar" : "en", brand.displayFamilies);
    const fitName = fitText(
      name,
      { maxWidth: W - 200 * u, maxLines: 1, min: 44 * u, max: 88 * u },
      (s) => {
        ctx.font = font(s, family, 600);
        return (text) => ctx.measureText(text).width;
      },
    );
    const p = at(0.4);
    ctx.save();
    ctx.globalAlpha = p;
    ctx.fillStyle = palette.ink;
    ctx.font = font(fitName.size, family, 600);
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.direction = textDirection(name);
    ctx.fillText(fitName.lines[0] ?? name, cx, y + (1 - p) * 24 * u);
    ctx.restore();
    y += fitName.size * 1.35;
  }

  if (scene.price) {
    ctx.save();
    ctx.globalAlpha = at(0.55) * 0.9;
    ctx.fillStyle = palette.ink;
    ctx.font = font(42 * u, STUDIO_FONTS.body, 500);
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    // An Arabic price ("30.000 د.ب.") reads right to left: number first, then the currency.
    ctx.direction = textDirection(scene.price);
    ctx.fillText(scene.price, cx, y);
    ctx.restore();
    y += 74 * u;
  }

  const handle = brand.handle || brand.contact;
  if (handle) {
    ctx.save();
    ctx.globalAlpha = at(0.7) * 0.75;
    ctx.fillStyle = palette.ink;
    ctx.font = font(28 * u, STUDIO_FONTS.body, 400);
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.direction = "ltr";
    ctx.fillText(handle, cx, Math.min(y + 10 * u, card.y + card.h * 0.82));
    ctx.restore();
  }
}

/** Reels: a headline hook, fast cuts through the product's photos, and an end card. */
export const reelCut: StudioTemplate = {
  id: "reel-cut",
  name: { en: "Reel Cut", ar: "ريل سريع" },
  goal: { en: "Reels & stories", ar: "ريلز وستوري" },
  duration: DURATION,
  posterTime: 5.6,
  render,
};
