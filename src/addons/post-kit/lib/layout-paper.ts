import { parseRows } from "./layout-piece";
import { handle, sideNote, stitchedFrame, wordmark } from "./frame";
import { centredLines, drawText, fit, roundRect, wrap } from "./text";
import { AR, HAND } from "./tones";
import type { Ctx, Geometry, PaperLook, Post, TextLayout, Tone } from "./types";

/**
 * Shammoua's papers: one paper on the cloth, in three looks. A receipt is rows and a total on a
 * torn slip, a circular is a body of words, and a licence is rows on a bordered card. The sheet's
 * ink is its own, so a post reads the same on any of the four cloths.
 */
export const PAPER_LOOKS: Record<PaperLook, { ar: string; en: string }> = {
  receipt: { ar: "فاتورة", en: "Receipt" },
  circular: { ar: "تعميم", en: "Circular" },
  licence: { ar: "رخصة", en: "Licence" },
};

export const paperLook = (post: Pick<Post, "paper">): PaperLook => post.paper ?? "receipt";

const SHEET = "#FFFDFB";
const SHEET_INK = "#231517";
const SHEET_RED = "#3C0A1B";

function dashedLine(c: Ctx, x1: number, x2: number, y: number, color: string) {
  c.save();
  c.strokeStyle = color;
  c.lineWidth = 3;
  c.setLineDash([14, 11]);
  c.lineCap = "round";
  c.beginPath();
  c.moveTo(x1, y);
  c.lineTo(x2, y);
  c.stroke();
  c.restore();
}

/** A slip's foot, torn in teeth; a licence and a circular keep a straight edge. */
function sheetPath(c: Ctx, w: number, h: number, torn: boolean) {
  if (!torn) {
    roundRect(c, 0, 0, w, h, 12);
    return;
  }
  const tooth = 34;
  c.beginPath();
  c.moveTo(0, 0);
  c.lineTo(w, 0);
  c.lineTo(w, h);
  for (let x = w; x > 0; x -= tooth) {
    c.lineTo(Math.max(0, x - tooth / 2), h - 16);
    c.lineTo(Math.max(0, x - tooth), h);
  }
  c.closePath();
}

type Row = { name: string; value: string; nameL: TextLayout; valueL: TextLayout };

/** Rows that fit their room: a name at the start, its value at the end, each wrapping on its own. */
function layoutRows(c: Ctx, items: string | undefined, w: number, room: number) {
  const rows = parseRows(items);
  const lh = 1.34;
  let size = 46;
  let laid: Row[] = [];
  let height = 0;
  for (; size >= 26; size -= 2) {
    c.font = `600 ${size}px ${AR}`;
    const base = { size, lh, family: AR, weight: 600, noTag: true };
    laid = rows.map((row) => ({
      ...row,
      nameL: { ...wrap(c, row.name, w * 0.5), ...base },
      valueL: { ...wrap(c, row.value, row.name ? w * 0.46 : w), ...base },
    }));
    height = laid.reduce(
      (sum, row) =>
        sum + Math.max(row.nameL.lines.length, row.valueL.lines.length) * size * lh + 22,
      0,
    );
    if (height <= room) break;
  }
  return { laid, height };
}

function drawRows(
  c: Ctx,
  laid: Row[],
  left: number,
  right: number,
  top: number,
  tone: Tone,
  valueColor: string,
) {
  let y = top;
  laid.forEach((row) => {
    if (row.name) drawText(c, row.nameL, right, y, tone);
    row.valueL.lines.forEach((line, i) => {
      const at = row.name ? left + line.w : right;
      const lineTop = y + i * row.valueL.size * row.valueL.lh;
      drawText(c, { ...row.valueL, lines: [line] }, at, lineTop, tone, valueColor);
    });
    y +=
      Math.max(row.nameL.lines.length, row.valueL.lines.length) * row.valueL.size * row.valueL.lh +
      22;
  });
  return y;
}

function drawStamp(c: Ctx, text: string, x: number, y: number) {
  c.save();
  c.translate(x, y);
  c.rotate(-0.2);
  c.font = `700 44px ${AR}`;
  const w = c.measureText(text).width + 56;
  c.globalAlpha = 0.78;
  c.strokeStyle = SHEET_RED;
  c.lineWidth = 6;
  roundRect(c, -w / 2, -42, w, 84, 12);
  c.stroke();
  c.lineWidth = 2;
  roundRect(c, -w / 2 + 9, -33, w - 18, 66, 8);
  c.stroke();
  c.fillStyle = SHEET_RED;
  c.textAlign = "center";
  c.fillText(text, 0, 16);
  c.restore();
}

export function drawPaper(c: Ctx, s: Post, g: Geometry, tone: Tone) {
  stitchedFrame(c, g, tone);
  wordmark(c, g, tone);
  handle(c, g, tone);
  const look = paperLook(s);
  const x = g.M - 30;
  const w = g.W - x * 2;
  const pad = 52;
  const top = g.T - 4;
  const roomAll = g.B - top - 12;
  const innerW = w - pad * 2;
  const paper: Tone = {
    ...tone,
    ink: SHEET_INK,
    sub: "#7A3B4E",
    tag: SHEET_RED,
    tagInk: "#F7ECE6",
  };

  // Measured first: the sheet is as tall as its words, and what is left of the cloth is for stickers.
  const title = {
    ...fit(c, s.head, AR, 700, look === "circular" ? 88 : 72, 44, innerW, 170, 1.24),
    noTag: true,
  };
  const titleH = title.lines.length * title.size * title.lh;
  const lead = s.lead
    ? { ...fit(c, s.lead, AR, 500, 32, 24, innerW, 90, 1.34), noTag: true }
    : null;
  const leadH = lead ? lead.lines.length * lead.size * lead.lh + 8 : 0;
  const headH = 34 + (look === "circular" ? leadH + titleH : titleH + leadH) + 28;
  const footH = s.foot ? 96 : 0;
  const stampH = s.stamp ? 110 : 0;
  const totalRow = look === "receipt" && s.total ? parseRows(s.total)[0] : undefined;
  const totalH = totalRow ? 104 : 0;
  const room = roomAll - headH - footH - stampH - totalH - 60;

  const body =
    look === "circular"
      ? (() => {
          const layout = fit(c, s.items, AR, 500, 70, 32, innerW, Math.min(room, 560), 1.62);
          return { layout, height: layout.lines.length * layout.size * layout.lh };
        })()
      : null;
  const rows = body ? null : layoutRows(c, s.items, innerW, Math.min(room, 560));
  const bodyH = body ? body.height : (rows?.height ?? 0);
  const h = Math.min(roomAll, headH + bodyH + totalH + footH + stampH + 46);

  c.save();
  c.translate(x + w / 2, top + h / 2);
  c.rotate(look === "licence" ? 0.008 : -0.01);
  c.translate(-w / 2, -h / 2);
  c.save();
  c.shadowColor = "rgba(20,5,10,.28)";
  c.shadowBlur = 30;
  c.shadowOffsetY = 12;
  c.fillStyle = SHEET;
  sheetPath(c, w, h, look === "receipt");
  c.fill();
  c.restore();
  if (look === "licence") {
    c.save();
    c.strokeStyle = SHEET_RED;
    c.lineWidth = 4;
    c.setLineDash([18, 12]);
    c.lineCap = "round";
    roundRect(c, 18, 18, w - 36, h - 36, 8);
    c.stroke();
    c.restore();
  }

  const left = pad,
    right = w - pad,
    cx = w / 2;
  let y = 34;
  if (look === "circular" && lead) {
    y = drawText(c, lead, right, y, paper, paper.sub) + 8;
  }
  centredLines(c, title, cx, y, paper);
  y += titleH;
  if (look !== "circular" && lead) {
    y += 2;
    centredLines(c, lead, cx, y, { ...paper, ink: paper.sub });
    y += leadH;
  }
  y += 14;
  dashedLine(c, left, right, y, "rgba(42,18,25,.42)");
  y += 22;
  if (body) {
    y = drawText(c, body.layout, right, y, paper) + 8;
  } else if (rows) {
    y = drawRows(c, rows.laid, left, right, y, paper, SHEET_RED);
  }
  if (totalRow) {
    dashedLine(c, left, right, y, "rgba(42,18,25,.42)");
    c.fillStyle = SHEET_RED;
    c.font = `700 54px ${AR}`;
    c.textAlign = "right";
    c.fillText(totalRow.name, right, y + 70);
    c.textAlign = "left";
    c.fillText(totalRow.value, left, y + 70);
    y += totalH;
  }
  if (s.foot) {
    y = sideNote(c, s.foot, right, y + 6, innerW, paper, look === "circular" ? 46 : 36) + 6;
  }
  if (s.stamp) drawStamp(c, s.stamp, left + 150, y + 54);
  if (look === "circular") {
    c.font = `600 32px ${HAND}`;
    c.fillStyle = paper.sub;
    c.textAlign = "right";
    c.fillText("إدارة شمّوعة", right, y + 62);
  }
  c.restore();
}
