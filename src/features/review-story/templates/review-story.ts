import { drawCover, mediaSize, withAlpha } from "@/features/content-studio/engine/draw";
import { preparedLogo } from "@/features/content-studio/engine/brand-mark";
import type { StudioTemplate } from "@/features/content-studio/engine/scene";
import { wrapText } from "@/features/content-studio/engine/text-layout";
import { ease, mix, presence, progress, stagger } from "@/features/content-studio/engine/timeline";
import {
  STORY_HEIGHT,
  STORY_WIDTH,
  type ReviewScene,
  type StoryLook,
} from "@/features/review-story/lib/review-story";

const DURATION = 8;
const FONT = "'Tajawal', 'Cairo', Arial, sans-serif";

/** The framed product media, in story pixels. */
const FRAME = { x: (STORY_WIDTH - 660) / 2, y: 240, w: 660, h: 1140, r: 42 } as const;
/** The review card's width and the widest a comment line may run. */
const CARD_W = 780;
const COMMENT_W = 684;
const PAD_X = 48;
const LINE_H = 46;

function rounded(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function sparkle(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - size);
  ctx.quadraticCurveTo(cx, cy, cx + size, cy);
  ctx.quadraticCurveTo(cx, cy, cx, cy + size);
  ctx.quadraticCurveTo(cx, cy, cx - size, cy);
  ctx.quadraticCurveTo(cx, cy, cx, cy - size);
  ctx.closePath();
  ctx.fill();
}

/** Up to six lines of the comment, the last ending in "…" when it runs on. */
function commentLines(ctx: CanvasRenderingContext2D, text: string): string[] {
  const measure = (line: string) => ctx.measureText(line).width;
  const lines = wrapText(text, COMMENT_W, measure);
  if (lines.length <= 6) return lines;
  const kept = lines.slice(0, 6);
  let last = kept[5];
  while (last && measure(`${last}…`) > COMMENT_W) last = last.slice(0, -1).trim();
  kept[5] = `${last}…`;
  return kept;
}

const backgrounds = new Map<string, HTMLCanvasElement>();

/**
 * The story's still layer (its ground, the frame's shadow and the empty
 * frame's placeholder), painted once per look and stamped on every frame:
 * gradients and shadows are slow to paint.
 */
function background(look: StoryLook, hasMedia: boolean, lang: "ar" | "en") {
  const key = `${look}:${hasMedia}:${lang}`;
  const cached = backgrounds.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = STORY_WIDTH;
  canvas.height = STORY_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const dark = look === "midnight";
  const stops =
    look === "classic"
      ? ["#ece3d8", "#dfd4c7", "#cfc0b0"]
      : look === "editorial"
        ? ["#ffffff", "#faf8f5", "#f0ede8"]
        : ["#1c1010", "#120a0a", "#0a0505"];
  const ground = ctx.createLinearGradient(0, 0, 0, STORY_HEIGHT);
  ground.addColorStop(0, stops[0]);
  ground.addColorStop(look === "midnight" ? 0.6 : 0.45, stops[1]);
  ground.addColorStop(1, stops[2]);
  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, STORY_WIDTH, STORY_HEIGHT);
  if (look !== "editorial") {
    const glow = ctx.createRadialGradient(
      540,
      dark ? 700 : 750,
      dark ? 80 : 60,
      540,
      750,
      dark ? 800 : 750,
    );
    glow.addColorStop(0, dark ? "rgba(239, 217, 200, 0.08)" : "rgba(255, 255, 255, 0.28)");
    glow.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, STORY_WIDTH, STORY_HEIGHT);
  }
  ctx.save();
  ctx.shadowColor = dark ? "rgba(0, 0, 0, 0.55)" : "rgba(60, 45, 38, 0.16)";
  ctx.shadowBlur = 42;
  ctx.shadowOffsetY = 16;
  ctx.fillStyle = dark ? "#241616" : "#fdfbf9";
  rounded(ctx, FRAME.x, FRAME.y, FRAME.w, FRAME.h, FRAME.r);
  ctx.fill();
  ctx.restore();
  if (!hasMedia) {
    ctx.save();
    rounded(ctx, FRAME.x, FRAME.y, FRAME.w, FRAME.h, FRAME.r);
    ctx.clip();
    const fill = ctx.createLinearGradient(FRAME.x, FRAME.y, FRAME.x + FRAME.w, FRAME.y + FRAME.h);
    fill.addColorStop(0, dark ? "#2c1a1a" : "#e7dfd5");
    fill.addColorStop(1, dark ? "#190e0e" : "#d9cebf");
    ctx.fillStyle = fill;
    ctx.fillRect(FRAME.x, FRAME.y, FRAME.w, FRAME.h);
    ctx.fillStyle = dark ? "rgba(255, 255, 255, 0.4)" : "rgba(80, 60, 50, 0.45)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `600 32px ${FONT}`;
    ctx.fillText(lang === "ar" ? "صورة المنتج" : "Product photo", 540, FRAME.y + FRAME.h / 2 - 20);
    ctx.font = `400 24px ${FONT}`;
    ctx.fillText(
      lang === "ar" ? "(يمكن رفع صورة من القائمة)" : "(Upload photo from controls)",
      540,
      FRAME.y + FRAME.h / 2 + 25,
    );
    ctx.restore();
  }
  if (backgrounds.size > 12) backgrounds.clear();
  backgrounds.set(key, canvas);
  return canvas;
}

function render(ctx: CanvasRenderingContext2D, t: number, scene: ReviewScene) {
  const { look, lang, primary } = scene;
  const isAr = lang === "ar";
  const dark = look === "midnight";
  const whole = presence(t, { start: 0, end: DURATION, enter: 0.4 });

  ctx.save();
  // Everything is laid out in story pixels, then scaled to the output.
  ctx.scale(scene.width / STORY_WIDTH, scene.height / STORY_HEIGHT);
  ctx.fillStyle = dark ? "#120a0a" : "#f0ede8";
  ctx.fillRect(0, 0, STORY_WIDTH, STORY_HEIGHT);
  ctx.globalAlpha = whole;
  const still = background(look, Boolean(scene.media), lang);
  if (still) ctx.drawImage(still, 0, 0, STORY_WIDTH, STORY_HEIGHT);

  // The brand: its logo in the brand colour (as uploaded on the dark look), or its name.
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (scene.logo) {
    const { w: lw, h: lh } = mediaSize(scene.logo);
    if (lw && lh) {
      const fit = Math.min(390 / lw, 175 / lh);
      const w = lw * fit;
      const h = lh * fit;
      const k = scene.width / STORY_WIDTH;
      const logo = preparedLogo(
        scene.logo,
        dark ? null : primary,
        Math.round(w * k),
        Math.round(h * k),
      );
      ctx.drawImage(logo, (STORY_WIDTH - w) / 2, 90 + (175 - h) / 2, w, h);
    }
  } else {
    ctx.fillStyle = dark ? "#fffaf5" : primary;
    ctx.font = `700 38px ${FONT}`;
    ctx.fillText(scene.brandName, 540, 130);
  }

  // The product media in its frame, settling slowly.
  if (scene.media) {
    ctx.save();
    rounded(ctx, FRAME.x, FRAME.y, FRAME.w, FRAME.h, FRAME.r);
    ctx.clip();
    const zoom = mix(1.08, 1, progress(t, 0, DURATION, ease.outCubic));
    drawCover(ctx, scene.media, { x: FRAME.x, y: FRAME.y, w: FRAME.w, h: FRAME.h }, { zoom });
    ctx.restore();
  }
  ctx.strokeStyle = dark ? "rgba(255, 255, 255, 0.9)" : "#ffffff";
  ctx.lineWidth = 12;
  rounded(ctx, FRAME.x, FRAME.y, FRAME.w, FRAME.h, FRAME.r);
  ctx.stroke();

  // Sparkles, twinkling.
  ctx.fillStyle = dark ? "rgba(245, 225, 210, 0.9)" : "rgba(255, 255, 255, 0.95)";
  (
    [
      [880, 460, 32],
      [190, 1310, 26],
      [890, 1180, 18],
    ] as const
  ).forEach(([x, y, size], index) => {
    const on = progress(t, stagger(1, index, 0.2), 0.5, ease.outBack);
    if (on <= 0) return;
    ctx.save();
    ctx.globalAlpha = whole * (0.7 + 0.3 * Math.sin(t * 2.4 + index * 2));
    sparkle(ctx, x, y, size * on);
    ctx.restore();
  });

  // The review card rises into place.
  ctx.font = `500 30px ${FONT}`;
  const lines = commentLines(ctx, scene.comment);
  const cardH = Math.max(
    320,
    Math.min(560, 160 + lines.length * LINE_H + (scene.highlights.length > 0 ? 52 : 0)),
  );
  const cardX = (STORY_WIDTH - CARD_W) / 2;
  const arrive = presence(t, { start: 0.5, end: DURATION, enter: 0.8 });
  const cardY = Math.round(850 - cardH / 2) + (1 - arrive) * 60;
  if (arrive > 0) {
    ctx.save();
    ctx.globalAlpha = whole * arrive;
    ctx.shadowColor = dark ? "rgba(0, 0, 0, 0.45)" : "rgba(50, 35, 25, 0.16)";
    ctx.shadowBlur = 38;
    ctx.shadowOffsetY = 14;
    ctx.fillStyle = dark ? "rgba(28, 16, 16, 0.88)" : "rgba(255, 255, 255, 0.88)";
    rounded(ctx, cardX, cardY, CARD_W, cardH, 36);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.strokeStyle = dark ? "rgba(255, 255, 255, 0.22)" : "rgba(255, 255, 255, 0.85)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  const startX = isAr ? cardX + CARD_W - PAD_X : cardX + PAD_X;
  const endX = isAr ? cardX + PAD_X : cardX + CARD_W - PAD_X;
  const reveal = (start: number) => presence(t, { start, end: DURATION, enter: 0.5 }) * whole;

  // The name and the date.
  const header = reveal(0.9);
  if (header > 0) {
    ctx.save();
    ctx.globalAlpha = header;
    ctx.direction = isAr ? "rtl" : "ltr";
    ctx.textAlign = isAr ? "right" : "left";
    ctx.fillStyle = dark ? "#fffaf5" : "#231815";
    ctx.font = `700 36px ${FONT}`;
    ctx.fillText(scene.customer, startX, cardY + 48);
    if (scene.date) {
      ctx.textAlign = isAr ? "left" : "right";
      ctx.fillStyle = dark ? "rgba(255, 250, 245, 0.65)" : "#7a6b65";
      ctx.font = `500 24px ${FONT}`;
      ctx.fillText(scene.date, endX, cardY + 48);
    }
    ctx.restore();
  }

  // The stars, one after another.
  ctx.save();
  ctx.direction = "ltr";
  ctx.fillStyle = dark ? "#efd9c8" : "#32231f";
  ctx.font = `700 34px Arial, sans-serif`;
  const starW = ctx.measureText("★").width || 34;
  for (let index = 0; index < scene.rating; index++) {
    const pop = progress(t, stagger(1.1, index, 0.12), 0.45, ease.outBack);
    if (pop <= 0) continue;
    const x = isAr ? startX - (index + 0.5) * starW : startX + (index + 0.5) * starW;
    ctx.globalAlpha = whole * Math.min(1, pop);
    ctx.save();
    ctx.translate(x, cardY + 98);
    ctx.scale(pop, pop);
    ctx.textAlign = "center";
    ctx.fillText("★", 0, 0);
    ctx.restore();
  }
  ctx.restore();

  // The comment, line by line.
  ctx.save();
  ctx.direction = isAr ? "rtl" : "ltr";
  ctx.textAlign = isAr ? "right" : "left";
  ctx.fillStyle = dark ? "#f4ede6" : "#2b211e";
  ctx.font = `500 30px ${FONT}`;
  lines.forEach((line, index) => {
    const p = reveal(stagger(1.5, index, 0.1));
    if (p <= 0) return;
    ctx.globalAlpha = p;
    ctx.fillText(line, startX, cardY + 155 + index * LINE_H + (1 - p) * 14);
  });
  ctx.restore();

  // The highlights, as tags along the card's foot.
  if (scene.highlights.length > 0) {
    ctx.save();
    ctx.font = `600 22px ${FONT}`;
    ctx.direction = isAr ? "rtl" : "ltr";
    const tagY = cardY + cardH - 40;
    let x = startX;
    scene.highlights.forEach((label, index) => {
      const w = ctx.measureText(label).width + 32;
      const boxX = isAr ? x - w : x;
      x = isAr ? x - w - 12 : x + w + 12;
      const p = reveal(stagger(2.2, index, 0.12));
      if (p <= 0) return;
      ctx.globalAlpha = p;
      ctx.fillStyle = dark ? "rgba(255, 255, 255, 0.12)" : "rgba(0, 0, 0, 0.05)";
      rounded(ctx, boxX, tagY - 19, w, 38, 19);
      ctx.fill();
      ctx.fillStyle = dark ? "#f0e6dd" : "#4a3c37";
      ctx.textAlign = "center";
      ctx.fillText(label, boxX + w / 2, tagY);
    });
    ctx.restore();
  }

  // The line under the story, the store's contacts and the verified badge.
  ctx.save();
  ctx.textAlign = "center";
  const tagline = reveal(2.4);
  if (tagline > 0) {
    ctx.globalAlpha = tagline;
    ctx.direction = isAr ? "rtl" : "ltr";
    ctx.font = `500 24px ${FONT}`;
    ctx.fillStyle = dark ? "rgba(255, 250, 245, 0.72)" : "#756660";
    ctx.fillText(
      isAr ? "آراء حقيقية، وتجارب نعتز بها" : "Real words. Genuine experiences.",
      540,
      1565,
    );
  }
  const contact = reveal(2.6);
  if (scene.contact && contact > 0) {
    ctx.globalAlpha = contact;
    ctx.font = `700 26px ${FONT}`;
    const pillW = Math.min(STORY_WIDTH - 120, ctx.measureText(scene.contact).width + 64);
    rounded(ctx, 540 - pillW / 2, 1625, pillW, 58, 29);
    ctx.fillStyle = dark ? "rgba(255, 255, 255, 0.12)" : "rgba(255, 255, 255, 0.75)";
    ctx.fill();
    ctx.strokeStyle = dark ? "rgba(255, 255, 255, 0.22)" : "rgba(255, 255, 255, 0.9)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = dark ? "#fffaf5" : primary;
    ctx.fillText(scene.contact, 540, 1654);
  }
  const badge = reveal(2.8);
  if (badge > 0) {
    ctx.globalAlpha = badge;
    rounded(ctx, 414, 1740, 252, 54, 27);
    ctx.fillStyle = dark ? "rgba(255, 255, 255, 0.1)" : withAlpha(primary, 0.07);
    ctx.fill();
    ctx.fillStyle = dark ? "#fffaf5" : primary;
    ctx.font = `600 22px ${FONT}`;
    ctx.fillText(isAr ? "✓  تقييم موثّق" : "✓  VERIFIED REVIEW", 540, 1768);
  }
  ctx.restore();
  ctx.restore();
}

/**
 * The customer review story: the product framed, and a frosted card where
 * the stars pop in one by one and the customer's words follow.
 */
export const reviewStory: StudioTemplate<ReviewScene> = {
  id: "review-story",
  name: { en: "Review story", ar: "ستوري التقييم" },
  goal: { en: "Customer review", ar: "تقييم عميل" },
  duration: DURATION,
  render,
};
