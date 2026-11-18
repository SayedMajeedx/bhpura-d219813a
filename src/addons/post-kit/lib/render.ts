import { TONES } from "./tones";
import { geometry, grain } from "./frame";
import { DRAW } from "./layouts";
import { drawSticker } from "./stickers";
import { handlesOf } from "./photo-shape";
import type { Ctx, Geometry, PhotoBook, Post, Sticker } from "./types";

/* One post, drawn at 1080 wide so the screen and the file match. */

export function renderPost(
  canvas: HTMLCanvasElement,
  s: Post,
  photos: PhotoBook,
  scale = 1,
  selected = -1,
  /** How far a selected sticker's handles reach, in post pixels: sized for a finger on screen. */
  handleRadius = 30,
) {
  const g = geometry(s);
  canvas.width = Math.round(g.W * scale);
  canvas.height = Math.round(g.H * scale);
  const ctx = canvas.getContext("2d") as Ctx;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.direction = "rtl";
  const tone = TONES[s.tone] ?? TONES.wine;
  ctx.fillStyle = tone.bg;
  ctx.fillRect(0, 0, g.W, g.H);
  ctx.save();
  ctx.globalAlpha = tone.grain;
  ctx.fillStyle = ctx.createPattern(grain(), "repeat") as CanvasPattern;
  ctx.fillRect(0, 0, g.W, g.H);
  ctx.restore();
  (DRAW[s.tpl] || DRAW.joke)(ctx, s, g, tone, photos);
  ctx.direction = "rtl";
  (s.stickers || []).forEach((st, i) => {
    drawSticker(ctx, st, g, s, tone, photos);
    if (i === selected) drawSelection(ctx, st, g, photos, handleRadius);
  });
}

/** The selected sticker's outline, turned with it, and its two handles: size at a corner, turn above. */
function drawSelection(ctx: Ctx, st: Sticker, g: Geometry, photos: PhotoBook, radius: number) {
  const { box, size, turn } = handlesOf(st, g, photos);
  ctx.save();
  ctx.translate(st.x * g.W, st.y * g.H);
  ctx.rotate(((st.r || 0) * Math.PI) / 180);
  ctx.strokeStyle = "#2F7DE1";
  ctx.lineWidth = 5;
  ctx.setLineDash([16, 10]);
  ctx.strokeRect(-box.w / 2, -box.h / 2, box.w, box.h);
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(0, -box.h / 2);
  ctx.lineTo(0, -box.h / 2 - 70);
  ctx.stroke();
  ctx.restore();
  const dot = (p: { x: number; y: number }) => {
    ctx.save();
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius * 0.62, 0, Math.PI * 2);
    ctx.fillStyle = "#FFFFFF";
    ctx.shadowColor = "rgba(0,0,0,.35)";
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 6;
    ctx.strokeStyle = "#2F7DE1";
    ctx.stroke();
    ctx.restore();
  };
  dot(size);
  dot(turn);
}
