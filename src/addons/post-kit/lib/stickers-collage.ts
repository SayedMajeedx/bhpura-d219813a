import { AR, HAND } from "./tones";
import { fit, roundRect } from "./text";
import type { Ctx, StickerDef, Tone } from "./types";

/*
 * The collage pieces of a meme post, drawn by hand in a 1000 box and in the cloth's own colours:
 * torn paper and tape, arrows and marks, and the shapes words sit in. Each piece with words carries
 * its own (`Sticker.text`), set the right way round however the piece is flipped.
 */

/** The same wobble every time, so a piece looks hand-drawn but never changes between draws. */
function seeded(seed: number) {
  let n = seed;
  return () => {
    n = (n * 16807) % 2147483647;
    return n / 2147483647;
  };
}

/** Draws words the right way round on a piece that may be flipped. */
function readable(c: Ctx, flipped: boolean, draw: () => void) {
  c.save();
  if (flipped) {
    c.translate(1000, 0);
    c.scale(-1, 1);
  }
  draw();
  c.restore();
}

/** Words centred in a box of the piece, as large as the box lets them be. */
function wordsIn(
  c: Ctx,
  text: string,
  cx: number,
  cy: number,
  w: number,
  h: number,
  family: string,
  weight: number,
  color: string,
  maxSize = 130,
) {
  const words = text.replace(/\*/g, "").trim();
  if (!words) return;
  const layout = fit(c, words, family, weight, maxSize, 34, w, h, 1.25);
  c.save();
  c.font = `${weight} ${layout.size}px ${family}`;
  c.textAlign = "center";
  c.direction = "rtl";
  c.fillStyle = color;
  const total = layout.lines.length * layout.size * layout.lh;
  let y = cy - total / 2 + layout.size * 0.95;
  for (const line of layout.lines) {
    c.fillText(line.tokens.map((t) => t.t).join(" "), cx, y);
    y += layout.size * layout.lh;
  }
  c.restore();
}

function stroke(c: Ctx, color: string, width: number) {
  c.strokeStyle = color;
  c.lineWidth = width;
  c.lineCap = "round";
  c.lineJoin = "round";
  c.stroke();
}

/** An arrowhead at the end of a stroke, pointing along `angle`. */
function head(c: Ctx, x: number, y: number, angle: number, size: number, color: string) {
  c.beginPath();
  c.moveTo(x - Math.cos(angle - 0.5) * size, y - Math.sin(angle - 0.5) * size);
  c.lineTo(x, y);
  c.lineTo(x - Math.cos(angle + 0.45) * size * 0.9, y - Math.sin(angle + 0.45) * size * 0.9);
  stroke(c, color, 24);
}

/** A torn strip of notebook paper with the merchant's words in handwriting. */
function tornPaper(c: Ctx, _tone: Tone, text: string, flipped: boolean) {
  const rand = seeded(11);
  const left = 90,
    right = 910,
    top = 300,
    bottom = 700;
  c.save();
  c.translate(500, 500);
  c.rotate(-0.04);
  c.translate(-500, -500);
  c.shadowColor = "rgba(20,5,10,.3)";
  c.shadowBlur = 24;
  c.shadowOffsetY = 10;
  c.beginPath();
  c.moveTo(left, top);
  for (let x = left; x <= right; x += 26) c.lineTo(x, top + (rand() - 0.5) * 30);
  c.lineTo(right, bottom);
  for (let x = right; x >= left; x -= 22) c.lineTo(x, bottom + (rand() - 0.5) * 34);
  c.closePath();
  c.fillStyle = "#FBF7EF";
  c.fill();
  c.shadowColor = "transparent";
  c.strokeStyle = "rgba(90,120,170,.22)";
  c.lineWidth = 3;
  for (let y = top + 70; y < bottom - 20; y += 62) {
    c.beginPath();
    c.moveTo(left + 20, y);
    c.lineTo(right - 20, y);
    c.stroke();
  }
  c.restore();
  readable(c, flipped, () => wordsIn(c, text, 500, 500, 700, 330, HAND, 600, "#2A1A1E", 170));
}

/** A strip of tape, its ends cut in a zigzag. */
function tape(c: Ctx) {
  c.save();
  c.translate(500, 500);
  c.rotate(-0.14);
  const w = 760,
    h = 170;
  c.beginPath();
  c.moveTo(-w / 2, -h / 2);
  c.lineTo(w / 2, -h / 2);
  for (let i = 0; i <= 6; i++) c.lineTo(w / 2 + (i % 2 ? -18 : 0), -h / 2 + (h * i) / 6);
  c.lineTo(-w / 2, h / 2);
  for (let i = 6; i >= 0; i--) c.lineTo(-w / 2 + (i % 2 ? 18 : 0), -h / 2 + (h * i) / 6);
  c.closePath();
  c.fillStyle = "rgba(240,226,200,.84)";
  c.fill();
  c.strokeStyle = "rgba(160,130,90,.25)";
  c.lineWidth = 3;
  c.stroke();
  c.restore();
}

function arrowStraight(c: Ctx, tone: Tone) {
  const rand = seeded(5);
  c.beginPath();
  c.moveTo(170, 650);
  for (let t = 0.1; t <= 1; t += 0.1) {
    c.lineTo(170 + 640 * t + (rand() - 0.5) * 10, 650 - 300 * t + (rand() - 0.5) * 10);
  }
  stroke(c, tone.ink, 24);
  head(c, 810, 350, Math.atan2(-300, 640), 120, tone.ink);
}

function arrowCurve(c: Ctx, tone: Tone) {
  c.beginPath();
  c.moveTo(160, 760);
  c.quadraticCurveTo(220, 260, 820, 330);
  stroke(c, tone.ink, 24);
  head(c, 820, 330, Math.atan2(330 - 260, 820 - 220), 120, tone.ink);
}

function arrowLoop(c: Ctx, tone: Tone) {
  c.beginPath();
  c.moveTo(120, 700);
  c.bezierCurveTo(330, 760, 560, 700, 520, 520);
  c.bezierCurveTo(480, 360, 300, 460, 400, 560);
  c.bezierCurveTo(520, 680, 760, 520, 850, 330);
  stroke(c, tone.ink, 22);
  head(c, 850, 330, Math.atan2(-190, 90), 115, tone.ink);
}

/** A loose ring drawn twice round, as a pen circles something. */
function scribbleCircle(c: Ctx, tone: Tone) {
  const rand = seeded(3);
  c.beginPath();
  for (let a = 0; a <= Math.PI * 4.3; a += 0.12) {
    const r = 1 + (rand() - 0.5) * 0.05 + a * 0.008;
    c.lineTo(500 + Math.cos(a - 0.6) * 400 * r, 500 + Math.sin(a - 0.6) * 260 * r);
  }
  stroke(c, tone.ink, 18);
}

function underline(c: Ctx, tone: Tone) {
  c.beginPath();
  for (let x = 110; x <= 890; x += 10) c.lineTo(x, 520 + Math.sin((x - 110) / 52) * 22);
  stroke(c, tone.ink, 22);
  c.beginPath();
  c.moveTo(190, 610);
  c.quadraticCurveTo(520, 570, 820, 600);
  stroke(c, tone.ink, 14);
}

function heartDoodle(c: Ctx, tone: Tone) {
  c.beginPath();
  c.moveTo(500, 820);
  c.bezierCurveTo(140, 600, 120, 290, 330, 240);
  c.bezierCurveTo(440, 215, 500, 320, 505, 380);
  c.bezierCurveTo(520, 300, 600, 210, 700, 240);
  c.bezierCurveTo(900, 300, 860, 600, 490, 830);
  stroke(c, tone.ink, 22);
}

/** A speech bubble, white as a chat's, its words dark. */
function bubble(c: Ctx, _tone: Tone, text: string, flipped: boolean) {
  c.save();
  c.shadowColor = "rgba(20,5,10,.28)";
  c.shadowBlur = 22;
  c.shadowOffsetY = 8;
  roundRect(c, 110, 190, 780, 500, 110);
  c.fillStyle = "#FFFFFF";
  c.fill();
  c.beginPath();
  c.moveTo(300, 660);
  c.lineTo(250, 860);
  c.lineTo(440, 680);
  c.closePath();
  c.fill();
  c.restore();
  readable(c, flipped, () => wordsIn(c, text, 500, 440, 640, 400, AR, 700, "#171214", 120));
}

/** A starburst in the label's colour, for a shout. */
function burst(c: Ctx, tone: Tone, text: string, flipped: boolean) {
  c.beginPath();
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    const r = i % 2 ? 330 : 440;
    c.lineTo(500 + Math.cos(a) * r, 500 + Math.sin(a) * r * 0.86);
  }
  c.closePath();
  c.fillStyle = tone.tag;
  c.fill();
  c.strokeStyle = tone.tagInk;
  c.globalAlpha = 0.5;
  c.lineWidth = 6;
  c.setLineDash([16, 12]);
  c.stroke();
  c.setLineDash([]);
  c.globalAlpha = 1;
  readable(c, flipped, () => wordsIn(c, text, 500, 500, 460, 330, AR, 800, tone.tagInk, 140));
}

/** A shop's hanging tag on its string, for an offer's words: never a price written in. */
function priceTag(c: Ctx, tone: Tone, text: string, flipped: boolean) {
  c.save();
  c.translate(500, 520);
  c.rotate(-0.12);
  c.beginPath();
  c.moveTo(-300, -190);
  c.lineTo(330, -190);
  c.lineTo(420, 0);
  c.lineTo(330, 190);
  c.lineTo(-300, 190);
  c.closePath();
  c.fillStyle = tone.tag;
  c.fill();
  c.beginPath();
  c.arc(310, 0, 30, 0, Math.PI * 2);
  c.fillStyle = tone.bg;
  c.fill();
  c.beginPath();
  c.moveTo(310, 0);
  c.bezierCurveTo(400, -160, 480, -240, 470, -380);
  stroke(c, tone.ink, 8);
  c.restore();
  readable(c, flipped, () => {
    c.save();
    c.translate(500, 520);
    c.rotate(flipped ? 0.12 : -0.12);
    wordsIn(c, text, -40, 0, 500, 300, AR, 800, tone.tagInk, 130);
    c.restore();
  });
}

const marks = { group: "marks" as const, bare: true };
const words = { group: "words" as const, bare: true, ownText: true };

export const COLLAGE_STICKERS: Record<string, StickerDef> = {
  "torn-paper": {
    name: { ar: "ورقة ممزقة", en: "Torn paper" },
    group: "paper",
    bare: true,
    ownText: true,
    sample: "شلون صرت",
    art: tornPaper,
  },
  tape: { name: { ar: "شريط لاصق", en: "Tape" }, group: "paper", bare: true, art: tape },
  "arrow-straight": { name: { ar: "سهم", en: "Arrow" }, ...marks, art: arrowStraight },
  "arrow-curve": { name: { ar: "سهم منحني", en: "Curved arrow" }, ...marks, art: arrowCurve },
  "arrow-loop": { name: { ar: "سهم لولبي", en: "Loop arrow" }, ...marks, art: arrowLoop },
  "scribble-circle": {
    name: { ar: "دائرة شخبطة", en: "Scribbled circle" },
    ...marks,
    art: scribbleCircle,
  },
  underline: { name: { ar: "خط تحت", en: "Underline" }, ...marks, art: underline },
  "heart-doodle": { name: { ar: "قلب", en: "Heart" }, ...marks, art: heartDoodle },
  bubble: {
    name: { ar: "فقاعة كلام", en: "Speech bubble" },
    ...words,
    sample: "ما أقدر!",
    art: bubble,
  },
  burst: { name: { ar: "انفجار", en: "Burst" }, ...words, sample: "جديد!", art: burst },
  "price-tag": { name: { ar: "تاق", en: "Tag" }, ...words, sample: "عرض", art: priceTag },
};
