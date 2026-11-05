import { AR } from "./tones";
import { drawLogo } from "./text";
import { DARK, googly, tear, mouth, bubble, roundRectPath, bolt } from "./sticker-kit";
import type { StickerDef } from "./types";

/* Everything else a post can wear: eyes, karak, a tape measure, words in bubbles. */
export const OTHER_STICKERS: Record<string, StickerDef> = {
  snip: {
    name: { ar: "مقص الخياط", en: "Tailor's scissors" },
    art(c) {
      c.lineCap = "round";
      [
        [96, 268, 196, 24],
        [204, 268, 104, 24],
      ].forEach(([x1, y1, x2, y2]) => {
        c.strokeStyle = DARK;
        c.lineWidth = 29;
        c.beginPath();
        c.moveTo(x1, y1 - 30);
        c.lineTo(x2, y2);
        c.stroke();
        c.strokeStyle = "#D5D6DA";
        c.lineWidth = 21;
        c.beginPath();
        c.moveTo(x1, y1 - 30);
        c.lineTo(x2, y2);
        c.stroke();
      });
      [
        [88, 256],
        [212, 256],
      ].forEach(([x, y]) => {
        c.strokeStyle = DARK;
        c.lineWidth = 22;
        c.beginPath();
        c.arc(x, y, 30, 0, Math.PI * 2);
        c.stroke();
        c.strokeStyle = "#6E2038";
        c.lineWidth = 13;
        c.beginPath();
        c.arc(x, y, 30, 0, Math.PI * 2);
        c.stroke();
      });
      c.beginPath();
      c.arc(150, 142, 9, 0, Math.PI * 2);
      c.fillStyle = DARK;
      c.fill();
    },
  },
  web: {
    name: { ar: "بيت عنكبوت", en: "Cobweb" },
    art(c) {
      c.lineCap = "round";
      c.lineWidth = 5;
      c.strokeStyle = "#5C5348";
      const spokes = [0, 0.26, 0.52, 0.78, 1];
      spokes.forEach((u) => {
        const a = (u * Math.PI) / 2;
        c.beginPath();
        c.moveTo(20, 20);
        c.lineTo(20 + Math.cos(a) * 262, 20 + Math.sin(a) * 262);
        c.stroke();
      });
      [80, 150, 220].forEach((r) => {
        c.beginPath();
        spokes.forEach((u, i) => {
          const a = (u * Math.PI) / 2,
            x = 20 + Math.cos(a) * r,
            y = 20 + Math.sin(a) * r;
          if (!i) {
            c.moveTo(x, y);
            return;
          }
          const m = ((u - 0.13) * Math.PI) / 2;
          c.quadraticCurveTo(20 + Math.cos(m) * (r - 22), 20 + Math.sin(m) * (r - 22), x, y);
        });
        c.stroke();
      });
      c.beginPath();
      c.moveTo(175, 175);
      c.lineTo(175, 228);
      c.stroke();
      c.beginPath();
      c.ellipse(175, 244, 15, 18, 0, 0, Math.PI * 2);
      c.fillStyle = "#231517";
      c.fill();
      c.strokeStyle = "#231517";
      c.lineWidth = 3.5;
      [
        [-1, -8],
        [-1, 2],
        [-1, 12],
        [1, -8],
        [1, 2],
        [1, 12],
      ].forEach(([dir, dy]) => {
        c.beginPath();
        c.moveTo(175, 244 + dy);
        c.lineTo(175 + dir * 30, 240 + dy * 1.6);
        c.stroke();
      });
    },
  },
  eyes: {
    name: { ar: "عيون", en: "Eyes" },
    art(c) {
      googly(c, 92, 150, 78, 0.6, 0.2);
      googly(c, 214, 150, 66, 0.6, 0.2);
    },
  },
  karak: {
    name: { ar: "كرك", en: "Karak" },
    art(c) {
      c.lineCap = "round";
      c.strokeStyle = "#B7A79C";
      c.lineWidth = 7;
      [125, 175].forEach((x) => {
        c.beginPath();
        c.moveTo(x, 62);
        c.bezierCurveTo(x - 18, 44, x + 18, 34, x, 14);
        c.stroke();
      });
      c.fillStyle = "#F7ECE6";
      c.strokeStyle = DARK;
      c.lineWidth = 5;
      c.lineJoin = "round";
      c.beginPath();
      c.moveTo(78, 92);
      c.lineTo(222, 92);
      c.lineTo(200, 288);
      c.lineTo(100, 288);
      c.closePath();
      c.fill();
      c.stroke();
      c.fillStyle = "#3C0A1B";
      c.beginPath();
      c.moveTo(89, 192);
      c.lineTo(211, 192);
      c.lineTo(203, 262);
      c.lineTo(97, 262);
      c.closePath();
      c.fill();
      c.beginPath();
      roundRectPath(c, 66, 72, 168, 26, 10);
      c.fillStyle = "#D8B992";
      c.fill();
      c.stroke();
      c.fillStyle = "#F7ECE6";
      c.font = `700 40px ${AR}`;
      c.textAlign = "center";
      c.direction = "rtl";
      c.fillText("كرك", 150, 243);
      googly(c, 124, 144, 26, -1, 0);
      googly(c, 178, 144, 26, -1, 0);
    },
  },
  tape: {
    name: { ar: "متر الخياط", en: "Tape measure" },
    art(c) {
      c.fillStyle = "#F7ECE6";
      c.strokeStyle = DARK;
      c.lineWidth = 5;
      c.lineJoin = "round";
      c.beginPath();
      c.rect(140, 214, 150, 42);
      c.fill();
      c.stroke();
      c.lineWidth = 3;
      for (let x = 160; x < 288; x += 16) {
        c.beginPath();
        c.moveTo(x, 216);
        c.lineTo(x, x % 32 === 0 ? 236 : 228);
        c.stroke();
      }
      c.lineWidth = 5;
      c.beginPath();
      c.arc(136, 138, 118, 0, Math.PI * 2);
      c.fillStyle = "#D8B992";
      c.fill();
      c.stroke();
      c.beginPath();
      c.arc(136, 138, 88, 0, Math.PI * 2);
      c.lineWidth = 3;
      c.setLineDash([9, 8]);
      c.strokeStyle = "#3C0A1B";
      c.stroke();
      c.setLineDash([]);
      googly(c, 104, 122, 31, 0.3, 0.2);
      googly(c, 168, 122, 31, 0.3, 0.2);
      mouth.smile(c, 136, 176);
    },
  },
  wallet: {
    name: { ar: "المحفظة", en: "Wallet" },
    art(c) {
      c.lineJoin = "round";
      c.strokeStyle = DARK;
      c.lineWidth = 5;
      c.fillStyle = "#6E2038";
      c.beginPath();
      roundRectPath(c, 36, 84, 228, 160, 24);
      c.fill();
      c.stroke();
      c.fillStyle = "#54162A";
      c.beginPath();
      c.moveTo(36, 110);
      c.lineTo(150, 170);
      c.lineTo(264, 110);
      c.lineTo(264, 104);
      c.arcTo(264, 84, 240, 84, 22);
      c.lineTo(60, 84);
      c.arcTo(36, 84, 36, 106, 22);
      c.closePath();
      c.fill();
      c.stroke();
      googly(c, 108, 158, 30, 0, -0.8);
      googly(c, 192, 158, 30, 0, -0.8);
      c.lineCap = "round";
      c.strokeStyle = "#F7ECE6";
      c.lineWidth = 6;
      c.beginPath();
      c.arc(150, 228, 22, 1.2 * Math.PI, 1.8 * Math.PI);
      c.stroke();
      tear(c, 76, 214, 1.1);
      tear(c, 224, 214, 1.1);
      tear(c, 56, 268, 0.8);
      tear(c, 244, 268, 0.8);
    },
  },
  bag: {
    name: { ar: "كيس بيورا", en: "Pura bag" },
    art(c) {
      c.lineJoin = "round";
      c.lineCap = "round";
      c.strokeStyle = DARK;
      c.lineWidth = 7;
      c.beginPath();
      c.arc(150, 88, 46, Math.PI, 0);
      c.stroke();
      c.lineWidth = 5;
      c.fillStyle = "#FFFDFB";
      c.beginPath();
      c.moveTo(62, 86);
      c.lineTo(238, 86);
      c.lineTo(258, 288);
      c.lineTo(42, 288);
      c.closePath();
      c.fill();
      c.stroke();
      drawLogo(c, 94, 226, 112, "#330a0a");
      googly(c, 118, 152, 30, 0.8, 0);
      googly(c, 182, 152, 30, 0.8, 0);
      mouth.smile(c, 150, 204);
    },
  },
  scissors: {
    name: { ar: "مقص", en: "Scissors" },
    art(c) {
      c.lineCap = "round";
      [
        [96, 270, 196, 24],
        [204, 270, 104, 24],
      ].forEach(([x1, y1, x2, y2]) => {
        c.strokeStyle = DARK;
        c.lineWidth = 31;
        c.beginPath();
        c.moveTo(x1, y1 - 30);
        c.lineTo(x2, y2);
        c.stroke();
        c.strokeStyle = "#C9CACF";
        c.lineWidth = 23;
        c.beginPath();
        c.moveTo(x1, y1 - 30);
        c.lineTo(x2, y2);
        c.stroke();
      });
      [
        [88, 256],
        [212, 256],
      ].forEach(([x, y]) => {
        c.strokeStyle = DARK;
        c.lineWidth = 22;
        c.beginPath();
        c.arc(x, y, 30, 0, Math.PI * 2);
        c.stroke();
        c.strokeStyle = "#6E2038";
        c.lineWidth = 13;
        c.beginPath();
        c.arc(x, y, 30, 0, Math.PI * 2);
        c.stroke();
      });
      googly(c, 118, 128, 28, 0.9, 0);
      googly(c, 182, 128, 28, 0.9, 0);
    },
  },
  arrow: {
    name: { ar: "سهم", en: "Arrow" },
    art(c) {
      c.lineCap = "round";
      c.lineJoin = "round";
      c.strokeStyle = "#3C0A1B";
      c.lineWidth = 16;
      c.beginPath();
      c.moveTo(254, 50);
      c.bezierCurveTo(210, 170, 130, 210, 58, 220);
      c.stroke();
      c.beginPath();
      c.moveTo(108, 164);
      c.lineTo(50, 222);
      c.lineTo(122, 266);
      c.stroke();
    },
  },
  sparkle: {
    name: { ar: "لمعة", en: "Sparkle" },
    art(c) {
      c.fillStyle = "#D8B992";
      c.strokeStyle = DARK;
      c.lineWidth = 5;
      c.lineJoin = "round";
      [
        [120, 126, 92],
        [228, 84, 42],
        [222, 226, 56],
      ].forEach(([x, y, r]) => {
        c.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (i * Math.PI) / 4,
            rr = i % 2 ? r * 0.2 : r;
          c.lineTo(x + Math.sin(a) * rr, y - Math.cos(a) * rr);
        }
        c.closePath();
        c.fill();
        c.stroke();
      });
    },
  },
  w1: {
    name: { ar: "ترا والله!", en: "Word: truly" },
    art(c) {
      bubble(c, "ترا والله!", "#D8B992", "#3C0A1B", false);
    },
  },
  w2: {
    name: { ar: "مو بس إنتي", en: "Word: not only you" },
    art(c) {
      bubble(c, "مو بس إنتي", "#FFFDFB", "#3C0A1B", true);
    },
  },
  w3: {
    name: { ar: "منشنيها!", en: "Word: tag her" },
    art(c) {
      bubble(c, "منشنيها!", "#3C0A1B", "#F7ECE6", false);
    },
  },
  w4: {
    name: { ar: "عاد!", en: "Word: come on" },
    art(c) {
      bubble(c, "عاد!", "#D8B992", "#3C0A1B", true);
    },
  },
  w5: {
    name: { ar: "لا تحكمين", en: "Word: no judging" },
    art(c) {
      bubble(c, "لا تحكمين", "#FFFDFB", "#3C0A1B", false);
    },
  },
  w7: {
    name: { ar: "اسحبي", en: "Word: swipe" },
    art(c) {
      bubble(c, "اسحبي", "#FFFDFB", "#3C0A1B", false);
    },
  },
  zap: {
    name: { ar: "كهربا", en: "Lightning" },
    art(c) {
      bolt(c, 150, 150, 2.5, 0.08);
    },
  },
  w8: {
    name: { ar: "مديرش ما يعرفش", en: "Word: your boss" },
    art(c) {
      bubble(c, "مديرش ما يعرفش", "#FFFDFB", "#3C0A1B", true);
    },
  },
  w9: {
    name: { ar: "الله يصبرني", en: "Word: patience" },
    art(c) {
      bubble(c, "الله يصبرني", "#D8B992", "#3C0A1B", true);
    },
  },
  w6: {
    name: { ar: "احفظيه", en: "Word: save it" },
    art(c) {
      bubble(c, "احفظيه", "#3C0A1B", "#F7ECE6", true);
    },
  },
};
