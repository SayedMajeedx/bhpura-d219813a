import { drawCover, drawRuns, font, type Box } from "@/features/content-studio/engine/draw";
import { drawBrandMark } from "@/features/content-studio/engine/brand-mark";
import { displayFont, STUDIO_FONTS } from "@/features/content-studio/engine/fonts";
import type { FormatKey, SceneData, StudioTemplate } from "@/features/content-studio/engine/scene";
import {
  textDirection,
  wrapText,
  type Measure,
} from "@/features/content-studio/engine/text-layout";
import { ease, mix, presence, progress } from "@/features/content-studio/engine/timeline";
import { drawGrain, drawRisingWords, layoutWords } from "@/features/content-studio/engine/motion";
import type { OrderStep } from "@/features/content-studio/lib/how-to-order";

const DURATION = 10;
/** When the first step arrives, and the gap to the next: time to read each. */
const STEPS_AT = 1.5;
const STEP_GAP = 0.6;
/** A print's paper: slightly warm, never pure white. */
const PAPER = "#fbf8f3";

const LAYOUT: Record<
  FormatKey,
  {
    topY: number;
    titleY: number;
    title: number;
    /** The pinned print: its size at reference width and its top. */
    print: { w: number; h: number; y: number };
    stepsY: number;
    stepsBottom: number;
    /** How large the steps are set before they are fitted to the room (a story reads from further away). */
    type: number;
    footerY: number | null;
  }
> = {
  story: {
    topY: 0.06,
    titleY: 0.105,
    title: 150,
    print: { w: 300, h: 390, y: 0.085 },
    stepsY: 0.34,
    stepsBottom: 0.845,
    type: 1.18,
    footerY: null,
  },
  portrait: {
    topY: 0.055,
    titleY: 0.1,
    title: 112,
    print: { w: 236, h: 306, y: 0.07 },
    stepsY: 0.355,
    stepsBottom: 0.895,
    type: 1,
    footerY: 0.94,
  },
  square: {
    topY: 0.06,
    titleY: 0.115,
    title: 92,
    print: { w: 190, h: 246, y: 0.07 },
    stepsY: 0.34,
    stepsBottom: 0.885,
    type: 0.9,
    footerY: 0.935,
  },
};

const TITLE = {
  en: { lines: ["How to", "order"], one: "How to order", empty: "Add how you sell in Settings" },
  ar: { lines: ["طريقة", "الطلب"], one: "طريقة الطلب", empty: "أضف طرق البيع من الإعدادات" },
};

type PlacedStep = {
  step: OrderStep;
  y: number;
  /** Each line as drawn: pieces in reading order (several only on a line that joins an amount). */
  lines: string[][];
};

/**
 * The steps placed from `top` at scale `k`, and the height they take. Each
 * step is a rule, then its title, then its lines (a long one wrapped).
 */
export function placeSteps(
  steps: readonly OrderStep[],
  {
    top,
    k,
    u,
    textW,
    measureAt,
  }: {
    top: number;
    k: number;
    u: number;
    textW: number;
    measureAt: (size: number) => Measure;
  },
): { placed: PlacedStep[]; height: number } {
  const titleH = 50 * k * u;
  const lineH = 32 * k * u * 1.5;
  const gap = 40 * k * u;
  const placed: PlacedStep[] = [];
  let y = top;
  steps.forEach((step, index) => {
    if (index > 0) y += gap;
    const lines = step.lines.flatMap((pieces) =>
      pieces.length === 1
        ? wrapText(pieces[0], textW, measureAt(32 * k * u)).map((line) => [line])
        : [pieces],
    );
    placed.push({ step, y, lines });
    y += 22 * k * u + titleH + lines.length * lineH;
  });
  return { placed, height: y - top };
}

function render(ctx: CanvasRenderingContext2D, t: number, scene: SceneData) {
  const { width: W, height: H, brand, lang } = scene;
  const { palette } = brand;
  const u = W / 1080;
  const layout = LAYOUT[scene.format];
  const rtl = lang === "ar";
  const margin = 80 * u;
  const startX = rtl ? W - margin : margin;
  const align = rtl ? "right" : "left";
  const steps = scene.orderSteps ?? [];
  const words = TITLE[lang];

  ctx.fillStyle = palette.ground;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.globalAlpha = presence(t, { start: 0.05, end: DURATION });
  drawBrandMark(ctx, brand, {
    x: startX,
    y: layout.topY * H,
    u,
    align,
    onPhoto: false,
    ink: palette.ink,
  });
  ctx.restore();

  // The piece, as a print pinned at the far side: it drops in and settles a little askew.
  if (scene.media) {
    const pw = layout.print.w * u;
    const ph = layout.print.h * u;
    const cx = rtl ? margin + pw / 2 : W - margin - pw / 2;
    const cy = layout.print.y * H + ph / 2;
    const drop = progress(t, 0.45, 0.9, ease.outBack);
    const lean = (rtl ? 1 : -1) * mix(0.12, 0.045, drop);
    ctx.save();
    ctx.globalAlpha = presence(t, { start: 0.45, end: DURATION, enter: 0.35 });
    ctx.translate(cx, cy + (1 - drop) * -50 * u);
    ctx.rotate(lean);
    const border = 12 * u;
    const paper: Box = {
      x: -pw / 2 - border,
      y: -ph / 2 - border,
      w: pw + 2 * border,
      h: ph + 2 * border + 26 * u,
    };
    ctx.shadowColor = "rgba(0, 0, 0, 0.16)";
    ctx.shadowBlur = 22 * u;
    ctx.shadowOffsetY = 10 * u;
    ctx.fillStyle = PAPER;
    ctx.fillRect(paper.x, paper.y, paper.w, paper.h);
    ctx.shadowColor = "transparent";
    drawCover(
      ctx,
      scene.media,
      { x: -pw / 2, y: -ph / 2, w: pw, h: ph },
      { zoom: 1.04, focusY: 0.35 },
    );
    ctx.restore();
  }

  // The title, rising word by word from the reading start.
  const titleLines = scene.format === "square" ? [words.one] : words.lines;
  const titleDir = textDirection(titleLines.join(" "));
  const family = displayFont(titleDir === "rtl" ? "ar" : "en", brand.displayFamilies);
  const titleSize = layout.title * u;
  const titleLineH = titleSize * (titleDir === "rtl" ? 1.22 : 0.98);
  ctx.font = font(titleSize, family, 600);
  const titleWords = layoutWords(titleLines, (text) => ctx.measureText(text).width, {
    x: startX,
    y: layout.titleY * H,
    lineHeight: titleLineH,
    dir: titleDir,
  });
  ctx.save();
  ctx.globalAlpha = presence(t, { start: 0.2, end: DURATION, enter: 0.01 });
  ctx.fillStyle = palette.ink;
  ctx.font = font(titleSize, family, 600);
  drawRisingWords(ctx, titleWords, {
    size: titleSize,
    lineHeight: titleLineH,
    reveal: (word) => progress(t, 0.2 + word.order * 0.12, 0.8, ease.outExpo),
  });
  ctx.restore();

  // The steps: as large as the room allows. A square sets them in two columns
  // (the first at the reading start) rather than shrinking them past reading.
  const columns = scene.format === "square" && steps.length > 2 ? 2 : 1;
  const colGap = 56 * u;
  const colW = (W - 2 * margin - colGap * (columns - 1)) / columns;
  const numberW = (columns === 2 ? 86 : 118) * u;
  const textW = colW - numberW;
  const top = layout.stepsY * H;
  const room = layout.stepsBottom * H - top;
  const measureAt = (size: number): Measure => {
    ctx.font = font(size, STUDIO_FONTS.body, 400);
    return (text) => ctx.measureText(text).width;
  };
  const perColumn = Math.ceil(steps.length / columns);
  const groups = Array.from({ length: columns }, (_, c) =>
    steps.slice(c * perColumn, (c + 1) * perColumn),
  );
  const placeAll = (scale: number) =>
    groups.map((group) => placeSteps(group, { top, k: scale, u, textW, measureAt }));
  let k = layout.type;
  let fits = placeAll(k);
  while (Math.max(0, ...fits.map((fit) => fit.height)) > room && k > 0.6) {
    k -= 0.06;
    fits = placeAll(k);
  }
  const placedSteps = fits.flatMap((fit, c) =>
    fit.placed.map((placed) => ({
      ...placed,
      colStart: rtl ? startX - c * (colW + colGap) : startX + c * (colW + colGap),
    })),
  );

  if (steps.length === 0) {
    ctx.save();
    ctx.globalAlpha = presence(t, { start: STEPS_AT, end: DURATION }) * 0.6;
    ctx.fillStyle = palette.ink;
    ctx.font = font(32 * u, STUDIO_FONTS.body, 400);
    ctx.direction = textDirection(words.empty);
    ctx.textAlign = align;
    ctx.textBaseline = "top";
    ctx.fillText(words.empty, startX, top);
    ctx.restore();
  }

  placedSteps.forEach(({ step, y, lines, colStart }, index) => {
    const at = STEPS_AT + index * STEP_GAP;
    const textX = rtl ? colStart - numberW : colStart + numberW;
    // The rule, drawn from the reading start across the column.
    const ruleW = colW * progress(t, at, 0.55, ease.outCubic);
    ctx.save();
    ctx.globalAlpha = presence(t, { start: at, end: DURATION, enter: 0.01 }) * 0.35;
    ctx.fillStyle = palette.ink;
    ctx.fillRect(rtl ? colStart - ruleW : colStart, y, ruleW, Math.max(1, 1.5 * u));
    ctx.restore();

    const rise = (start: number) => (1 - progress(t, start, 0.6, ease.outExpo)) * 18 * u;
    const textTop = y + 22 * k * u;

    // The step's number, in the display face and the accent.
    ctx.save();
    ctx.globalAlpha = presence(t, { start: at + 0.1, end: DURATION });
    ctx.fillStyle = palette.accent;
    ctx.font = font(50 * k * u, displayFont("en", brand.displayFamilies), 600);
    ctx.direction = "ltr";
    ctx.textAlign = align;
    ctx.textBaseline = "top";
    ctx.fillText(
      String(index + 1).padStart(2, "0"),
      colStart,
      textTop - 4 * k * u + rise(at + 0.1),
    );
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = presence(t, { start: at + 0.18, end: DURATION });
    ctx.fillStyle = palette.ink;
    ctx.font = font(36 * k * u, STUDIO_FONTS.body, 600);
    ctx.direction = textDirection(step.title);
    ctx.textAlign = align;
    ctx.textBaseline = "top";
    ctx.fillText(step.title, textX, textTop + rise(at + 0.18));
    ctx.restore();

    const lineSize = 32 * k * u;
    const lineH = lineSize * 1.5;
    lines.forEach((pieces, j) => {
      const start = at + 0.28 + j * 0.07;
      const ly = textTop + 50 * k * u + j * lineH + rise(start);
      ctx.save();
      ctx.globalAlpha = presence(t, { start, end: DURATION }) * 0.82;
      ctx.fillStyle = palette.ink;
      ctx.font = font(lineSize, STUDIO_FONTS.body, 400);
      ctx.textBaseline = "top";
      if (pieces.length === 1) {
        ctx.direction = textDirection(pieces[0]);
        ctx.textAlign = align;
        ctx.fillText(pieces[0], textX, ly);
      } else {
        // A word and an amount (or a number) drawn apart, so neither reorders the other.
        drawRuns(
          ctx,
          pieces.map((text) => ({ text })),
          {
            x: textX,
            y: ly,
            lineDir: rtl ? "rtl" : "ltr",
            gap: 14 * k * u,
          },
        );
      }
      ctx.restore();
    });
  });

  if (layout.footerY !== null) {
    const footer = [brand.handle, brand.contact].filter(Boolean).join("   ·   ");
    if (footer) {
      ctx.save();
      ctx.globalAlpha = presence(t, { start: 3, end: DURATION }) * 0.7;
      ctx.fillStyle = palette.ink;
      ctx.font = font(26 * u, STUDIO_FONTS.body, 400);
      ctx.direction = "ltr";
      ctx.textAlign = align;
      ctx.textBaseline = "middle";
      ctx.fillText(footer, startX, layout.footerY * H);
      ctx.restore();
    }
  }

  drawGrain(ctx, W, H, t, 0.04);

  const fade = progress(t, DURATION - 0.45, 0.45, ease.inCubic);
  if (fade > 0) {
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.fillStyle = palette.ground;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
}

/** The store's own way of ordering, step by step: a story to keep in the highlights. */
export const howToOrder: StudioTemplate = {
  id: "how-to-order",
  name: { en: "How to Order", ar: "طريقة الطلب" },
  goal: { en: "Highlights story", ar: "ستوري للهايلايت" },
  duration: DURATION,
  posterTime: 8.5,
  render,
};
