import { AR, HAND } from "./tones";
import { drawText, fit, LOGO_RATIO, roundRect, sewnTag, wrap } from "./text";
import { coverImage, handle, photoCrop, sideNote, stitchedFrame, wordmark } from "./frame";
import { drawPaper } from "./layout-paper";
import { drawPiece } from "./layout-piece";
import { drawGrid, drawProof, drawReply, drawSplit } from "./layout-series";
import type { Ctx, Geometry, PhotoBook, Post, TextLayout, Tone } from "./types";

/* The layouts a post can take. */
export const TEMPLATES: Record<string, { name: { ar: string; en: string }; fields: string[] }> = {
  joke: { name: { ar: "نكتة", en: "Joke" }, fields: ["lead", "head", "foot"] },
  photo: {
    name: { ar: "صورة ونكتة", en: "Photo and joke" },
    fields: ["lead", "head", "label", "photo1"],
  },
  poll: {
    name: { ar: "صوّتوا", en: "Poll" },
    fields: ["head", "labelA", "labelB", "photo1", "photo2"],
  },
  chat: { name: { ar: "محادثة", en: "Chat" }, fields: ["head", "chat"] },
  list: { name: { ar: "قائمة", en: "List" }, fields: ["head", "items", "foot"] },
  poster: { name: { ar: "صورة كاملة", en: "Full photo" }, fields: ["head", "photo1"] },
  piece: {
    name: { ar: "كرت القطعة", en: "Piece card" },
    fields: ["head", "items", "label", "photo1"],
  },
  paper: {
    name: { ar: "أوراق شمّوعة", en: "Shammoua's papers" },
    fields: ["lead", "head", "items", "total", "foot", "stamp"],
  },
  grid: { name: { ar: "خانات", en: "Grid" }, fields: ["head", "items", "foot"] },
  split: {
    name: { ar: "قبل وبعد", en: "Before and after" },
    fields: ["labelA", "head", "labelB", "foot"],
  },
  reply: { name: { ar: "رد على تعليق", en: "Comment reply" }, fields: ["lead", "head", "items"] },
  proof: {
    name: { ar: "كلام زبونة", en: "Customer words" },
    fields: ["lead", "head", "label", "photo1"],
  },
};

function drawJoke(ctx: Ctx, s: Post, g: Geometry, tone: Tone, _photos: PhotoBook) {
  stitchedFrame(ctx, g, tone);
  wordmark(ctx, g, tone);
  handle(ctx, g, tone);
  const right = g.W - g.M,
    w = g.W - g.M * 2;
  let y = g.T;
  if (s.lead) {
    const lead = fit(ctx, s.lead, AR, 500, 54, 34, w, 170, 1.4);
    y = drawText(ctx, lead, right, y, tone, tone.sub) + 22;
  }
  const head = fit(ctx, s.head, AR, 700, 112, 56, w, s.headMax || (g.B - g.T) * 0.54, 1.46);
  y = drawText(ctx, head, right, y, tone) + 20;
  sideNote(ctx, s.foot, right, y, w, tone);
}
function drawPhotoPost(ctx: Ctx, s: Post, g: Geometry, tone: Tone, photos: PhotoBook) {
  const right = g.W - g.M,
    w = g.W - g.M * 2;
  wordmark(ctx, g, tone);
  let y = g.T;
  if (s.lead) {
    const lead = fit(ctx, s.lead, AR, 500, 46, 30, w, 130, 1.36);
    y = drawText(ctx, lead, right, y, tone, tone.sub) + 12;
  }
  const head = fit(ctx, s.head, AR, 700, 84, 50, w, g.story ? 420 : 290, 1.42);
  y = drawText(ctx, head, right, y, tone) + 30;
  const photoKey = s.photo1;
  coverImage(ctx, photos[photoKey ?? ""]?.img, 0, y, g.W, g.H - y, photoCrop(s, "photo1"));
  ctx.save();
  ctx.strokeStyle = tone.bg;
  ctx.lineWidth = 7;
  ctx.setLineDash([22, 14]);
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(g.W, y);
  ctx.stroke();
  ctx.restore();
  if (s.label) {
    ctx.font = `600 36px ${AR}`;
    const tw = ctx.measureText(s.label).width;
    const lx = right - tw - 50,
      ly = g.story ? g.H - 420 : g.H - 150;
    sewnTag(ctx, lx, ly, tw + 76, 84, tone.bg, tone.ink, 0.012);
    ctx.fillStyle = tone.ink;
    ctx.textAlign = "right";
    ctx.fillText(s.label, right - 12, ly + 55);
  }
}
function drawPoll(ctx: Ctx, s: Post, g: Geometry, tone: Tone, photos: PhotoBook) {
  stitchedFrame(ctx, g, tone);
  wordmark(ctx, g, tone);
  handle(ctx, g, tone);
  const right = g.W - g.M,
    w = g.W - g.M * 2;
  const head = fit(ctx, s.head, AR, 700, 86, 50, w, 270, 1.46);
  const y = drawText(ctx, head, right, g.T, tone) + 30;
  const gap = 28,
    cw = (w - gap) / 2;
  const ch = Math.min(cw * 1.5, g.B - y - 34);
  (
    [
      [s.photo1, s.labelA, "1", right - cw, 0.016],
      [s.photo2, s.labelB, "2", g.M, -0.016],
    ] as const
  ).forEach(([key, label, num, x, rot]) => {
    ctx.save();
    ctx.translate(x + cw / 2, y + ch / 2);
    ctx.rotate(rot);
    ctx.translate(-cw / 2, -ch / 2);
    ctx.fillStyle = "#FFFDFB";
    roundRect(ctx, 0, 0, cw, ch, 10);
    ctx.fill();
    coverImage(ctx, photos[key ?? ""]?.img, 14, 14, cw - 28, ch - 88, photoCrop(s, "photo" + num));
    ctx.fillStyle = "#3C0A1B";
    ctx.font = `600 34px ${AR}`;
    ctx.textAlign = "center";
    ctx.fillText(label || "", cw / 2, ch - 26);
    ctx.beginPath();
    ctx.arc(cw - 12, 12, 46, 0, Math.PI * 2);
    ctx.fillStyle = tone.tag;
    ctx.fill();
    ctx.fillStyle = tone.tagInk;
    ctx.font = `700 52px ${AR}`;
    ctx.fillText(num, cw - 12, 30);
    ctx.restore();
  });
}
export function parseChat(raw: string | undefined) {
  return String(raw || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const i = l.indexOf(":");
      return i > 0
        ? { who: l.slice(0, i).trim(), text: l.slice(i + 1).trim() }
        : { who: "", text: l };
    });
}
function drawChat(ctx: Ctx, s: Post, g: Geometry, tone: Tone, _photos: PhotoBook) {
  stitchedFrame(ctx, g, tone);
  wordmark(ctx, g, tone);
  handle(ctx, g, tone);
  const right = g.W - g.M,
    w = g.W - g.M * 2;
  const head = fit(ctx, s.head, AR, 700, 76, 46, w, 250, 1.46);
  let y = drawText(ctx, head, right, g.T, tone) + 34;
  const rows = parseChat(s.chat);
  const me = rows.length ? rows[rows.length - 1].who : "";
  ctx.font = `500 46px ${AR}`;
  rows.forEach((row, i) => {
    const mine = row.who === me;
    const size = s.chatSize || 54;
    ctx.font = `500 ${size}px ${AR}`;
    const layout = { ...wrap(ctx, row.text, w * 0.66), size, lh: 1.4, family: AR, weight: 500 };
    const textW = Math.max(...layout.lines.map((l) => l.w));
    const bw = textW + 68,
      bh = layout.lines.length * size * 1.4 + 34;
    const bx = mine ? right - bw : g.M;
    const showName = !rows[i - 1] || rows[i - 1].who !== row.who;
    if (showName && row.who) {
      ctx.font = `600 32px ${HAND}`;
      ctx.fillStyle = tone.sub;
      ctx.textAlign = mine ? "right" : "left";
      ctx.fillText(row.who, mine ? right - 8 : g.M + 8, y + 30);
      y += 46;
    }
    roundRect(ctx, bx, y, bw, bh, 30);
    ctx.fillStyle = mine ? tone.tag : tone.ink;
    ctx.fill();
    const bubbleTone = { ...tone, ink: mine ? tone.tagInk : tone.bg };
    drawText(ctx, layout, bx + bw - 34, y + 8, bubbleTone);
    y += bh + 18;
  });
}
function drawList(ctx: Ctx, s: Post, g: Geometry, tone: Tone, _photos: PhotoBook) {
  stitchedFrame(ctx, g, tone);
  wordmark(ctx, g, tone);
  handle(ctx, g, tone);
  const right = g.W - g.M,
    w = g.W - g.M * 2;
  const head = fit(ctx, s.head, AR, 700, 82, 50, w, 280, 1.46);
  let y = drawText(ctx, head, right, g.T, tone) + 34;
  const items = String(s.items || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const room = g.B - y - (s.foot ? 90 : 0) - 150;
  let size = 54;
  let layouts: TextLayout[] = [];
  for (; size >= 28; size -= 2) {
    ctx.font = `500 ${size}px ${AR}`;
    layouts = items.map((it) => ({
      ...wrap(ctx, it, w - 106),
      size,
      lh: 1.34,
      family: AR,
      weight: 500,
    }));
    const total = layouts.reduce(
      (sum, l) => sum + Math.max(l.lines.length * size * 1.34, 76) + 24,
      0,
    );
    if (total <= room) break;
  }
  layouts.forEach((layout, i) => {
    sewnTag(ctx, right - 76, y, 76, 76, tone.tag, tone.tagInk, i % 2 ? 0.02 : -0.02);
    ctx.fillStyle = tone.tagInk;
    ctx.font = `700 42px ${AR}`;
    ctx.textAlign = "center";
    ctx.fillText(String(i + 1), right - 38, y + 53);
    const bottom = drawText(ctx, layout, right - 106, y - 2, tone);
    y = Math.max(bottom, y + 76) + 24;
  });
  sideNote(ctx, s.foot, right, y + 4, w, tone, 50);
}
function drawPoster(ctx: Ctx, s: Post, g: Geometry, tone: Tone, photos: PhotoBook) {
  const photo = photos[s.photo1 ?? ""];
  coverImage(ctx, photo?.img, 0, 0, g.W, g.H, photoCrop(s, "photo1"));
  stitchedFrame(ctx, g, tone);
  const logoH = g.logoW * LOGO_RATIO;
  sewnTag(
    ctx,
    g.W - g.M - g.logoW - 26,
    g.logoTop - 22,
    g.logoW + 52,
    logoH + 44,
    tone.bg,
    tone.ink,
    0,
  );
  wordmark(ctx, g, tone);
  if (s.head) {
    const layout = fit(ctx, s.head, AR, 700, 76, 40, g.W - g.M * 2, 300, 1.44);
    const h = layout.lines.length * layout.size * layout.lh + 64;
    const bottom = g.story ? g.H - 330 : g.H - 70;
    ctx.fillStyle = tone.bg;
    ctx.fillRect(0, bottom - h, g.W, h);
    ctx.save();
    ctx.strokeStyle = tone.stitch;
    ctx.lineWidth = 4;
    ctx.setLineDash([20, 14]);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(0, bottom - h + 12);
    ctx.lineTo(g.W, bottom - h + 12);
    ctx.moveTo(0, bottom - 12);
    ctx.lineTo(g.W, bottom - 12);
    ctx.stroke();
    ctx.restore();
    drawText(ctx, layout, g.W - g.M, bottom - h + 26, tone);
  }
}
export const DRAW: Record<
  string,
  (ctx: Ctx, s: Post, g: Geometry, tone: Tone, photos: PhotoBook) => void
> = {
  joke: drawJoke,
  photo: drawPhotoPost,
  poll: drawPoll,
  chat: drawChat,
  list: drawList,
  poster: drawPoster,
  piece: drawPiece,
  paper: (ctx, s, g, tone) => drawPaper(ctx, s, g, tone),
  grid: (ctx, s, g, tone) => drawGrid(ctx, s, g, tone),
  split: (ctx, s, g, tone) => drawSplit(ctx, s, g, tone),
  reply: (ctx, s, g, tone) => drawReply(ctx, s, g, tone),
  proof: drawProof,
};
