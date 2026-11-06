/* A picture meant for paper: its pixels per inch are written into the file, so a printer or a
   print shop sets it at its true size without asking. */

export const PRINT_DPI = 300;
export const A4_MM = { w: 210, h: 297 } as const;

export function mmToPx(mm: number, dpi = PRINT_DPI): number {
  return Math.round((mm / 25.4) * dpi);
}

let crcTable: Uint32Array | null = null;
function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const IHDR_END = 8 + 4 + 4 + 13 + 4;

/** The same PNG with a `pHYs` chunk after its header; a file that is not a PNG comes back as it was. */
export function withPngDpi(png: Uint8Array, dpi = PRINT_DPI): Uint8Array {
  if (png.length < IHDR_END || !PNG_SIGNATURE.every((b, i) => png[i] === b)) return png;
  const perMetre = Math.round(dpi / 0.0254);
  const chunk = new Uint8Array(4 + 4 + 9 + 4);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4); // "pHYs"
  view.setUint32(8, perMetre);
  view.setUint32(12, perMetre);
  chunk[16] = 1; // metres
  view.setUint32(17, crc32(chunk.subarray(4, 17)));
  const out = new Uint8Array(png.length + chunk.length);
  out.set(png.subarray(0, IHDR_END), 0);
  out.set(chunk, IHDR_END);
  out.set(png.subarray(IHDR_END), IHDR_END + chunk.length);
  return out;
}

/** A canvas as a print-ready PNG blob, or null when the browser cannot make one. */
export async function canvasToPrintPng(canvas: HTMLCanvasElement): Promise<Blob | null> {
  const blob = await new Promise<Blob | null>((resolve) => {
    try {
      canvas.toBlob(resolve, "image/png");
    } catch {
      resolve(null);
    }
  });
  if (!blob) return null;
  const bytes = withPngDpi(new Uint8Array(await blob.arrayBuffer()));
  return new Blob([bytes as BlobPart], { type: "image/png" });
}

export type GridCell = { x: number; y: number };
export type Grid = { cols: number; rows: number; cells: GridCell[] };

/** Squares of one size laid in rows on a sheet, as many as fit inside its margin, centred. */
export function gridLayout(
  sheetW: number,
  sheetH: number,
  margin: number,
  cell: number,
  gap: number,
): Grid {
  const cols = Math.max(0, Math.floor((sheetW - margin * 2 + gap) / (cell + gap)));
  const rows = Math.max(0, Math.floor((sheetH - margin * 2 + gap) / (cell + gap)));
  const x0 = (sheetW - (cols * cell + Math.max(0, cols - 1) * gap)) / 2;
  const y0 = (sheetH - (rows * cell + Math.max(0, rows - 1) * gap)) / 2;
  const cells: GridCell[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++)
      cells.push({ x: x0 + c * (cell + gap), y: y0 + r * (cell + gap) });
  }
  return { cols, rows, cells };
}

export function chunk<T>(items: T[], size: number): T[][] {
  if (size < 1) return [items];
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += size) pages.push(items.slice(i, i + size));
  return pages;
}
