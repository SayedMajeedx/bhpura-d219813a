import { AR, HAND, TONES } from "./tones";
import { drawLogo, fit, drawText, roundRect } from "./text";
import type { Crop, Ctx, Geometry, Post, Tone } from "./types";

/* The frame every post shares: its size, the photo's crop, the logo, the stitching and the cloth. */

export function photoCrop(s: Post, slot: string): Required<Crop> {
  const fallback =
    s.focus != null ? s.focus : s.tpl === "photo" ? 0.08 : s.tpl === "poll" ? 0.05 : 0;
  return { z: 1, fx: 0.5, fy: fallback, ...((s.crop && s.crop[slot]) || {}) };
}
export function coverImage(
  ctx: Ctx,
  img: HTMLImageElement | null | undefined,
  x: number,
  y: number,
  w: number,
  h: number,
  crop: Crop = {},
) {
  if (!img) {
    ctx.fillStyle = "#5C2436";
    ctx.fillRect(x, y, w, h);
    return;
  }
  const { z = 1, fx = 0.5, fy = 0.12 } = crop;
  const scale = Math.max(w / img.width, h / img.height) * z;
  const dw = img.width * scale,
    dh = img.height * scale;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(img, x + (w - dw) * fx, y + (h - dh) * fy, dw, dh);
  ctx.restore();
}

export function geometry(s: Pick<Post, "size">): Geometry {
  const story = s.size === "story";
  const H = story ? 1920 : 1350;
  return {
    W: 1080,
    H,
    M: 104,
    story,
    T: story ? 330 : 188,
    B: story ? H - 340 : H - 104,
    logoTop: story ? 250 : 104,
    logoW: 150,
  };
}
export function logoColor(tone: Tone) {
  return tone === TONES.wine || tone === TONES.ink ? "#F7ECE6" : "#330a0a";
}
export function wordmark(ctx: Ctx, g: Geometry, tone: Tone) {
  /* The logo keeps its own colour on the light tones and turns cream on the dark ones. */
  drawLogo(ctx, g.W - g.M - g.logoW, g.logoTop, g.logoW, logoColor(tone));
}
export function stitchedFrame(ctx: Ctx, g: Geometry, tone: Tone) {
  ctx.save();
  ctx.strokeStyle = tone.stitch;
  ctx.lineWidth = 4;
  ctx.setLineDash([20, 14]);
  ctx.lineCap = "round";
  roundRect(ctx, 44, 44, g.W - 88, g.H - 88, 26);
  ctx.stroke();
  ctx.restore();
}
export function handle(ctx: Ctx, g: Geometry, tone: Tone) {
  ctx.fillStyle = tone.sub;
  ctx.font = `500 26px ${AR}`;
  ctx.direction = "ltr";
  ctx.textAlign = "right";
  ctx.fillText("@puraline.bh", g.W - g.M, g.story ? g.H - 260 : g.H - 78);
  ctx.direction = "rtl";
}
export function sideNote(
  ctx: Ctx,
  text: string | undefined,
  right: number,
  y: number,
  maxW: number,
  tone: Tone,
  size = 46,
) {
  if (!text) return y;
  const layout = fit(ctx, text, HAND, 600, size, 28, maxW, size * 3.2, 1.35);
  return drawText(ctx, layout, right, y, tone, tone.sub);
}

/* A fine woven grain, made once and repeated, so a plain colour reads as cloth. */
let grainTile: HTMLCanvasElement | null = null;
export function grain(): HTMLCanvasElement {
  if (grainTile) return grainTile;
  grainTile = document.createElement("canvas");
  grainTile.width = grainTile.height = 240;
  const c = grainTile.getContext("2d") as Ctx;
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let y = 0; y < 240; y += 3) {
    for (let x = 0; x < 240; x += 3) {
      const v = rand();
      c.fillStyle =
        v > 0.5 ? `rgba(255,255,255,${(v - 0.5) * 0.09})` : `rgba(0,0,0,${(0.5 - v) * 0.2})`;
      c.fillRect(x, y, 3, 3);
    }
  }
  return grainTile;
}
