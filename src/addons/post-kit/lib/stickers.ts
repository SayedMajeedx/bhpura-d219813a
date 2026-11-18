import { TONES } from "./tones";
import { coverImage } from "./frame";
import { edgeColorOf, edgeShare, frameOf, photoBox, shadowOf } from "./photo-shape";
import { roundRect } from "./text";
import { HANGER_STICKERS } from "./stickers-hanger";
import { OTHER_STICKERS } from "./stickers-other";
import { sceneHusband, sceneMind, scenePhone, sceneSign } from "./scenes";
import { sceneCalc, sceneNote, sceneOwl, sceneSalary, sceneWell } from "./scenes-more";
import type { Crop, Ctx, Geometry, PhotoBook, Post, Sticker, StickerDef, Tone } from "./types";

/* Every sticker a post can carry: the die-cut ones, the stitched scenes and a framed photo. */
export const STICKERS: Record<string, StickerDef> = {
  ...HANGER_STICKERS,
  ...OTHER_STICKERS,
  photo: { name: { ar: "صورة", en: "Photo" }, photoCard: true },
  "scene-salary": {
    name: { ar: "رسمة: ع الراتب", en: "Scene: payday" },
    stitch: true,
    art: sceneSalary,
  },
  "scene-note": {
    name: { ar: "رسمة: السكليف", en: "Scene: sick note" },
    stitch: true,
    text: true,
    sample: "التشخيص: حساسية من الدوام\nالعلاج: طلعة وكرك\nممنوع: عباية الدوام",
    art: sceneNote,
  },
  "scene-calc": {
    name: { ar: "رسمة: الحاسبة", en: "Scene: calculator" },
    stitch: true,
    text: true,
    sample: "-575",
    art: sceneCalc,
  },
  "scene-owl": { name: { ar: "رسمة: البومة", en: "Scene: owl" }, stitch: true, art: sceneOwl },
  "scene-well": { name: { ar: "رسمة: البير", en: "Scene: well" }, stitch: true, art: sceneWell },
  "scene-sign": {
    name: { ar: "لافتة كرتون", en: "Cardboard sign" },
    stitch: true,
    text: true,
    sample: "اكتب هنا",
    art: sceneSign,
  },
  "scene-phone": {
    name: { ar: "رسمة: الجوال والموقع", en: "Scene: phone" },
    stitch: true,
    text: true,
    sample: "اطلب الآن",
    art: scenePhone,
  },
  "scene-mind": {
    name: { ar: "رسمة: شنو في بالش", en: "Scene: on your mind" },
    stitch: true,
    text: true,
    sample: "عباية جديدة",
    art: sceneMind,
  },
  "scene-husband": {
    name: { ar: "رسمة: الموظف", en: "Scene: the employee" },
    stitch: true,
    text: true,
    sample: "موظف",
    art: sceneHusband,
  },
};

const stickerCache: Record<string, HTMLCanvasElement> = {};
export function stickerCanvas(id: string): HTMLCanvasElement {
  if (stickerCache[id]) return stickerCache[id];
  const def = STICKERS[id];
  if (def.stitch) {
    const thumb = document.createElement("canvas");
    thumb.width = thumb.height = 700;
    const tc = thumb.getContext("2d") as Ctx;
    tc.scale(0.7, 0.7);
    tc.direction = "rtl";
    def.art?.(tc, TONES.wine, def.sample ?? "", false);
    stickerCache[id] = thumb;
    return thumb;
  }
  const size = 700,
    pad = 50,
    k = (size - pad * 2) / 300;
  const art = document.createElement("canvas");
  art.width = art.height = size;
  const c = art.getContext("2d") as Ctx;
  c.translate(pad, pad);
  c.scale(k, k);
  STICKERS[id].art?.(c, TONES.wine, "", false);
  const silhouette = document.createElement("canvas");
  silhouette.width = silhouette.height = size;
  const sc = silhouette.getContext("2d") as Ctx;
  sc.drawImage(art, 0, 0);
  sc.globalCompositeOperation = "source-in";
  sc.fillStyle = "#fff";
  sc.fillRect(0, 0, size, size);
  const out = document.createElement("canvas");
  out.width = out.height = size;
  const oc = out.getContext("2d") as Ctx;
  const r = 20;
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    oc.drawImage(silhouette, Math.cos(a) * r, Math.sin(a) * r);
  }
  oc.drawImage(art, 0, 0);
  stickerCache[id] = out;
  return out;
}
/** A photo cut out along its own edge with a white margin round it, made once per photo and crop. */
const CUT_LONG = 900;
const cutCache = new Map<string, HTMLCanvasElement>();
function cutOut(
  img: HTMLImageElement,
  key: string,
  crop: Crop,
  w: number,
  h: number,
  share: number,
  color: string,
) {
  const id = `${key}|${crop.z ?? 1}|${crop.fx ?? 0.5}|${crop.fy ?? 0.05}|${(w / h).toFixed(3)}|${share}|${color}`;
  const kept = cutCache.get(id);
  if (kept) return kept;
  // Drawn at a fixed resolution, whatever the size on the post, so a drag never makes it again.
  const long = CUT_LONG;
  const cw = Math.round(w >= h ? long : (long * w) / h);
  const ch = Math.round(w >= h ? (long * h) / w : long);
  const edge = Math.round(long * share);
  const art = document.createElement("canvas");
  art.width = cw + edge * 2;
  art.height = ch + edge * 2;
  coverImage(art.getContext("2d") as Ctx, img, edge, edge, cw, ch, crop);
  const silhouette = document.createElement("canvas");
  silhouette.width = art.width;
  silhouette.height = art.height;
  const sc = silhouette.getContext("2d") as Ctx;
  sc.drawImage(art, 0, 0);
  sc.globalCompositeOperation = "source-in";
  sc.fillStyle = color;
  sc.fillRect(0, 0, art.width, art.height);
  const out = document.createElement("canvas");
  out.width = art.width;
  out.height = art.height;
  const oc = out.getContext("2d") as Ctx;
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    oc.drawImage(silhouette, Math.cos(a) * edge, Math.sin(a) * edge);
  }
  oc.drawImage(art, 0, 0);
  if (cutCache.size > 40) cutCache.delete(cutCache.keys().next().value as string);
  cutCache.set(id, out);
  return out;
}

function withShadow(ctx: Ctx, on: boolean, draw: () => void) {
  ctx.save();
  if (on) {
    ctx.shadowColor = "rgba(20,5,10,.34)";
    ctx.shadowBlur = 26;
    ctx.shadowOffsetY = 10;
  }
  draw();
  ctx.restore();
}

function tapeStrip(ctx: Ctx, x: number, y: number, w: number, turn: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(turn);
  ctx.fillStyle = "rgba(240,226,200,.78)";
  ctx.fillRect(-w / 2, -w * 0.17, w, w * 0.34);
  ctx.restore();
}

/** A photo laid on a post, in its frame: bare, cut out, a print or taped on. */
function drawLaidPhoto(ctx: Ctx, st: Sticker, g: Geometry, photos: PhotoBook) {
  const ph = photos[st.photo ?? ""];
  const frame = frameOf(st);
  const { w, h } = photoBox(st, ph?.img);
  const crop: Crop = { z: 1, fx: 0.5, fy: 0.05, ...(st.crop || {}) };
  ctx.save();
  ctx.translate(st.x * g.W, st.y * g.H);
  ctx.rotate(((st.r || 0) * Math.PI) / 180);
  if (st.flip) ctx.scale(-1, 1);
  const shadow = shadowOf(st);
  if (frame === "polaroid") {
    withShadow(ctx, shadow, () => {
      ctx.fillStyle = "#FFFDFB";
      roundRect(ctx, -w / 2, -h / 2, w, h, 8);
      ctx.fill();
    });
    coverImage(ctx, ph?.img, -w / 2 + 14, -h / 2 + 14, w - 28, h - 28, crop);
  } else if (frame === "cut" && ph?.img) {
    const cut = cutOut(ph.img, st.photo ?? "", crop, w, h, edgeShare(st), edgeColorOf(st));
    // The cut's photo is CUT_LONG on its long side: scale that to the box, its white edge with it.
    const k = Math.max(w, h) / CUT_LONG;
    const dw = cut.width * k,
      dh = cut.height * k;
    withShadow(ctx, shadow, () => ctx.drawImage(cut, -dw / 2, -dh / 2, dw, dh));
  } else {
    withShadow(ctx, shadow, () => coverImage(ctx, ph?.img, -w / 2, -h / 2, w, h, crop));
    if (frame === "tape") {
      const tape = Math.min(w, h) * 0.34;
      tapeStrip(ctx, -w / 2 + tape * 0.3, -h / 2 + tape * 0.05, tape, -0.7);
      tapeStrip(ctx, w / 2 - tape * 0.3, -h / 2 + tape * 0.05, tape, 0.7);
    }
  }
  ctx.restore();
}
export function drawSticker(
  ctx: Ctx,
  st: Sticker,
  g: Geometry,
  s: Post,
  tone: Tone,
  photos: PhotoBook,
) {
  if (st.id === "photo") {
    drawLaidPhoto(ctx, st, g, photos);
    return;
  }
  if (!STICKERS[st.id]) return;
  const def = STICKERS[st.id];
  if (def.stitch) {
    ctx.save();
    ctx.translate(st.x * g.W, st.y * g.H);
    ctx.rotate(((st.r || 0) * Math.PI) / 180);
    const k = st.s / 1000;
    ctx.scale(st.flip ? -k : k, k);
    ctx.translate(-500, -500);
    def.art?.(ctx, tone, s.bag ?? def.sample ?? "", !!st.flip);
    ctx.restore();
    return;
  }
  const img = stickerCanvas(st.id);
  ctx.save();
  ctx.translate(st.x * g.W, st.y * g.H);
  ctx.rotate(((st.r || 0) * Math.PI) / 180);
  if (st.flip) ctx.scale(-1, 1);
  ctx.shadowColor = "rgba(20,5,10,.32)";
  ctx.shadowBlur = 22;
  ctx.shadowOffsetY = 8;
  ctx.drawImage(img, -st.s / 2, -st.s / 2, st.s, st.s);
  ctx.restore();
}
