import { TONES } from "./tones";
import { geometry, grain } from "./frame";
import { DRAW } from "./layouts";
import { drawSticker } from "./stickers";
import type { Ctx, PhotoBook, Post } from "./types";

/* One post, drawn at 1080 wide so the screen and the file match. */

export function renderPost(
  canvas: HTMLCanvasElement,
  s: Post,
  photos: PhotoBook,
  scale = 1,
  selected = -1,
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
    if (i === selected) {
      ctx.save();
      ctx.strokeStyle = "#2F7DE1";
      ctx.lineWidth = 5;
      ctx.setLineDash([16, 10]);
      ctx.strokeRect(st.x * g.W - st.s / 2, st.y * g.H - st.s / 2, st.s, st.s);
      ctx.restore();
    }
  });
}
