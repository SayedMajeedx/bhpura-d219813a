import type { Ctx, Tone } from "./types";

/*
 * The dressed looks' pieces: an edge cut with pinking shears, a photo set in such an edge, a
 * swatch of cloth for a cut-out sticker, and a satin ribbon behind the words that matter.
 */

/** A rectangle whose edges are cut with pinking shears, its teeth reaching `t * 0.55` outward. */
export function pinkedPath(c: Ctx, x: number, y: number, w: number, h: number, t = 16) {
  const pts: [number, number][] = [];
  const edge = (ax: number, ay: number, bx: number, by: number, nx: number, ny: number) => {
    const n = Math.max(2, Math.round(Math.hypot(bx - ax, by - ay) / t));
    for (let i = 0; i < n; i++) {
      const k = i / n;
      const out = i % 2 ? t * 0.55 : 0;
      pts.push([ax + (bx - ax) * k + nx * out, ay + (by - ay) * k + ny * out]);
    }
  };
  edge(x, y, x + w, y, 0, -1);
  edge(x + w, y, x + w, y + h, 1, 0);
  edge(x + w, y + h, x, y + h, 0, 1);
  edge(x, y + h, x, y, -1, 0);
  c.beginPath();
  pts.forEach(([px, py], i) => (i ? c.lineTo(px, py) : c.moveTo(px, py)));
  c.closePath();
}

/** The paper round a dressed photo: light on any cloth, so a photo always stands off it. */
export const photoPaper = (tone: Tone) => (tone.bg === "#F7ECE6" ? "#FFFDFB" : "#F7ECE6");

/**
 * A pinked mount inside a box (x, y, w, h): its paper with a shadow, a stitched line round the
 * picture, and the box the picture itself takes. The teeth stay inside the box.
 */
export function pinkedMount(
  c: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  thread: string,
): { x: number; y: number; w: number; h: number } {
  const teeth = 9;
  const b = 20;
  c.save();
  c.shadowColor = "rgba(0,0,0,.32)";
  c.shadowBlur = 28;
  c.shadowOffsetY = 12;
  pinkedPath(c, x + teeth, y + teeth, w - teeth * 2, h - teeth * 2, 16);
  c.fillStyle = fill;
  c.fill();
  c.restore();
  const inner = {
    x: x + teeth + b,
    y: y + teeth + b,
    w: w - (teeth + b) * 2,
    h: h - (teeth + b) * 2,
  };
  c.save();
  c.strokeStyle = thread;
  c.lineWidth = 3.5;
  c.setLineDash([14, 9]);
  c.strokeRect(inner.x - b / 2, inner.y - b / 2, inner.w + b, inner.h + b);
  c.restore();
  return inner;
}

/**
 * A satin ribbon across the post's middle with words on it, its ends cut in a V. The words shrink
 * to fit the ribbon on one line. The answer is the ribbon's height.
 */
export function ribbon(
  c: Ctx,
  text: string,
  cx: number,
  cy: number,
  maxW: number,
  family: string,
  fill: string,
  ink: string,
  tilt = -0.02,
): number {
  const words = text.replace(/\*/g, "").trim();
  if (!words) return 0;
  let size = 64;
  for (; size > 34; size -= 2) {
    c.font = `700 ${size}px ${family}`;
    if (c.measureText(words).width + 110 <= maxW) break;
  }
  c.font = `700 ${size}px ${family}`;
  const h = Math.round(size * 1.62);
  const w = Math.min(maxW, c.measureText(words).width + 110);
  const n = 28;
  c.save();
  c.translate(cx, cy);
  c.rotate(tilt);
  c.shadowColor = "rgba(0,0,0,.22)";
  c.shadowBlur = 14;
  c.shadowOffsetY = 6;
  c.beginPath();
  c.moveTo(-w / 2, -h / 2);
  c.lineTo(w / 2, -h / 2);
  c.lineTo(w / 2 - n, 0);
  c.lineTo(w / 2, h / 2);
  c.lineTo(-w / 2, h / 2);
  c.lineTo(-w / 2 + n, 0);
  c.closePath();
  c.fillStyle = fill;
  c.fill();
  c.shadowColor = "transparent";
  c.strokeStyle = ink;
  c.globalAlpha = 0.45;
  c.lineWidth = 3;
  c.setLineDash([12, 8]);
  c.beginPath();
  c.moveTo(-w / 2 + n + 4, -h / 2 + 11);
  c.lineTo(w / 2 - n - 4, -h / 2 + 11);
  c.moveTo(-w / 2 + n + 4, h / 2 - 11);
  c.lineTo(w / 2 - n - 4, h / 2 - 11);
  c.stroke();
  c.globalAlpha = 1;
  c.setLineDash([]);
  c.fillStyle = ink;
  c.textAlign = "center";
  c.direction = "rtl";
  c.fillText(words, 0, size * 0.36);
  c.restore();
  return h;
}
