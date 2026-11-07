import { coverImage, handle, photoCrop, stitchedFrame, wordmark } from "./frame";
import { parseRows } from "./layout-piece";
import { centredLines, drawText, fit, roundRect, sewnTag, wrap } from "./text";
import { AR, HAND } from "./tones";
import type { Ctx, Geometry, PhotoBook, Post, TextLayout, Tone } from "./types";

/* The funny series' layouts: a grid of cells, a split frame, a comment answered and a customer's words. */

const dashes = (c: Ctx, color: string, width = 4) => {
  c.strokeStyle = color;
  c.lineWidth = width;
  c.setLineDash([16, 12]);
  c.lineCap = "round";
};

/** A cell of a grid. `*words*` fills it, as a bingo card's free square. */
export function readCell(raw: string) {
  const marked = /^\*.*\*$/.test(raw);
  return { marked, text: marked ? raw.slice(1, -1).trim() : raw };
}

/** Nine cells at most: two columns while four or fewer fit, three after. */
export function gridShape(count: number) {
  const cols = count <= 4 ? 2 : 3;
  return { cols, rows: Math.max(1, Math.ceil(count / cols)) };
}

export function drawGrid(c: Ctx, s: Post, g: Geometry, tone: Tone) {
  stitchedFrame(c, g, tone);
  wordmark(c, g, tone);
  handle(c, g, tone);
  const right = g.W - g.M,
    w = g.W - g.M * 2;
  const head = fit(c, s.head, AR, 700, 76, 44, w, 180, 1.3);
  const top = drawText(c, head, right, g.T, tone) + 26;
  const footH = s.foot ? 80 : 0;
  const lines = String(s.items || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 9);
  const cells = lines.map(readCell).map((cell) => ({ ...cell, ...parseRows(cell.text)[0] }));
  const { cols, rows } = gridShape(cells.length);
  const gap = 14;
  const cw = (w - gap * (cols - 1)) / cols;
  const ch = (g.B - top - footH - gap * (rows - 1)) / rows;
  const pad = 18;
  const lh = 1.3;

  // One size for every cell, so a long one does not shout over the rest.
  let size = cols === 3 ? 42 : 58;
  const layOut = (text: string | undefined, weight: number, family: string, at: number) => {
    c.font = `${weight} ${at}px ${family}`;
    return {
      ...wrap(c, text, cw - pad * 2),
      size: at,
      lh,
      family,
      weight,
      noTag: true,
    } as TextLayout;
  };
  const heightOf = (cell: (typeof cells)[number], at: number) =>
    (cell.name ? layOut(cell.name, 700, AR, at).lines.length * at * lh + 6 : 0) +
    layOut(cell.value, 600, HAND, cell.name ? at - 6 : at).lines.length *
      (cell.name ? at - 6 : at) *
      lh;
  for (; size > 20; size -= 2) {
    if (cells.every((cell) => heightOf(cell, size) <= ch - pad * 2)) break;
  }

  cells.forEach((cell, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = right - cw - col * (cw + gap);
    const y = top + row * (ch + gap);
    c.save();
    roundRect(c, x, y, cw, ch, 12);
    if (cell.marked) {
      c.fillStyle = tone.tag;
      c.fill();
    } else {
      dashes(c, tone.stitch);
      c.stroke();
    }
    c.restore();
    const ink = cell.marked ? { ...tone, ink: tone.tagInk } : tone;
    const cx = x + cw / 2;
    let at = y + (ch - heightOf(cell, size)) / 2;
    if (cell.name) {
      const name = layOut(cell.name, 700, AR, size);
      centredLines(c, name, cx, at, cell.marked ? ink : { ...ink, ink: tone.sub });
      at += name.lines.length * size * lh + 6;
    }
    centredLines(c, layOut(cell.value, 600, HAND, cell.name ? size - 6 : size), cx, at, ink);
  });

  if (s.foot) {
    const foot = { ...fit(c, s.foot, HAND, 600, 42, 26, w, 70, 1.3), noTag: true };
    centredLines(c, foot, g.W / 2, g.B - 62, { ...tone, ink: tone.sub });
  }
}

export function drawSplit(c: Ctx, s: Post, g: Geometry, tone: Tone) {
  stitchedFrame(c, g, tone);
  wordmark(c, g, tone);
  handle(c, g, tone);
  const right = g.W - g.M,
    w = g.W - g.M * 2;
  const gap = 22;
  const panelH = (g.B - g.T - gap - 16) / 2;
  const pad = 40;
  const panel = (
    y: number,
    small: string | undefined,
    big: string | undefined,
    filled: boolean,
  ) => {
    c.save();
    roundRect(c, g.M, y, w, panelH, 14);
    if (filled) {
      c.fillStyle = tone.tag;
      c.fill();
    } else {
      dashes(c, tone.stitch);
      c.stroke();
    }
    c.restore();
    const ink: Tone = filled
      ? { ...tone, ink: tone.tagInk, tag: tone.ink, tagInk: tone.tag, sub: tone.tagInk }
      : tone;
    const innerW = w - pad * 2;
    const label = small
      ? { ...fit(c, small, AR, 500, 40, 28, innerW, 60, 1.3), noTag: true }
      : null;
    const labelH = label ? label.lines.length * label.size * label.lh + 12 : 0;
    const body = fit(c, big, AR, 700, 76, 40, innerW, panelH - pad * 2 - labelH, 1.42);
    const bodyH = body.lines.length * body.size * body.lh;
    let at = y + (panelH - labelH - bodyH) / 2;
    if (label) {
      drawText(c, label, right - pad, at, ink, ink.sub);
      at += labelH;
    }
    drawText(c, body, right - pad, at, ink);
  };
  panel(g.T + 8, s.labelA, s.head, false);
  panel(g.T + 8 + panelH + gap, s.labelB, s.foot, true);
}

export function drawReply(c: Ctx, s: Post, g: Geometry, tone: Tone) {
  stitchedFrame(c, g, tone);
  wordmark(c, g, tone);
  handle(c, g, tone);
  const right = g.W - g.M,
    w = g.W - g.M * 2;
  const paper: Tone = { ...tone, ink: "#171214", sub: "#5C2436" };
  const maxW = w * 0.86;
  const small = s.lead
    ? { ...fit(c, s.lead, AR, 500, 30, 24, maxW - 72, 44, 1.3), noTag: true }
    : null;
  const smallH = small ? small.size * small.lh * small.lines.length + 6 : 0;
  const body = { ...fit(c, s.head, AR, 600, 68, 40, maxW - 72, 300, 1.34), noTag: true };
  const bodyW = Math.max(0, ...body.lines.map((line) => line.w));
  const bubbleW = Math.max(bodyW + 72, 340);
  const bubbleH = smallH + body.lines.length * body.size * body.lh + 52;
  const top = g.T + 6;

  c.save();
  c.shadowColor = "rgba(20,5,10,.24)";
  c.shadowBlur = 22;
  c.shadowOffsetY = 8;
  c.fillStyle = "#FFFFFF";
  roundRect(c, right - bubbleW, top, bubbleW, bubbleH, 34);
  c.fill();
  c.shadowColor = "transparent";
  // The bubble's tail, on the commenter's side.
  c.beginPath();
  c.moveTo(right - 70, top + bubbleH - 2);
  c.lineTo(right - 22, top + bubbleH + 34);
  c.lineTo(right - 30, top + bubbleH - 2);
  c.closePath();
  c.fill();
  c.restore();

  let y = top + 22;
  if (small) y = drawText(c, small, right - 36, y, paper, paper.sub) + 6;
  drawText(c, body, right - 36, y, paper);

  const answerTop = top + bubbleH + 62;
  const answer = fit(c, s.items, AR, 500, 60, 34, w, (g.B - answerTop) * 0.62, 1.5);
  drawText(c, answer, right, answerTop, tone);
}

export function drawProof(c: Ctx, s: Post, g: Geometry, tone: Tone, photos: PhotoBook) {
  stitchedFrame(c, g, tone);
  wordmark(c, g, tone);
  handle(c, g, tone);
  const right = g.W - g.M,
    w = g.W - g.M * 2;
  const img = photos[s.photo1 ?? ""]?.img;
  let y = g.T + 6;
  if (img) {
    const h = Math.min(w * 0.72, (g.B - g.T) * 0.5);
    c.save();
    c.translate(g.M + w / 2, y + h / 2);
    c.rotate(-0.01);
    c.translate(-w / 2, -h / 2);
    c.fillStyle = "#FFFDFB";
    roundRect(c, 0, 0, w, h, 10);
    c.fill();
    coverImage(c, img, 14, 14, w - 28, h - 28, photoCrop(s, "photo1"));
    c.restore();
    y += h + 30;
  }
  c.fillStyle = tone.sub;
  c.font = `700 150px ${AR}`;
  c.textAlign = "right";
  c.fillText("”", right, y + 112);
  y += 96;
  const tagH = s.label ? 84 : 0;
  const leadH = s.lead ? 60 : 0;
  const room = g.B - y - tagH - leadH - 30;
  const quote = fit(c, s.head, AR, 600, 68, 34, w, room, 1.46);
  y = drawText(c, quote, right, y, tone) + 18;
  if (s.lead) {
    const lead = { ...fit(c, s.lead, HAND, 600, 40, 26, w, 54, 1.3), noTag: true };
    y = drawText(c, lead, right, y, tone, tone.sub) + 14;
  }
  if (s.label) {
    c.font = `600 34px ${AR}`;
    const textW = c.measureText(s.label).width;
    sewnTag(c, right - textW - 44, y, textW + 52, 72, tone.tag, tone.tagInk, 0.012);
    c.fillStyle = tone.tagInk;
    c.textAlign = "right";
    c.fillText(s.label, right - 18, y + 48);
  }
}
