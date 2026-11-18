import { AR } from "./tones";
import { fit } from "./text";
import { handle, stitchedFrame, wordmark } from "./frame";
import { ribbon } from "./look-pieces";
import { threadOf } from "./looks";
import { centreText, memeWords, slotPicture } from "./layout-meme";
import type { Ctx, Geometry, PhotoBook, Post, Tone } from "./types";

/*
 * The two layouts drawn from the looks' samples. The show: a first line, the line that matters on
 * a satin ribbon, a big photo, and the punch line over the photo's foot, white as memes write it.
 * The teaser: two lines of words, the second in the cloth's gold, and the rest left to stickers
 * (Shammoua, a needle and its thread, a spool off the edge).
 */

const PUNCH_SIZE = 70;
const PUNCH_LH = 1.22;

/** "For everyone asking: why does tailoring take time?" and the answer over the photo. */
export function drawMemeShow(ctx: Ctx, s: Post, g: Geometry, tone: Tone, photos: PhotoBook) {
  stitchedFrame(ctx, g, tone);
  wordmark(ctx, g, tone);
  handle(ctx, g, tone);
  const dressed = Boolean(g.look);
  const w = g.W - g.M * 2;
  const cx = g.W / 2;
  let y = g.T;
  if (s.lead?.trim()) {
    const lead = { ...fit(ctx, s.lead, AR, 700, 72, 44, w, 190, 1.3), noTag: true };
    y = centreText(ctx, lead, cx, y, tone) + 8;
  }
  if (s.head?.trim()) {
    const h = ribbon(
      ctx,
      s.head,
      cx,
      y + 56,
      w + 60,
      AR,
      threadOf(tone),
      tone.bg,
      dressed ? -0.02 : 0,
    );
    y += h + 30;
  }
  const foot = s.foot?.trim();
  // The punch line hangs over the photo's foot: its last line sits below the photo.
  const photoBottom = foot ? g.B - 86 : g.B;
  const ph = Math.max(120, photoBottom - y);
  const pw = Math.min(g.W - 260, ph * 1.45);
  ctx.save();
  ctx.translate(cx, y + ph / 2);
  ctx.rotate(dressed ? -0.022 : 0);
  slotPicture(
    ctx,
    photos[s.photo1 ?? ""],
    -pw / 2,
    -ph / 2,
    pw,
    ph,
    s,
    "photo1",
    tone,
    18,
    dressed,
  );
  ctx.restore();
  if (foot) {
    const layout = fit(ctx, foot.replace(/\*/g, ""), AR, 800, PUNCH_SIZE, 34, w, 200, PUNCH_LH);
    const total = layout.lines.length * layout.size * layout.lh;
    memeWords(ctx, foot, cx, g.B - total, w, PUNCH_SIZE, 200);
  }
}

/** "Guess our new abaya, out tomorrow!": two lines, the second in gold, the rest stickers. */
export function drawMemeTeaser(ctx: Ctx, s: Post, g: Geometry, tone: Tone) {
  stitchedFrame(ctx, g, tone);
  wordmark(ctx, g, tone);
  handle(ctx, g, tone);
  const w = g.W - g.M * 2;
  const cx = g.W / 2;
  let y = g.T + 10;
  if (s.lead?.trim()) {
    const lead = { ...fit(ctx, s.lead, AR, 700, 78, 44, w, 200, 1.3), noTag: true };
    y = centreText(ctx, lead, cx, y, tone) + 4;
  }
  if (s.head?.trim()) {
    const head = { ...fit(ctx, s.head, AR, 800, 86, 48, w, 260, 1.3), noTag: true };
    centreText(ctx, head, cx, y, tone, tone.sub);
  }
}

export const SHOW_TEMPLATES = {
  memeShow: {
    name: { ar: "ميم: عنوان وصورة وقفلة", en: "Meme: headline, photo and punch line" },
    fields: ["lead", "head", "photo1", "foot"],
  },
  memeTeaser: {
    name: { ar: "تشويق", en: "Teaser" },
    fields: ["lead", "head"],
  },
};

export const SHOW_DRAW = {
  memeShow: drawMemeShow,
  memeTeaser: drawMemeTeaser,
};
