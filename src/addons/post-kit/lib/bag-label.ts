import { HAND, TONES } from "./tones";
import { drawLogo } from "./text";
import { A4_MM, gridLayout, mmToPx } from "./print-png";
import { STICKERS } from "./stickers";
import { DARK, googly, hangerBody, mouth, roundRectPath } from "./sticker-kit";
import type { Ctx } from "./types";

/* The label for the bag of every order: Shammoua says "ملبوس العافية" (wear it in good health),
   which is what Gulf Arabic says to someone in something new. Drawn in a 1000 box. */

export const BAG_WORDS = "ملبوس العافية";
export const BAG_SIZES_MM = [60, 80, 90] as const;
export type BagSize = (typeof BAG_SIZES_MM)[number];

const WINE = "#3C0A1B";
const CREAM = "#F7ECE6";
const SAND = "#D8B992";

function heart(c: Ctx, x: number, y: number, k: number, fill: string) {
  c.save();
  c.translate(x, y);
  c.scale(k, k);
  c.beginPath();
  c.moveTo(0, 14);
  c.bezierCurveTo(-34, -10, -16, -34, 0, -14);
  c.bezierCurveTo(16, -34, 34, -10, 0, 14);
  c.closePath();
  c.fillStyle = fill;
  c.fill();
  c.lineWidth = 4;
  c.lineJoin = "round";
  c.strokeStyle = DARK;
  c.stroke();
  c.restore();
}

export function drawBagLabel(c: Ctx, handle = "@puraline.bh") {
  c.save();
  c.beginPath();
  roundRectPath(c, 0, 0, 1000, 1000, 96);
  c.clip();
  c.fillStyle = CREAM;
  c.fillRect(0, 0, 1000, 1000);

  // The stitched border, as on every Pura post.
  c.strokeStyle = "rgba(60,10,27,.45)";
  c.lineWidth = 5;
  c.setLineDash([24, 17]);
  c.lineCap = "round";
  c.beginPath();
  roundRectPath(c, 34, 34, 932, 932, 70);
  c.stroke();
  c.setLineDash([]);

  // The bubble: what she says, large.
  c.lineJoin = "round";
  c.lineWidth = 8;
  c.strokeStyle = DARK;
  c.fillStyle = "#fff";
  c.beginPath();
  roundRectPath(c, 96, 92, 808, 236, 92);
  c.fill();
  c.stroke();
  c.beginPath();
  c.moveTo(596, 322);
  c.lineTo(618, 410);
  c.lineTo(694, 322);
  c.closePath();
  c.fill();
  c.stroke();
  c.beginPath();
  c.moveTo(602, 325);
  c.lineTo(688, 325);
  c.lineWidth = 12;
  c.strokeStyle = "#fff";
  c.stroke();

  c.fillStyle = WINE;
  c.direction = "rtl";
  c.textAlign = "center";
  c.textBaseline = "middle";
  let size = 170;
  do {
    c.font = `700 ${size}px ${HAND}`;
    size -= 4;
  } while (c.measureText(BAG_WORDS).width > 700 && size > 40);
  c.fillText(BAG_WORDS, 500, 214);

  // Shammoua, pleased with herself.
  c.save();
  c.translate(260, 346);
  c.scale(1.6, 1.6);
  hangerBody(c);
  googly(c, 122, 182, 27, 0.15, 0.25);
  googly(c, 178, 182, 27, 0.15, 0.25);
  mouth.smile(c, 150, 222);
  c.globalAlpha = 0.55;
  c.fillStyle = "#E58A94";
  [92, 208].forEach((x) => {
    c.beginPath();
    c.ellipse(x, 212, 13, 8, 0, 0, Math.PI * 2);
    c.fill();
  });
  c.restore();

  heart(c, 180, 560, 1.5, "#C8506A");
  heart(c, 128, 650, 1, SAND);
  heart(c, 840, 600, 1.3, SAND);
  c.save();
  c.translate(790, 420);
  c.scale(0.34, 0.34);
  STICKERS.sparkle.art?.(c, TONES.wine, "", false);
  c.restore();
  c.save();
  c.translate(60, 380);
  c.scale(0.26, 0.26);
  STICKERS.sparkle.art?.(c, TONES.wine, "", false);
  c.restore();

  // The foot: the sewn note, the logo, the account.
  c.fillStyle = WINE;
  c.fillRect(0, 790, 1000, 210);
  drawLogo(c, 398, 826, 204, CREAM);
  c.direction = "ltr";
  c.font = `600 34px ${HAND}`;
  c.fillStyle = SAND;
  c.fillText(handle, 500, 944);
  c.textBaseline = "alphabetic";
  c.restore();
}

/** One label at a real size, with see-through corners. */
export function renderBagLabel(canvas: HTMLCanvasElement, mm: number, handle?: string) {
  const px = mmToPx(mm);
  canvas.width = px;
  canvas.height = px;
  const c = canvas.getContext("2d") as Ctx;
  c.clearRect(0, 0, px, px);
  c.save();
  c.scale(px / 1000, px / 1000);
  drawBagLabel(c, handle);
  c.restore();
}

const SHEET_MARGIN_MM = 8;
const SHEET_GAP_MM = 4;

export function bagLabelsPerSheet(mm: number): number {
  return gridLayout(
    mmToPx(A4_MM.w),
    mmToPx(A4_MM.h),
    mmToPx(SHEET_MARGIN_MM),
    mmToPx(mm),
    mmToPx(SHEET_GAP_MM),
  ).cells.length;
}

/** A4 of the same label to cut apart, as many as fit. */
export function renderBagLabelSheet(canvas: HTMLCanvasElement, mm: number, handle?: string) {
  const W = mmToPx(A4_MM.w);
  const H = mmToPx(A4_MM.h);
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext("2d") as Ctx;
  c.fillStyle = "#fff";
  c.fillRect(0, 0, W, H);
  const px = mmToPx(mm);
  const one = document.createElement("canvas");
  renderBagLabel(one, mm, handle);
  gridLayout(W, H, mmToPx(SHEET_MARGIN_MM), px, mmToPx(SHEET_GAP_MM)).cells.forEach((cell) => {
    c.drawImage(one, cell.x, cell.y, px, px);
  });
}
