import { drawBrandMark, logoColor } from "@/features/content-studio/engine/brand-mark";
import {
  drawCover,
  drawLines,
  drawShade,
  font,
  roundedRect,
  withAlpha,
} from "@/features/content-studio/engine/draw";
import { displayFont, STUDIO_FONTS } from "@/features/content-studio/engine/fonts";
import type { FormatKey, SceneData, StudioTemplate } from "@/features/content-studio/engine/scene";
import { fitText, textDirection } from "@/features/content-studio/engine/text-layout";
import { ease, mix, presence, progress, stagger } from "@/features/content-studio/engine/timeline";

const DURATION = 8;
const COVER_INK = "#ffffff";

/**
 * Where the cover's parts sit (fractions of H). Stories keep the masthead
 * below Instagram's top bar and the cover lines above its reply bar.
 */
const LAYOUT: Record<FormatKey, { mastY: number; linesBottom: number; mastMax: number }> = {
  story: { mastY: 0.165, linesBottom: 0.8, mastMax: 250 },
  portrait: { mastY: 0.1, linesBottom: 0.93, mastMax: 230 },
  square: { mastY: 0.1, linesBottom: 0.92, mastMax: 200 },
};

/**
 * The store name as a masthead: large display letters that track in from
 * wide spacing. Arabic names are never spaced out (it breaks the joined
 * script); they fade and settle instead.
 */
function drawTextMasthead(
  ctx: CanvasRenderingContext2D,
  scene: SceneData,
  y: number,
  size: number,
  t: number,
  color: string,
) {
  const { width: W } = scene;
  const name = scene.brand.name.toUpperCase();
  const arabic = textDirection(name) === "rtl";
  ctx.save();
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.font = font(size, displayFont(arabic ? "ar" : "en"), 600);
  if (arabic) {
    ctx.direction = "rtl";
    ctx.textAlign = "center";
    ctx.fillText(scene.brand.name, W / 2, y);
    ctx.restore();
    return;
  }
  const tracking = mix(size * 0.45, size * 0.04, progress(t, 0.3, 1.4, ease.outExpo));
  const chars = [...name];
  const widths = chars.map((char) => ctx.measureText(char).width);
  const total = widths.reduce((sum, w) => sum + w, 0) + tracking * (chars.length - 1);
  let x = W / 2 - total / 2;
  ctx.textAlign = "left";
  chars.forEach((char, index) => {
    ctx.fillText(char, x, y);
    x += widths[index] + tracking;
  });
  ctx.restore();
}

function render(ctx: CanvasRenderingContext2D, t: number, scene: SceneData) {
  const { width: W, height: H, brand, lang } = scene;
  const { palette } = brand;
  const u = W / 1080;
  const layout = LAYOUT[scene.format];
  const rtl = lang === "ar";
  const margin = 76 * u;
  const startX = rtl ? W - margin : margin;
  const whole = presence(t, { start: 0, end: DURATION, enter: 1 });

  // The cover photo, full bleed, settling slowly; shaded top and bottom so
  // the masthead and cover lines read over any photo.
  ctx.fillStyle = palette.ground;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.globalAlpha = whole;
  if (scene.media) {
    drawCover(
      ctx,
      scene.media,
      { x: 0, y: 0, w: W, h: H },
      {
        zoom: mix(1.14, 1, progress(t, 0, DURATION, ease.outCubic)),
      },
    );
  } else {
    const fill = ctx.createLinearGradient(0, 0, W, H);
    fill.addColorStop(0, palette.accent);
    fill.addColorStop(1, palette.ground);
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, W, H);
  }
  // The cover's shading: dark at the top for the masthead, darker at the foot for the cover lines.
  drawShade(ctx, W, H, { height: 0.34, alpha: 0.42 }, { from: 0.45, alpha: 0.62 });
  ctx.restore();

  // Masthead: the logo, large and centred, or the name tracking in.
  const mastY = layout.mastY * H;
  const mastIn = progress(t, 0.3, 1.2, ease.outExpo);
  const mastAlpha = presence(t, { start: 0.3, end: DURATION, enter: 1 });
  const mastColor = logoColor(brand.logoTint, { onPhoto: true, ink: palette.ink }) ?? COVER_INK;
  // Half the masthead's height, so the issue line always sits beneath it.
  let mastHalf = 0;
  ctx.save();
  ctx.globalAlpha = mastAlpha;
  if (brand.logo) {
    const grow = mix(1.08, 1, mastIn);
    ctx.translate(W / 2, mastY);
    ctx.scale(grow, grow);
    ctx.translate(-W / 2, -mastY);
    drawBrandMark(ctx, brand, {
      x: W / 2,
      y: mastY,
      u,
      align: "center",
      onPhoto: true,
      ink: palette.ink,
      height: layout.mastMax * 0.72,
      maxWidth: 820,
    });
    mastHalf = (layout.mastMax * 0.72 * u * brand.logoScale) / 2;
  } else {
    const nameSize = fitText(
      brand.name.toUpperCase(),
      {
        maxWidth: W - 2 * margin,
        maxLines: 1,
        min: 90 * u,
        max: layout.mastMax * u * brand.logoScale,
      },
      (size) => {
        ctx.font = font(size, displayFont("en"), 600);
        return (text) => ctx.measureText(text).width * 1.1;
      },
    ).size;
    drawTextMasthead(ctx, scene, mastY, nameSize, t, mastColor);
    mastHalf = nameSize * 0.55;
  }
  ctx.restore();

  // Issue line under the masthead: this month, then the handle on its own
  // line (mixing Arabic and a Latin handle on one line scrambles their order).
  const issueY = mastY + mastHalf + 44 * u;
  ctx.save();
  ctx.globalAlpha = presence(t, { start: 0.9, end: DURATION }) * 0.9;
  ctx.fillStyle = COVER_INK;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = font(26 * u, STUDIO_FONTS.body, 500);
  ctx.direction = textDirection(scene.issueLabel);
  ctx.fillText(
    textDirection(scene.issueLabel) === "rtl" ? scene.issueLabel : scene.issueLabel.toUpperCase(),
    W / 2,
    issueY,
  );
  if (brand.handle) {
    ctx.font = font(24 * u, STUDIO_FONTS.body, 400);
    ctx.direction = "ltr";
    ctx.globalAlpha *= 0.85;
    ctx.fillText(brand.handle, W / 2, issueY + 38 * u);
  }
  ctx.restore();

  // Cover lines, built up from the bottom: the price tag, the body, the headline.
  const headline = scene.headline.trim() || scene.productName;
  const headFamily = displayFont(textDirection(headline) === "rtl" ? "ar" : "en");
  const head = fitText(
    headline,
    { maxWidth: W * 0.78, maxLines: 3, min: 64 * u, max: 132 * u },
    (size) => {
      ctx.font = font(size, headFamily, 600);
      return (text) => ctx.measureText(text).width;
    },
  );
  const body = scene.body.trim();
  const bodyFit = body
    ? fitText(body, { maxWidth: W * 0.7, maxLines: 2, min: 24 * u, max: 32 * u }, (size) => {
        ctx.font = font(size, STUDIO_FONTS.body, 400);
        return (text) => ctx.measureText(text).width;
      })
    : null;
  const tagSize = 30 * u;
  const tagH = scene.price ? tagSize * 2.1 : 0;
  const bodyH = bodyFit ? bodyFit.lines.length * bodyFit.size * 1.45 + 26 * u : 0;
  const headH = head.lines.length * head.size * 1.02;
  const bottom = layout.linesBottom * H;
  const tagY = bottom - tagH;
  const bodyY = tagY - (tagH ? 30 * u : 0) - bodyH;
  const headY = bodyY - headH - 10 * u;

  const slide = (index: number, start: number) => {
    const p = presence(t, { start: stagger(start, index, 0.12), end: DURATION });
    return { alpha: p, dx: (1 - p) * 60 * u * (rtl ? 1 : -1) };
  };

  ctx.save();
  ctx.fillStyle = COVER_INK;
  ctx.font = font(head.size, headFamily, 600);
  head.lines.forEach((line, index) => {
    const { alpha, dx } = slide(index, 1.4);
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(dx, 0);
    drawLines(ctx, [line], {
      x: startX,
      y: headY + index * head.size * 1.02,
      lineHeight: head.size,
      dir: textDirection(headline),
    });
    ctx.restore();
  });
  ctx.restore();

  if (bodyFit) {
    ctx.save();
    ctx.globalAlpha = presence(t, { start: 2.1, end: DURATION }) * 0.88;
    ctx.fillStyle = COVER_INK;
    ctx.font = font(bodyFit.size, STUDIO_FONTS.body, 400);
    drawLines(ctx, bodyFit.lines.slice(0, 2), {
      x: startX,
      y: bodyY + 26 * u,
      lineHeight: bodyFit.size * 1.45,
      dir: textDirection(body),
    });
    ctx.restore();
  }

  // The cover price: product name and price in a small box, as on a newsstand.
  if (scene.price) {
    const stamp = progress(t, 2.6, 0.5, ease.outBack);
    const alpha = presence(t, { start: 2.6, end: DURATION, enter: 0.3 });
    if (alpha > 0) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = font(tagSize, STUDIO_FONTS.body, 600);
      const label = `${scene.productName}  ·  ${scene.price}`;
      ctx.direction = textDirection(label);
      const w = ctx.measureText(label).width + 2 * 26 * u;
      const box = { x: rtl ? startX - w : startX, y: tagY, w, h: tagH };
      const cx = box.x + box.w / 2;
      const cy = box.y + box.h / 2;
      const scale = mix(1.25, 1, stamp);
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);
      ctx.translate(-cx, -cy);
      roundedRect(ctx, box, 6 * u);
      ctx.fillStyle = withAlpha(COVER_INK, 0.94);
      ctx.fill();
      ctx.fillStyle = palette.ground;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, cx, cy + u);
      ctx.restore();
    }
  }
}

/** Collection / launch: a fashion-magazine cover with the brand as masthead. */
export const editorialCover: StudioTemplate = {
  id: "editorial-cover",
  name: { en: "Editorial Cover", ar: "غلاف المجلة" },
  goal: { en: "Collection", ar: "مجموعة" },
  duration: DURATION,
  render,
};
