import { AR, HAND } from "./tones";
import { drawText, fit, LOGO_RATIO, roundRect, wrap } from "./text";
import {
  coverImage,
  grain,
  handle,
  logoOnLabel,
  photoCrop,
  stitchedFrame,
  wordmark,
} from "./frame";
import { pinkedMount, pinkedPath, photoPaper } from "./look-pieces";
import { threadOf } from "./looks";
import type { Ctx, Geometry, Photo, PhotoBook, Post, TextLayout, Tone } from "./types";

/*
 * The meme layouts: the kit's stitched frame, logo and handle round one or two reaction photos and
 * a meme's few words. A slot takes a photo, or one of the store's cut-out stickers, which is shown
 * whole on the cloth instead of cropped to the slot.
 */

/**
 * A photo in a slot: cropped to fill it, or a cut-out sticker set whole inside it. On a dressed
 * post the photo sits in a pinked paper mount and a sticker on a pinked swatch of cloth.
 */
export function slotPicture(
  ctx: Ctx,
  photo: Photo | undefined,
  x: number,
  y: number,
  w: number,
  h: number,
  s: Post,
  slot: string,
  tone: Tone,
  radius = 14,
  dressed = false,
) {
  const img = photo?.img;
  if (!img) {
    // An empty slot says what goes in it, in the post's own thread.
    ctx.save();
    if (dressed) pinkedPath(ctx, x + 9, y + 9, w - 18, h - 18, 16);
    else roundRect(ctx, x, y, w, h, radius);
    ctx.strokeStyle = tone.stitch;
    ctx.lineWidth = 4;
    ctx.setLineDash([18, 12]);
    ctx.stroke();
    ctx.fillStyle = tone.sub;
    ctx.font = `600 ${Math.round(Math.min(48, w / 7))}px ${HAND}`;
    ctx.textAlign = "center";
    ctx.direction = "rtl";
    ctx.fillText("حط صورة هني", x + w / 2, y + h / 2 + 14);
    ctx.restore();
    return;
  }
  if (photo?.sticker && img) {
    let box = { x, y, w, h };
    if (dressed) {
      box = pinkedMount(ctx, x, y, w, h, tone.tag, threadOf(tone));
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = ctx.createPattern(grain(), "repeat") as CanvasPattern;
      ctx.fillRect(box.x, box.y, box.w, box.h);
      ctx.restore();
    }
    const k = Math.min(box.w / img.width, box.h / img.height) * (dressed ? 0.92 : 1);
    const dw = img.width * k,
      dh = img.height * k;
    ctx.drawImage(img, box.x + (box.w - dw) / 2, box.y + (box.h - dh) / 2, dw, dh);
    return;
  }
  if (dressed) {
    const box = pinkedMount(ctx, x, y, w, h, photoPaper(tone), threadOf(tone));
    coverImage(ctx, img, box.x, box.y, box.w, box.h, photoCrop(s, slot));
    return;
  }
  ctx.save();
  roundRect(ctx, x, y, w, h, radius);
  ctx.clip();
  coverImage(ctx, img, x, y, w, h, photoCrop(s, slot));
  ctx.restore();
}

/** Lines centred on `cx`, each drawn with the kit's own text (marks and Latin runs kept). */
export function centreText(
  ctx: Ctx,
  layout: TextLayout,
  cx: number,
  top: number,
  tone: Tone,
  color?: string,
) {
  layout.lines.forEach((line, i) => {
    drawText(
      ctx,
      { ...layout, lines: [line] },
      cx + line.w / 2,
      top + i * layout.size * layout.lh,
      tone,
      color,
    );
  });
  return top + layout.lines.length * layout.size * layout.lh;
}

/**
 * A meme's words as memes write them: bold white with a black outline, centred, line by line.
 * The answer is where the words end.
 */
export function memeWords(
  ctx: Ctx,
  text: string | undefined,
  cx: number,
  top: number,
  maxW: number,
  maxSize: number,
  maxH: number,
) {
  const words = String(text ?? "").trim();
  if (!words) return top;
  const layout = fit(ctx, words.replace(/\*/g, ""), AR, 800, maxSize, 34, maxW, maxH, 1.22);
  ctx.save();
  ctx.font = `800 ${layout.size}px ${AR}`;
  ctx.textAlign = "center";
  ctx.direction = "rtl";
  ctx.lineJoin = "round";
  ctx.lineWidth = layout.size * 0.17;
  ctx.strokeStyle = "#0b0b0b";
  ctx.fillStyle = "#ffffff";
  let y = top + layout.size;
  for (const line of layout.lines) {
    const t = line.tokens.map((tok) => tok.t).join(" ");
    ctx.shadowColor = "rgba(0,0,0,.5)";
    ctx.shadowOffsetY = layout.size * 0.08;
    ctx.strokeText(t, cx, y);
    ctx.shadowColor = "transparent";
    ctx.fillText(t, cx, y);
    y += layout.size * layout.lh;
  }
  ctx.restore();
  return top + layout.lines.length * layout.size * layout.lh;
}

/**
 * A caption and the small line under it, at the right, or centred on a dressed post; the answer
 * is where they end.
 */
function caption(
  ctx: Ctx,
  big: string | undefined,
  small: string | undefined,
  right: number,
  top: number,
  w: number,
  maxH: number,
  tone: Tone,
  centred = false,
) {
  let y = top;
  const cx = right - w / 2;
  if (big) {
    const layout = fit(ctx, big, AR, 700, 76, 40, w, maxH * 0.7, 1.36);
    y = centred ? centreText(ctx, layout, cx, y, tone) : drawText(ctx, layout, right, y, tone);
  }
  if (small) {
    const layout = { ...fit(ctx, small, HAND, 600, 44, 28, w, maxH * 0.3, 1.3), noTag: true };
    y = centred
      ? centreText(ctx, layout, cx, y + 6, tone, tone.sub)
      : drawText(ctx, layout, right, y + 6, tone, tone.sub);
  }
  return y;
}

function chrome(ctx: Ctx, g: Geometry, tone: Tone) {
  stitchedFrame(ctx, g, tone);
  wordmark(ctx, g, tone);
  handle(ctx, g, tone);
}

/** "How I thought it would be / how it turned out", one above the other. */
export function drawMemeStack(ctx: Ctx, s: Post, g: Geometry, tone: Tone, photos: PhotoBook) {
  chrome(ctx, g, tone);
  const right = g.W - g.M,
    w = g.W - g.M * 2;
  const gap = 34;
  const half = (g.B - g.T - gap) / 2;
  const dressed = Boolean(g.look);
  const part = (top: number, big?: string, small?: string, slot = "photo1") => {
    const end = caption(ctx, big, small, right, top, w, half * 0.36, tone, dressed) + 18;
    const pw = Math.min(w * 0.78, (top + half - end) * 1.5);
    slotPicture(
      ctx,
      photos[s[slot as "photo1"] ?? ""],
      dressed ? (g.W - pw) / 2 : g.M,
      end,
      pw,
      top + half - end,
      s,
      slot,
      tone,
      14,
      dressed,
    );
  };
  part(g.T, s.labelA, s.lead, "photo1");
  part(g.T + half + gap, s.labelB, s.foot, "photo2");
}

/** The same two beats beside each other: the first at the right, as Arabic reads. */
export function drawMemeSide(ctx: Ctx, s: Post, g: Geometry, tone: Tone, photos: PhotoBook) {
  chrome(ctx, g, tone);
  const w = g.W - g.M * 2;
  const gap = 30;
  const cw = (w - gap) / 2;
  const top = g.T + 10;
  const tops = [s.labelA, s.labelB].map((big, i) => {
    const small = i === 0 ? s.lead : s.foot;
    const right = g.W - g.M - i * (cw + gap);
    return caption(ctx, big, small, right, top, cw, (g.B - top) * 0.32, tone, Boolean(g.look));
  });
  const photoTop = Math.max(...tops) + 22;
  const ph = Math.min(g.B - photoTop, cw * 1.45);
  ["photo1", "photo2"].forEach((slot, i) => {
    const x = g.W - g.M - cw - i * (cw + gap);
    slotPicture(
      ctx,
      photos[s[slot as "photo1"] ?? ""],
      x,
      photoTop,
      cw,
      ph,
      s,
      slot,
      tone,
      14,
      Boolean(g.look),
    );
  });
}

/** The classic: one photo, words on top and at the foot, white with a black edge. */
export function drawMemeClassic(ctx: Ctx, s: Post, g: Geometry, tone: Tone, photos: PhotoBook) {
  const inset = 60;
  const x = inset,
    y = inset,
    w = g.W - inset * 2,
    h = g.H - inset * 2;
  slotPicture(ctx, photos[s.photo1 ?? ""], x, y, w, h, s, "photo1", tone, 22);
  stitchedFrame(ctx, g, tone);
  logoOnLabel(ctx, g, tone);
  const logoH = g.logoW * LOGO_RATIO;
  const maxW = w - 80;
  memeWords(ctx, s.head, g.W / 2, g.logoTop + logoH + 40, maxW, 92, h * 0.28);
  if (s.foot) {
    ctx.font = `800 80px ${AR}`;
    const lines = Math.max(1, wrap(ctx, s.foot, maxW).lines.length);
    const footH = Math.min(h * 0.28, lines * 80 * 1.22);
    memeWords(ctx, s.foot, g.W / 2, (g.story ? g.H - 300 : g.B) - footH, maxW, 80, h * 0.28);
  }
}

/** A line of words over a photo: "nobody: / me:", or a POV. */
export function drawMemeCaption(ctx: Ctx, s: Post, g: Geometry, tone: Tone, photos: PhotoBook) {
  chrome(ctx, g, tone);
  const right = g.W - g.M,
    w = g.W - g.M * 2;
  const head = fit(ctx, s.head, AR, 600, 70, 40, w, (g.B - g.T) * 0.36, 1.4);
  const end =
    (g.look ? centreText(ctx, head, g.W / 2, g.T, tone) : drawText(ctx, head, right, g.T, tone)) +
    26;
  slotPicture(
    ctx,
    photos[s.photo1 ?? ""],
    g.M,
    end,
    w,
    g.B - end,
    s,
    "photo1",
    tone,
    18,
    Boolean(g.look),
  );
}

/** A stitched cross for "no" or a tick for "yes", in a sewn ring. */
function verdict(ctx: Ctx, cx: number, cy: number, r: number, yes: boolean, tone: Tone) {
  ctx.save();
  ctx.fillStyle = yes ? tone.tag : tone.bg;
  ctx.strokeStyle = yes ? tone.tagInk : tone.ink;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.setLineDash([10, 8]);
  ctx.beginPath();
  ctx.arc(cx, cy, r - 9, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineWidth = r * 0.2;
  ctx.lineCap = "round";
  ctx.beginPath();
  if (yes) {
    ctx.moveTo(cx - r * 0.42, cy + r * 0.02);
    ctx.lineTo(cx - r * 0.1, cy + r * 0.34);
    ctx.lineTo(cx + r * 0.44, cy - r * 0.32);
  } else {
    const d = r * 0.36;
    ctx.moveTo(cx - d, cy - d);
    ctx.lineTo(cx + d, cy + d);
    ctx.moveTo(cx + d, cy - d);
    ctx.lineTo(cx - d, cy + d);
  }
  ctx.stroke();
  ctx.restore();
}

/** "No / yes": two rows, each its words at the right and its photo at the left. */
export function drawMemeNoYes(ctx: Ctx, s: Post, g: Geometry, tone: Tone, photos: PhotoBook) {
  chrome(ctx, g, tone);
  const w = g.W - g.M * 2;
  const gap = 30;
  const top = g.T + 10;
  const rowH = (g.B - top - gap) / 2;
  const pw = w * 0.46;
  const textW = w - pw - 40;
  [
    [s.labelA, "photo1", false],
    [s.labelB, "photo2", true],
  ].forEach(([words, slot, yes], i) => {
    const y = top + i * (rowH + gap);
    slotPicture(
      ctx,
      photos[s[slot as "photo1"] ?? ""],
      g.M,
      y,
      pw,
      rowH,
      s,
      slot as string,
      tone,
      14,
      Boolean(g.look),
    );
    const r = 46;
    verdict(ctx, g.W - g.M - r, y + r + 4, r, yes as boolean, tone);
    const layout = fit(ctx, words as string, AR, 700, 64, 34, textW, rowH - r * 2 - 40, 1.36);
    drawText(ctx, layout, g.W - g.M, y + r * 2 + 30, tone);
  });
}

/** Only the frame, the logo and the handle: everything else is laid by hand. */
export function drawFree(ctx: Ctx, _s: Post, g: Geometry, tone: Tone) {
  chrome(ctx, g, tone);
}

export const MEME_TEMPLATES = {
  memeStack: {
    name: { ar: "ميم: فوق وتحت", en: "Meme: stacked" },
    fields: ["labelA", "lead", "photo1", "labelB", "foot", "photo2"],
  },
  memeSide: {
    name: { ar: "ميم: جنب بعض", en: "Meme: side by side" },
    fields: ["labelA", "lead", "photo1", "labelB", "foot", "photo2"],
  },
  memeClassic: {
    name: { ar: "ميم كلاسيكي", en: "Classic meme" },
    fields: ["head", "foot", "photo1"],
  },
  memeCaption: {
    name: { ar: "ميم: كلام وصورة", en: "Meme: words over a photo" },
    fields: ["head", "photo1"],
  },
  memeNoYes: {
    name: { ar: "ميم: لا / إي", en: "Meme: no / yes" },
    fields: ["labelA", "photo1", "labelB", "photo2"],
  },
  free: { name: { ar: "لوحة حرة", en: "Free canvas" }, fields: [] as string[] },
};

export const MEME_DRAW = {
  memeStack: drawMemeStack,
  memeSide: drawMemeSide,
  memeClassic: drawMemeClassic,
  memeCaption: drawMemeCaption,
  memeNoYes: drawMemeNoYes,
  free: drawFree,
};
