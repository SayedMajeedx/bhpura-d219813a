import type { Box } from "@/features/content-studio/engine/draw";
import { textDirection } from "@/features/content-studio/engine/text-layout";
import { ease, mix, progress } from "@/features/content-studio/engine/timeline";

/**
 * The motion kit the faster templates share: wipes, fast cuts between shots
 * with a punch and a slow drift, a split frame, a ticker, and headlines set
 * word by word in reading order (Arabic from the right, a Latin run inside it
 * left to right). Layout and timing are pure, so a frame at time t always
 * draws the same and can be checked without a canvas.
 */

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/**
 * The part of `box` a wipe has uncovered at progress `p` (0 hidden, 1 whole).
 * `from` is the side it starts at; "start" and "end" follow the reading
 * direction (in Arabic "start" is the right).
 */
export function wipeBox(
  box: Box,
  p: number,
  from: "start" | "end" | "top" | "bottom",
  rtl: boolean,
): Box {
  const k = clamp01(p);
  if (from === "top") return { ...box, h: box.h * k };
  if (from === "bottom") return { ...box, y: box.y + box.h * (1 - k), h: box.h * k };
  const fromLeft = (from === "start") !== rtl;
  const w = box.w * k;
  return { ...box, x: fromLeft ? box.x : box.x + box.w - w, w };
}

/** Clips everything drawn after it (until the next restore) to `box`. */
export function clipTo(ctx: CanvasRenderingContext2D, box: Box) {
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.w, box.h);
  ctx.clip();
}

/** Which shot of a cut sequence plays at `t`: its index, how far through it, and time since its cut. */
export type ShotTiming = { index: number; local: number; sinceCut: number };

/**
 * The shot playing at `t` in a run of `count` shots of `length` seconds from
 * `start`; the last one holds after the run ends. Null before the first cut.
 */
export function shotAt(
  t: number,
  { start, length, count }: { start: number; length: number; count: number },
): ShotTiming | null {
  if (count <= 0 || t < start || length <= 0) return null;
  const index = Math.min(count - 1, Math.floor((t - start) / length));
  const sinceCut = t - (start + index * length);
  return { index, local: clamp01(sinceCut / length), sinceCut };
}

/**
 * A shot's slow drift while it plays (`p` from 0 to 1): even shots push in,
 * odd ones pull out, and each drifts sideways the other way from the last,
 * so a run of cuts never moves the same way twice in a row.
 */
export function shotDrift(index: number, p: number): { zoom: number; focusX: number } {
  const k = ease.outCubic(clamp01(p));
  const pushIn = index % 2 === 0;
  const zoom = pushIn ? mix(1, 1.08, k) : mix(1.08, 1, k);
  const side = index % 2 === 0 ? 1 : -1;
  return { zoom, focusX: 0.5 + side * mix(-0.03, 0.03, k) };
}

/** The extra scale just after a cut (1 when settled): a short punch that makes a cut land. */
export function cutPunch(sinceCut: number, strength = 0.07, settle = 0.35): number {
  return 1 + strength * (1 - progress(sinceCut, 0, settle, ease.outExpo));
}

/**
 * A frame splitting in two along its height: at `p` 0 the first part is the
 * whole box, at 1 it has shrunk to `ratio` of it, and the second part fills
 * the rest (`gap` apart).
 */
export function splitBoxes(
  box: Box,
  p: number,
  { ratio, gap = 0 }: { ratio: number; gap?: number },
): { first: Box; second: Box } {
  const firstH = mix(box.h, box.h * ratio, clamp01(p));
  const secondY = box.y + firstH + gap * clamp01(p);
  return {
    first: { ...box, h: firstH },
    second: { ...box, y: secondY, h: Math.max(0, box.y + box.h - secondY) },
  };
}

/**
 * How far a ticker has scrolled at `t` (pixels per second `speed`), wrapped
 * to one cycle of `cycle` pixels so it loops without a jump.
 */
export function tickerOffset(t: number, speed: number, cycle: number): number {
  if (cycle <= 0) return 0;
  return (((t * speed) % cycle) + cycle) % cycle;
}

/** A word of a headline where it sits: its left edge, top, line and order in the text. */
export type PlacedWord = {
  text: string;
  x: number;
  y: number;
  width: number;
  line: number;
  /** Its place in reading order across all lines (0 is the first word read). */
  order: number;
  dir: "rtl" | "ltr";
};

/**
 * Lays lines of text out word by word in reading order. In a right-to-left
 * line the first word sits at the right, and a run of left-to-right words
 * inside it (a Latin name, "S17") keeps its own order, as the browser would
 * show the whole line. `x` is the line's start (its right end in RTL) or its
 * centre with `align: "center"`.
 */
export function layoutWords(
  lines: readonly string[],
  measure: (text: string) => number,
  {
    x,
    y,
    lineHeight,
    dir,
    align = "start",
  }: { x: number; y: number; lineHeight: number; dir: "rtl" | "ltr"; align?: "start" | "center" },
): PlacedWord[] {
  const space = measure(" ");
  const placed: PlacedWord[] = [];
  let order = 0;
  lines.forEach((line, lineIndex) => {
    const words = line.split(/\s+/).filter(Boolean);
    if (words.length === 0) return;
    // A word with no letters of its own (a dash, "·") joins the direction around it.
    const dirs = words.map((word) => (/[\p{L}\d]/u.test(word) ? textDirection(word) : dir));
    const widths = words.map(measure);
    const total = widths.reduce((sum, w) => sum + w, 0) + space * (words.length - 1);
    const lineLeft = align === "center" ? x - total / 2 : dir === "rtl" ? x - total : x;
    // Runs of words in one direction, in reading order.
    const runs: number[][] = [];
    words.forEach((_, index) => {
      const last = runs[runs.length - 1];
      if (last && dirs[last[0]] === dirs[index]) last.push(index);
      else runs.push([index]);
    });
    const runWidth = (run: number[]) =>
      run.reduce((sum, index) => sum + widths[index], 0) + space * (run.length - 1);
    const xs: number[] = new Array(words.length);
    // Runs go from the line's reading start; inside a run, words go in the run's own direction.
    let edge = dir === "rtl" ? lineLeft + total : lineLeft;
    for (const run of runs) {
      const w = runWidth(run);
      const runLeft = dir === "rtl" ? edge - w : edge;
      const ltr = dirs[run[0]] === "ltr";
      let cursor = ltr ? runLeft : runLeft + w;
      for (const index of run) {
        if (ltr) {
          xs[index] = cursor;
          cursor += widths[index] + space;
        } else {
          cursor -= widths[index];
          xs[index] = cursor;
          cursor -= space;
        }
      }
      edge = dir === "rtl" ? runLeft - space : runLeft + w + space;
    }
    words.forEach((text, index) => {
      placed.push({
        text,
        x: xs[index],
        y: y + lineIndex * lineHeight,
        width: widths[index],
        line: lineIndex,
        order: order++,
        dir: dirs[index],
      });
    });
  });
  return placed;
}

/**
 * Draws laid-out words, each rising into place from behind its own line (a
 * mask at the line's foot) as `reveal` gives its progress (0 hidden, 1 in
 * place). `size` is the font size, for the mask's room above and below.
 */
export function drawRisingWords(
  ctx: CanvasRenderingContext2D,
  words: readonly PlacedWord[],
  {
    size,
    lineHeight,
    reveal,
  }: { size: number; lineHeight: number; reveal: (word: PlacedWord) => number },
) {
  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const baseAlpha = ctx.globalAlpha;
  for (const word of words) {
    const p = clamp01(reveal(word));
    if (p <= 0) continue;
    ctx.save();
    // Room for accents and Arabic marks above the line, and descenders below it.
    clipTo(ctx, {
      x: word.x - size * 0.2,
      y: word.y - size * 0.35,
      w: word.width + size * 0.4,
      h: lineHeight + size * 0.55,
    });
    ctx.globalAlpha = baseAlpha * Math.min(1, p * 1.6);
    ctx.direction = word.dir;
    ctx.fillText(word.text, word.x, word.y + (1 - p) * lineHeight * 1.05);
    ctx.restore();
  }
  ctx.restore();
}

/** The tile of film grain, made once (null where a canvas cannot be made). */
let grainTile: HTMLCanvasElement | null | undefined;

function makeGrainTile(): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const size = 192;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  let tile: CanvasRenderingContext2D | null = null;
  try {
    tile = canvas.getContext("2d");
  } catch {
    tile = null;
  }
  if (!tile) return null;
  const image = tile.createImageData(size, size);
  // A fixed seed: the grain is the same on every export.
  let seed = 7;
  for (let i = 0; i < image.data.length; i += 4) {
    seed = (seed * 16807) % 2147483647;
    const v = seed % 256;
    image.data[i] = v;
    image.data[i + 1] = v;
    image.data[i + 2] = v;
    image.data[i + 3] = 255;
  }
  tile.putImageData(image, 0, 0);
  return canvas;
}

/**
 * A light film grain over the frame, its pattern moving twelve times a
 * second like film: it keeps flat grounds and photos from looking digital.
 * `amount` is its opacity (about 0.05).
 */
export function drawGrain(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  t: number,
  amount = 0.05,
) {
  if (grainTile === undefined) grainTile = makeGrainTile();
  if (!grainTile || amount <= 0) return;
  const step = Math.floor(t * 12);
  const size = grainTile.width;
  const dx = (step * 67) % size;
  const dy = (step * 131) % size;
  ctx.save();
  ctx.globalAlpha = amount;
  ctx.globalCompositeOperation = "overlay";
  for (let y = -dy; y < H; y += size) {
    for (let x = -dx; x < W; x += size) ctx.drawImage(grainTile, x, y);
  }
  ctx.restore();
}
