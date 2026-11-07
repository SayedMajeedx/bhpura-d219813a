import { STICKERS, stickerCanvas } from "./stickers";
import { A4_MM, PRINT_DPI, chunk, gridLayout, mmToPx } from "./print-png";
import type { Ctx } from "./types";

/* The kit's die-cut stickers on A4 sheets to print on sticker paper. */

const SHEET = { w: mmToPx(A4_MM.w), h: mmToPx(A4_MM.h) };
const MARGIN = mmToPx(8);
const GAP = mmToPx(3);
/** One sticker's square on the sheet: 4.2 cm, big enough to read its words in a hand. */
export const STICKER_CELL = mmToPx(42);

/** Every sticker that is a single die-cut shape: not a stitched scene, not a photo, not typed text. */
export function printableStickerIds(): string[] {
  return Object.entries(STICKERS)
    .filter(([, def]) => def.art && !def.stitch && !def.photoCard && !def.text)
    .map(([id]) => id);
}

export function stickersPerSheet(): number {
  return gridLayout(SHEET.w, SHEET.h, MARGIN, STICKER_CELL, GAP).cells.length;
}

export function stickerPages(ids = printableStickerIds()): string[][] {
  return chunk(ids, stickersPerSheet());
}

export function renderStickerSheet(canvas: HTMLCanvasElement, ids: string[], cutLine: boolean) {
  canvas.width = SHEET.w;
  canvas.height = SHEET.h;
  const c = canvas.getContext("2d") as Ctx;
  c.fillStyle = "#fff";
  c.fillRect(0, 0, SHEET.w, SHEET.h);
  const { cells } = gridLayout(SHEET.w, SHEET.h, MARGIN, STICKER_CELL, GAP);
  ids.slice(0, cells.length).forEach((id, i) => {
    c.drawImage(stickerCanvas(id), cells[i].x, cells[i].y, STICKER_CELL, STICKER_CELL);
    if (cutLine) {
      // A straight line round each one, so a sheet is cut with a ruler and every corner is square.
      c.strokeStyle = "#8A7F82";
      c.lineWidth = 2;
      c.strokeRect(cells[i].x, cells[i].y, STICKER_CELL, STICKER_CELL);
    }
  });
}

/** One sticker on its own with see-through edges, for a print shop or a cutting machine. */
export function renderSingleSticker(canvas: HTMLCanvasElement, id: string) {
  const art = stickerCanvas(id);
  canvas.width = art.width;
  canvas.height = art.height;
  (canvas.getContext("2d") as Ctx).drawImage(art, 0, 0);
}

export { PRINT_DPI };
