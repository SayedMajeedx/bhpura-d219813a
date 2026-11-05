import { TONES } from "./tones";
import { coverImage } from "./frame";
import { roundRect } from "./text";
import { HANGER_STICKERS } from "./stickers-hanger";
import { OTHER_STICKERS } from "./stickers-other";
import { sceneHusband, sceneMind, scenePhone, sceneSign } from "./scenes";
import { sceneCalc, sceneNote, sceneOwl, sceneSalary, sceneWell } from "./scenes-more";
import type { Ctx, Geometry, PhotoBook, Post, Sticker, StickerDef, Tone } from "./types";

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
function drawPhotoCard(ctx: Ctx, st: Sticker, g: Geometry, photos: PhotoBook) {
  const w = st.s * 0.8,
    h = st.s;
  ctx.save();
  ctx.translate(st.x * g.W, st.y * g.H);
  ctx.rotate(((st.r || 0) * Math.PI) / 180);
  ctx.save();
  ctx.shadowColor = "rgba(20,5,10,.34)";
  ctx.shadowBlur = 26;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = "#FFFDFB";
  roundRect(ctx, -w / 2, -h / 2, w, h, 8);
  ctx.fill();
  ctx.restore();
  const ph = photos[st.photo ?? ""];
  coverImage(ctx, ph?.img, -w / 2 + 14, -h / 2 + 14, w - 28, h - 28, {
    z: 1,
    fx: 0.5,
    fy: 0.05,
    ...(st.crop || {}),
  });
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
    drawPhotoCard(ctx, st, g, photos);
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
