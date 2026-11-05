import { AR } from "./tones";
import { centredLines, drawLogo, fit, sewnTag } from "./text";
import { DARK } from "./sticker-kit";
import type { Ctx, Tone } from "./types";

/* Drawings sewn in thread on the post's own cloth, so they take its tone. */

export function threadPen(c: Ctx, tone: Pick<Tone, "ink">, dash: number[] = [20, 13], width = 9) {
  c.strokeStyle = tone.ink;
  c.lineWidth = width;
  c.lineCap = "round";
  c.lineJoin = "round";
  c.setLineDash(dash);
}
export function knot(
  c: Ctx,
  x: number,
  y: number,
  rx: number,
  ry: number,
  tone: Pick<Tone, "ink">,
  rot = 0,
) {
  c.beginPath();
  c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  c.fillStyle = tone.ink;
  c.fill();
}
export function upright(c: Ctx, flipped: boolean, cx: number, draw: () => void) {
  /* Words and the logo read the right way round even when the drawing is flipped. */
  c.save();
  if (flipped) {
    c.translate(cx, 0);
    c.scale(-1, 1);
    c.translate(-cx, 0);
  }
  draw();
  c.restore();
}
export function sewnWords(
  c: Ctx,
  text: string | undefined,
  cx: number,
  cy: number,
  maxW: number,
  maxH: number,
  tone: Tone,
  flipped: boolean,
) {
  if (!text) return;
  upright(c, flipped, cx, () => {
    c.setLineDash([]);
    const layout = { ...fit(c, text, AR, 700, 46, 22, maxW, maxH, 1.25), noTag: true };
    const h = layout.lines.length * layout.size * layout.lh;
    centredLines(c, layout, cx, cy - h / 2 - layout.size * 0.1, { ...tone, ink: tone.tagInk });
  });
}
export function sewnBag(
  c: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  tilt: number,
  tone: Tone,
  flipped: boolean,
) {
  c.save();
  c.translate(x + w / 2, y + h / 2);
  c.rotate(tilt);
  c.setLineDash([]);
  sewnTag(c, -w / 2, -h / 2, w, h, tone.tag, tone.tagInk, 0);
  upright(c, flipped, 0, () => drawLogo(c, -w * 0.25, -h * 0.13, w * 0.5, tone.tagInk));
  c.restore();
}
export function needleAndGround(c: Ctx, x1: number, x2: number, y: number, tone: Tone) {
  threadPen(c, tone);
  c.beginPath();
  c.moveTo(x1, y);
  c.lineTo(x2, y);
  c.stroke();
  c.setLineDash([]);
  c.save();
  c.translate(x2 + 8, y - 8);
  c.rotate(-0.42);
  c.beginPath();
  c.moveTo(0, -6);
  c.lineTo(84, 0);
  c.lineTo(0, 6);
  c.quadraticCurveTo(-13, 0, 0, -6);
  c.closePath();
  c.fillStyle = "#D5D6DA";
  c.fill();
  c.lineWidth = 3;
  c.strokeStyle = DARK;
  c.stroke();
  c.beginPath();
  c.ellipse(1, 0, 6, 2.4, 0, 0, Math.PI * 2);
  c.fillStyle = DARK;
  c.fill();
  c.restore();
}
