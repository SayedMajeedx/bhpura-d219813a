import {
  drawCover,
  drawRuns,
  font,
  roundedRect,
  withAlpha,
  type Box,
  type TextRun,
} from "@/features/content-studio/engine/draw";
import { drawBrandMark } from "@/features/content-studio/engine/brand-mark";
import { displayFont, STUDIO_FONTS } from "@/features/content-studio/engine/fonts";
import type { FormatKey, SceneData, StudioTemplate } from "@/features/content-studio/engine/scene";
import { fitText, textDirection } from "@/features/content-studio/engine/text-layout";
import { ease, mix, presence, progress } from "@/features/content-studio/engine/timeline";
import { CONTENT_BOTTOM, photoHeight } from "@/features/content-studio/engine/safe-area";
import { drawRisingWords, layoutWords } from "@/features/content-studio/engine/motion";

const DURATION = 7;
/** Each card drops in this long after the one before. */
const CARD_STEP = 0.22;

/** Fractions of the height: the top row, where the cards start, the smallest they get, a post's footer. */
const LAYOUT: Record<
  FormatKey,
  { topY: number; cardsY: number; minCardsH: number; footerY: number | null }
> = {
  story: { topY: 0.11, cardsY: 0.16, minCardsH: 0.3, footerY: null },
  portrait: { topY: 0.05, cardsY: 0.1, minCardsH: 0.3, footerY: 0.94 },
  square: { topY: 0.055, cardsY: 0.105, minCardsH: 0.28, footerY: 0.935 },
};

/** The pieces of the set: the collection (two or three), or the product alone. */
function piecesOf(scene: SceneData) {
  const list = scene.collection && scene.collection.length > 0 ? scene.collection : null;
  return (list ?? [{ name: scene.productName, price: scene.price, media: scene.media }]).slice(
    0,
    3,
  );
}

/** One card of the set: where it sits, how far it is turned, and how near it is (higher in front). */
export type FanCard = Box & { tilt: number; z: number };

/**
 * The cards of a set of `count` in `area`, in reading order, each a 3:4 card,
 * and the pairs a "+" joins. Three are a trio: the first large in front, the
 * other two smaller behind it at either side (the reading start first). Two
 * (or one) sit in a row, overlapping a little, turned outward.
 */
export function fanCards(
  count: number,
  area: Box,
  u: number,
  rtl = false,
): { cards: FanCard[]; pairs: Array<[number, number]> } {
  const mirror = (card: FanCard): FanCard =>
    rtl ? { ...card, x: area.x + area.w - (card.x - area.x) - card.w, tilt: -card.tilt } : card;
  if (count === 3) {
    // A deep area (a story) gives the front card more of the width.
    const share = area.h > area.w * 0.85 ? 0.58 : 0.48;
    const w = Math.min(area.w * share, area.h * 0.75, 600 * u);
    const h = (w * 4) / 3;
    const hero: FanCard = {
      x: area.x + (area.w - w) / 2,
      y: area.y + (area.h - h) / 2,
      w,
      h,
      tilt: 0,
      z: 2,
    };
    const sw = w * 0.78;
    const sh = (sw * 4) / 3;
    const sy = hero.y + (h - sh) / 2 - 12 * u;
    const startSide: FanCard = {
      x: Math.max(area.x, hero.x - sw * 0.68),
      y: sy,
      w: sw,
      h: sh,
      tilt: -0.09,
      z: 1,
    };
    const endSide: FanCard = {
      x: Math.min(area.x + area.w - sw, hero.x + w - sw * 0.32),
      y: sy,
      w: sw,
      h: sh,
      tilt: 0.09,
      z: 1,
    };
    return {
      cards: [hero, startSide, endSide].map(mirror),
      pairs: [
        [0, 1],
        [0, 2],
      ],
    };
  }
  const overlap = count > 1 ? 0.12 : 0;
  const byWidth = area.w / (count - overlap * (count - 1));
  const w = Math.min(byWidth, (area.h * 3) / 4, 520 * u);
  const h = (w * 4) / 3;
  const total = w * count - w * overlap * (count - 1);
  const left = area.x + (area.w - total) / 2;
  const cards = Array.from({ length: count }, (_, index) => {
    const offset = count === 1 ? 0 : index / (count - 1) - 0.5;
    return mirror({
      x: left + index * w * (1 - overlap),
      y: area.y + (area.h - h) / 2 + Math.abs(offset) * 30 * u,
      w,
      h,
      tilt: offset * 0.14,
      z: index,
    });
  });
  const pairs = cards.slice(1).map((_, index) => [index, index + 1] as [number, number]);
  return { cards, pairs };
}

function render(ctx: CanvasRenderingContext2D, t: number, scene: SceneData) {
  const { width: W, height: H, brand, lang } = scene;
  const { palette } = brand;
  const u = W / 1080;
  const layout = LAYOUT[scene.format];
  const rtl = lang === "ar";
  const margin = 80 * u;
  const pieces = piecesOf(scene);

  ctx.fillStyle = palette.ground;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.globalAlpha = presence(t, { start: 0.05, end: DURATION });
  drawBrandMark(ctx, brand, {
    x: W / 2,
    y: layout.topY * H,
    u,
    align: "center",
    onPhoto: false,
    ink: palette.ink,
  });
  ctx.restore();

  // What goes under the cards is measured first: the cards take the height it leaves.
  const title = (scene.headline.trim() || scene.productName).trim();
  const titleDir = textDirection(title);
  const family = displayFont(titleDir === "rtl" ? "ar" : "en", brand.displayFamilies);
  const titleFit = fitText(
    title,
    { maxWidth: W - 2 * margin, maxLines: 2, min: 52 * u, max: 92 * u },
    (size) => {
      ctx.font = font(size, family, 600);
      return (text) => ctx.measureText(text).width;
    },
  );
  const titleLineH = titleFit.size * (titleDir === "rtl" ? 1.25 : 1.05);
  const body = scene.body.trim();
  const below =
    0.04 * H +
    titleFit.lines.length * titleLineH +
    56 * u +
    (scene.collectionTotal ? 92 * u : 0) +
    (body ? 56 * u : 0);
  const cardsTop = layout.cardsY * H;
  const area: Box = {
    x: margin,
    y: cardsTop,
    w: W - 2 * margin,
    h: photoHeight({
      top: cardsTop,
      bottom: CONTENT_BOTTOM[scene.format] * H,
      below,
      min: layout.minCardsH * H,
    }),
  };

  // The cards drop in one after another and settle into a fan, in reading order.
  const { cards, pairs } = fanCards(pieces.length, area, u, rtl);
  // Drawn back to front; each drops in at its place in reading order.
  const byDepth = [...cards.keys()].sort((a, b) => cards[a].z - cards[b].z);
  byDepth.forEach((readIndex) => {
    const card = cards[readIndex];
    const piece = pieces[readIndex];
    const drop = progress(t, 0.3 + readIndex * CARD_STEP, 0.8, ease.outBack);
    if (drop <= 0) return;
    const alpha = presence(t, { start: 0.3 + readIndex * CARD_STEP, end: DURATION, enter: 0.3 });
    const cx = card.x + card.w / 2;
    const cy = card.y + card.h / 2;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy + (1 - drop) * -120 * u);
    ctx.rotate(card.tilt * drop + (1 - drop) * card.tilt * 2);
    ctx.translate(-cx, -cy);
    const box: Box = { x: card.x, y: card.y, w: card.w, h: card.h };
    // A soft shadow under the card, so the fan has depth.
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.18)";
    ctx.shadowBlur = 40 * u;
    ctx.shadowOffsetY = 16 * u;
    roundedRect(ctx, box, 14 * u);
    ctx.fillStyle = palette.ground;
    ctx.fill();
    ctx.restore();
    roundedRect(ctx, box, 14 * u);
    ctx.clip();
    if (piece.media) {
      drawCover(ctx, piece.media, box, {
        zoom: mix(1.1, 1, progress(t, 0.3, DURATION, ease.outCubic)),
      });
    } else {
      ctx.fillStyle = withAlpha(palette.ink, 0.08);
      ctx.fillRect(box.x, box.y, box.w, box.h);
    }
    ctx.restore();
  });

  // The pluses between the cards, in the store's ink.
  for (const [from, to] of pairs) {
    const a = cards[from];
    const b = cards[to];
    const pop = progress(t, 0.3 + to * CARD_STEP + 0.35, 0.5, ease.outBack);
    if (pop <= 0) continue;
    // Halfway between the two cards' centres, over where they meet.
    const x = (a.x + a.w / 2 + b.x + b.w / 2) / 2;
    const y = (a.y + a.h / 2 + b.y + b.h / 2) / 2;
    const r = 34 * u * pop;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = palette.ink;
    ctx.fill();
    ctx.strokeStyle = palette.ground;
    ctx.lineWidth = 5 * u * pop;
    ctx.beginPath();
    ctx.moveTo(x - r * 0.45, y);
    ctx.lineTo(x + r * 0.45, y);
    ctx.moveTo(x, y - r * 0.45);
    ctx.lineTo(x, y + r * 0.45);
    ctx.stroke();
    ctx.restore();
  }

  // The title, word by word, centred under the set.
  let y = area.y + area.h + 0.04 * H;
  ctx.fillStyle = palette.ink;
  ctx.font = font(titleFit.size, family, 600);
  const words = layoutWords(titleFit.lines, (text) => ctx.measureText(text).width, {
    x: W / 2,
    y,
    lineHeight: titleLineH,
    dir: rtl ? "rtl" : "ltr",
    align: "center",
  });
  drawRisingWords(ctx, words, {
    size: titleFit.size,
    lineHeight: titleLineH,
    reveal: (word) => progress(t, 1.2 + word.order * 0.08, 0.6, ease.outExpo),
  });
  y += titleFit.lines.length * titleLineH + 14 * u;

  // The pieces' names, "+" between them, each drawn on its own (names and numbers never reorder).
  const names = pieces.map((piece) => piece.name.trim()).filter(Boolean);
  if (names.length > 1) {
    const runs: TextRun[] = names.flatMap((name, index) =>
      index === 0 ? [{ text: name }] : [{ text: "+", dir: "ltr" as const }, { text: name }],
    );
    let size = 28 * u;
    ctx.font = font(size, STUDIO_FONTS.body, 500);
    const width = () =>
      runs.reduce((sum, run) => sum + ctx.measureText(run.text).width, 0) +
      16 * u * (runs.length - 1);
    while (width() > W - 2 * margin && size > 18 * u) {
      size -= 2 * u;
      ctx.font = font(size, STUDIO_FONTS.body, 500);
    }
    ctx.save();
    ctx.globalAlpha = presence(t, { start: 1.6, end: DURATION }) * 0.8;
    ctx.fillStyle = palette.ink;
    ctx.textBaseline = "top";
    drawRuns(ctx, runs, {
      x: W / 2,
      y,
      lineDir: rtl ? "rtl" : "ltr",
      align: "center",
      gap: 16 * u,
    });
    ctx.restore();
  }
  y += 56 * u;

  // Together: the set's total, on a pill in the store's ink.
  if (scene.collectionTotal) {
    const stamp = progress(t, 2, 0.55, ease.outBack);
    if (stamp > 0) {
      const label = rtl ? "معاً" : "Together";
      ctx.save();
      ctx.font = font(24 * u, STUDIO_FONTS.body, 500);
      const labelW = ctx.measureText(label).width;
      ctx.font = font(38 * u, STUDIO_FONTS.body, 600);
      const totalW = ctx.measureText(scene.collectionTotal).width;
      const pad = 34 * u;
      const pill: Box = { x: 0, y, w: labelW + totalW + 3 * pad, h: 76 * u };
      pill.x = W / 2 - pill.w / 2;
      const cx = W / 2;
      const cy = pill.y + pill.h / 2;
      ctx.globalAlpha = presence(t, { start: 2, end: DURATION, enter: 0.25 });
      ctx.translate(cx, cy);
      ctx.scale(mix(1.3, 1, stamp), mix(1.3, 1, stamp));
      ctx.translate(-cx, -cy);
      roundedRect(ctx, pill, pill.h / 2);
      ctx.fillStyle = palette.ink;
      ctx.fill();
      ctx.fillStyle = palette.ground;
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      // The label at the reading start, the total after it.
      const labelX = rtl ? pill.x + pill.w - pad - labelW : pill.x + pad;
      const totalX = rtl ? pill.x + pad : pill.x + pad * 2 + labelW;
      ctx.font = font(24 * u, STUDIO_FONTS.body, 500);
      ctx.globalAlpha *= 0.8;
      ctx.direction = textDirection(label);
      ctx.fillText(label, labelX, cy + u);
      ctx.globalAlpha /= 0.8;
      ctx.font = font(38 * u, STUDIO_FONTS.body, 600);
      // An Arabic total ("42.000 د.ب.") reads right to left: number first, then the currency.
      ctx.direction = textDirection(scene.collectionTotal);
      ctx.fillText(scene.collectionTotal, totalX, cy + u);
      ctx.restore();
    }
    y += 92 * u;
  }

  // The offer, in the merchant's words (a code, a saving), under the total.
  if (body) {
    const bodyFit = fitText(
      body,
      { maxWidth: W - 2 * margin, maxLines: 1, min: 22 * u, max: 30 * u },
      (size) => {
        ctx.font = font(size, STUDIO_FONTS.body, 500);
        return (text) => ctx.measureText(text).width;
      },
    );
    ctx.save();
    ctx.globalAlpha = presence(t, { start: 2.4, end: DURATION }) * 0.85;
    ctx.fillStyle = palette.accent;
    ctx.font = font(bodyFit.size, STUDIO_FONTS.body, 500);
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.direction = textDirection(body);
    ctx.fillText(bodyFit.lines[0] ?? body, W / 2, y);
    ctx.restore();
  }

  const footer =
    layout.footerY === null ? null : [brand.handle, brand.contact].filter(Boolean).join("   ·   ");
  if (footer) {
    ctx.save();
    ctx.globalAlpha = presence(t, { start: 2.6, end: DURATION }) * 0.75;
    ctx.fillStyle = palette.ink;
    ctx.font = font(26 * u, STUDIO_FONTS.body, 400);
    ctx.direction = "ltr";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(footer, W / 2, (layout.footerY ?? 0) * H);
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

/** Complete the look: two or three pieces fanned as a set, with their total. */
export const bundleSet: StudioTemplate = {
  id: "bundle-set",
  name: { en: "Bundle", ar: "المجموعة" },
  goal: { en: "Sets & gift boxes", ar: "أطقم وبوكسات" },
  duration: DURATION,
  render,
};
