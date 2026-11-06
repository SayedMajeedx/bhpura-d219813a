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

const cutCache: Record<string, HTMLCanvasElement> = {};
/** The sticker with a hairline just outside its white edge: where the scissors or the machine go. */
function withCutLine(id: string): HTMLCanvasElement {
  if (cutCache[id]) return cutCache[id];
  const src = stickerCanvas(id);
  const out = document.createElement("canvas");
  out.width = src.width;
  out.height = src.height;
  const silhouette = document.createElement("canvas");
  silhouette.width = src.width;
  silhouette.height = src.height;
  const sc = silhouette.getContext("2d") as Ctx;
  sc.drawImage(src, 0, 0);
  sc.globalCompositeOperation = "source-in";
  sc.fillStyle = "#8A7F82";
  sc.fillRect(0, 0, src.width, src.height);
  const oc = out.getContext("2d") as Ctx;
  const r = 4;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    oc.drawImage(silhouette, Math.cos(a) * r, Math.sin(a) * r);
  }
  oc.drawImage(src, 0, 0);
  cutCache[id] = out;
  return out;
}

export function renderStickerSheet(canvas: HTMLCanvasElement, ids: string[], cutLine: boolean) {
  canvas.width = SHEET.w;
  canvas.height = SHEET.h;
  const c = canvas.getContext("2d") as Ctx;
  c.fillStyle = "#fff";
  c.fillRect(0, 0, SHEET.w, SHEET.h);
  const { cells } = gridLayout(SHEET.w, SHEET.h, MARGIN, STICKER_CELL, GAP);
  ids.slice(0, cells.length).forEach((id, i) => {
    const art = cutLine ? withCutLine(id) : stickerCanvas(id);
    c.drawImage(art, cells[i].x, cells[i].y, STICKER_CELL, STICKER_CELL);
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
