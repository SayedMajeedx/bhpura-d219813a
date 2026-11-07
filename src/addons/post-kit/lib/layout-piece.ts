import { AR, HAND } from "./tones";
import { coverImage, handle, photoCrop, stitchedFrame, wordmark } from "./frame";
import { drawText, fit, roundRect, sewnTag, wrap } from "./text";
import type { Ctx, Geometry, PhotoBook, Post, TextLayout, Tone } from "./types";

/** "A: B" a line, as a list of a piece's traits or a paper's rows. A line with no colon has no name. */
export function parseRows(raw: string | undefined) {
  return String(raw || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const i = line.indexOf(":");
      return i > 0
        ? { name: line.slice(0, i).trim(), value: line.slice(i + 1).trim() }
        : { name: "", value: line };
    });
}

/**
 * The Piece card: one piece with its name, its character and its price. The price is the post's
 * label, which `livePost` fills from the store and the maker rewrites when the piece changes, so a
 * card never holds a price of its own.
 */
export function drawPiece(ctx: Ctx, s: Post, g: Geometry, tone: Tone, photos: PhotoBook) {
  stitchedFrame(ctx, g, tone);
  wordmark(ctx, g, tone);
  handle(ctx, g, tone);
  const right = g.W - g.M,
    w = g.W - g.M * 2;
  const head = fit(ctx, s.head, AR, 700, 84, 50, w, 130, 1.3);
  const top = drawText(ctx, head, right, g.T, tone) + 30;
  const gap = 40;
  const photoW = Math.round(w * 0.54);
  const photoH = Math.min(photoW * 1.85, g.B - top - 24);

  ctx.save();
  ctx.translate(g.M + photoW / 2, top + photoH / 2);
  ctx.rotate(-0.014);
  ctx.translate(-photoW / 2, -photoH / 2);
  ctx.shadowColor = "rgba(20,5,10,.26)";
  ctx.shadowBlur = 22;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = "#FFFDFB";
  roundRect(ctx, 0, 0, photoW, photoH, 10);
  ctx.fill();
  ctx.shadowColor = "transparent";
  coverImage(
    ctx,
    photos[s.photo1 ?? ""]?.img,
    14,
    14,
    photoW - 28,
    photoH - 28,
    photoCrop(s, "photo1"),
  );
  ctx.restore();

  const colW = w - photoW - gap;
  const tagH = s.label ? 92 : 0;
  const rows = parseRows(s.items);
  const room = photoH - tagH - 24;
  let size = 44;
  let values: TextLayout[] = [];
  for (; size >= 28; size -= 2) {
    ctx.font = `600 ${size}px ${AR}`;
    values = rows.map((row) => ({
      ...wrap(ctx, row.value, colW),
      size,
      lh: 1.36,
      family: AR,
      weight: 600,
      noTag: true,
    }));
    const total = values.reduce((sum, l) => sum + l.lines.length * size * 1.36 + 92, 0);
    if (total <= room) break;
  }
  let y = top + 4;
  rows.forEach((row, i) => {
    if (row.name) {
      ctx.font = `600 32px ${HAND}`;
      ctx.fillStyle = tone.sub;
      ctx.textAlign = "right";
      ctx.fillText(row.name, right, y + 32);
      y += 46;
    }
    y = drawText(ctx, values[i], right, y, tone) + 18;
    if (i < rows.length - 1) {
      ctx.save();
      ctx.strokeStyle = tone.stitch;
      ctx.lineWidth = 3;
      ctx.setLineDash([13, 10]);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(right, y);
      ctx.lineTo(right - colW, y);
      ctx.stroke();
      ctx.restore();
      y += 22;
    }
  });

  if (s.label) {
    let tagSize = 36;
    for (; tagSize > 22; tagSize -= 2) {
      ctx.font = `600 ${tagSize}px ${AR}`;
      if (ctx.measureText(s.label).width + 52 <= colW) break;
    }
    ctx.font = `600 ${tagSize}px ${AR}`;
    const textW = ctx.measureText(s.label).width;
    const tagY = top + photoH - 76;
    sewnTag(ctx, right - textW - 44, tagY, textW + 52, 76, tone.tag, tone.tagInk, 0.012);
    ctx.fillStyle = tone.tagInk;
    ctx.textAlign = "right";
    ctx.fillText(s.label, right - 18, tagY + 50);
  }
}
