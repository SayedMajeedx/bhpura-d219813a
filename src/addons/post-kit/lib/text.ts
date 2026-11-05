import { LOGO_PATHS } from "../content/logo";
import type { Ctx, TextLayout, Token, Tone, Wrapped } from "./types";

/* Laying out and drawing the posts' text: Arabic right to left, with English runs kept in their own order. */

function isLatin(t: string) {
  return (/[A-Za-z]/.test(t) || /^[-+−][\d.,]+$/.test(t)) && !/[\u0600-\u06FF]/.test(t);
}
const SPARK = "✨";
export function parseMarks(text: string | undefined): Omit<Token, "w">[][] {
  const lines = String(text || "").split("\n");
  return lines.map((line) => {
    const out: { t: string; mark: boolean }[] = [];
    line.split("*").forEach((part, i) => {
      part
        .split(/\s+/)
        .filter(Boolean)
        .forEach((t) => {
          const last = out[out.length - 1];
          const mark = i % 2 === 1;
          if (last && last.mark === mark && isLatin(last.t) && isLatin(t)) last.t += " " + t;
          else out.push({ t, mark });
        });
    });
    return out;
  });
}
function gapBetween(a: Pick<Token, "mark">, b: Pick<Token, "mark">, space: number, size: number) {
  return space + (a.mark !== b.mark ? size * 0.2 : 0);
}
export function wrap(ctx: Ctx, text: string | undefined, maxW: number): Wrapped {
  const space = ctx.measureText(" ").width * 1.1;
  const size = parseFloat((ctx.font.match(/([\d.]+)px/) || [])[1] ?? "") || 40;
  const lines: Wrapped["lines"] = [];
  parseMarks(text).forEach((tokens) => {
    const measured = tokens.map((tok) => ({
      ...tok,
      w: tok.t === SPARK ? size * 0.8 : ctx.measureText(tok.t).width,
    }));
    /* Units: a marked phrase is one unit while it fits on a line. */
    const units: Token[][] = [];
    measured.forEach((tok) => {
      const last = units[units.length - 1];
      if (tok.mark && last && last[0].mark) last.push(tok);
      else units.push([tok]);
    });
    const widthOf = (toks: Token[]) =>
      toks.reduce((sum, t, i) => sum + t.w + (i ? gapBetween(toks[i - 1], t, space, size) : 0), 0);
    const flat: Token[][] = [];
    units.forEach((u) => {
      if (widthOf(u) > maxW) u.forEach((t) => flat.push([t]));
      else flat.push(u);
    });
    let cur: Token[] = [];
    flat.forEach((u) => {
      if (cur.length && widthOf([...cur, ...u]) > maxW) {
        lines.push({ tokens: cur, w: widthOf(cur) });
        cur = [];
      }
      cur = [...cur, ...u];
    });
    if (cur.length) lines.push({ tokens: cur, w: widthOf(cur) });
  });
  return { lines, space };
}
export function fit(
  ctx: Ctx,
  text: string | undefined,
  family: string,
  weight: number,
  maxSize: number,
  minSize: number,
  maxW: number,
  maxH: number,
  lh: number,
): TextLayout {
  for (let size = maxSize; size >= minSize; size -= 4) {
    ctx.font = `${weight} ${size}px ${family}`;
    const layout = wrap(ctx, text, maxW);
    if (layout.lines.length * size * lh <= maxH) return { ...layout, size, lh, family, weight };
  }
  ctx.font = `${weight} ${minSize}px ${family}`;
  return { ...wrap(ctx, text, maxW), size: minSize, lh, family, weight };
}
function drawSpark(ctx: Ctx, x: number, y: number, r: number, color: string) {
  ctx.save();
  ctx.fillStyle = color;
  [
    [0, 0, r],
    [r * 1.05, -r * 0.85, r * 0.42],
    [-r * 0.95, r * 0.8, r * 0.3],
  ].forEach(([dx, dy, rr]) => {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4,
        q = i % 2 ? rr * 0.2 : rr;
      ctx.lineTo(x + dx + Math.sin(a) * q, y + dy - Math.cos(a) * q);
    }
    ctx.closePath();
    ctx.fill();
  });
  ctx.restore();
}
export function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
/* The sewn label behind a marked phrase: Pura's own mark, in place of a marker pen. */
export function sewnTag(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  thread: string,
  tilt = -0.012,
) {
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(tilt);
  ctx.translate(-w / 2, -h / 2);
  roundRect(ctx, 0, 0, w, h, 8);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = thread;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 3;
  ctx.setLineDash([13, 9]);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(10, 8);
  ctx.lineTo(w - 10, 8);
  ctx.moveTo(10, h - 8);
  ctx.lineTo(w - 10, h - 8);
  ctx.stroke();
  ctx.restore();
}
export function drawText(
  ctx: Ctx,
  layout: TextLayout,
  right: number,
  top: number,
  tone: Tone,
  color?: string,
) {
  const { size, lh, space } = layout;
  ctx.font = `${layout.weight} ${size}px ${layout.family}`;
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  let y = top + size * 1.02;
  layout.lines.forEach((line) => {
    let x = right;
    let run: { start: number; end: number } | null = null;
    const runs: { start: number; end: number }[] = [];
    line.tokens.forEach((tok, i) => {
      const start = x;
      x -= tok.w;
      if (tok.mark) {
        if (run) (run as { end: number }).end = x;
        else {
          run = { start, end: x };
          runs.push(run);
        }
      } else run = null;
      if (i < line.tokens.length - 1) x -= gapBetween(tok, line.tokens[i + 1], space, size);
    });
    if (!layout.noTag)
      runs.forEach((r) => {
        const pad = size * 0.17;
        sewnTag(
          ctx,
          r.end - pad,
          y - size * 0.98,
          r.start - r.end + pad * 2,
          size * 1.5,
          tone.tag,
          tone.tagInk,
        );
      });
    x = right;
    line.tokens.forEach((tok, i) => {
      ctx.fillStyle = tok.mark ? (layout.noTag ? tone.sub : tone.tagInk) : color || tone.ink;
      if (tok.t === SPARK) drawSpark(ctx, x - tok.w / 2, y - size * 0.32, size * 0.34, tone.sub);
      else {
        ctx.direction = isLatin(tok.t) ? "ltr" : "rtl";
        ctx.fillText(tok.t, x, y);
        ctx.direction = "rtl";
      }
      x -=
        tok.w + (i < line.tokens.length - 1 ? gapBetween(tok, line.tokens[i + 1], space, size) : 0);
    });
    y += size * lh;
  });
  return top + layout.lines.length * size * lh;
}
/* The logo's shapes are made on first use: a server has no Path2D. */
const LOGO_BOX = { x: 37.6, w: 1368.6, y: 60.18, h: 467.8 };
export const LOGO_RATIO = LOGO_BOX.h / LOGO_BOX.w;
let logoShapes: Path2D[] | null = null;
export function drawLogo(c: Ctx, x: number, y: number, width: number, color: string) {
  const k = width / LOGO_BOX.w;
  c.save();
  c.translate(x - LOGO_BOX.x * k, y - LOGO_BOX.y * k);
  c.scale(k, k);
  c.fillStyle = color;
  c.strokeStyle = color;
  c.lineWidth = 9;
  c.lineJoin = "round";
  (logoShapes ??= LOGO_PATHS.map((d) => new Path2D(d))).forEach((shape) => {
    c.fill(shape, "nonzero");
    c.stroke(shape);
  });
  c.restore();
}
export function centredLines(ctx: Ctx, layout: TextLayout, cx: number, top: number, tone: Tone) {
  layout.lines.forEach((line, i) => {
    drawText(
      ctx,
      { ...layout, lines: [line] },
      cx + line.w / 2,
      top + i * layout.size * layout.lh,
      tone,
    );
  });
}
