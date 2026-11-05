import { DARK, googly, tear, hangerBody, mouth, roundRectPath } from "./sticker-kit";
import type { StickerDef } from "./types";

/* Shammoua, the wooden hanger, in every mood. */
export const HANGER_STICKERS: Record<string, StickerDef> = {
  "hanger-shock": {
    name: { ar: "شمّوعة منصدمة", en: "Shammoua shocked" },
    art(c) {
      hangerBody(c);
      googly(c, 122, 182, 27, 0, 0);
      googly(c, 178, 182, 27, 0, 0);
      mouth.o(c, 150, 222);
    },
  },
  "hanger-smile": {
    name: { ar: "شمّوعة مبسوطة", en: "Shammoua smiling" },
    art(c) {
      hangerBody(c);
      googly(c, 122, 182, 27, 0.2, 0.3);
      googly(c, 178, 182, 27, 0.2, 0.3);
      mouth.smile(c, 150, 222);
    },
  },
  "hanger-side": {
    name: { ar: "شمّوعة تطالع", en: "Shammoua side-eye" },
    art(c) {
      hangerBody(c);
      googly(c, 122, 182, 27, -1, 0.1);
      googly(c, 178, 182, 27, -1, 0.1);
      mouth.flat(c, 150, 224);
    },
  },
  "hanger-cry": {
    name: { ar: "شمّوعة تصيح", en: "Shammoua crying" },
    art(c) {
      hangerBody(c);
      googly(c, 122, 182, 27, 0, -0.8);
      googly(c, 178, 182, 27, 0, -0.8);
      mouth.sad(c, 150, 220);
      tear(c, 94, 214);
      tear(c, 206, 214);
    },
  },
  "hanger-sick": {
    name: { ar: "شمّوعة مريضة", en: "Shammoua sick" },
    art(c) {
      hangerBody(c);
      googly(c, 122, 176, 26, 1, 0);
      googly(c, 178, 176, 26, 1, 0);
      c.lineWidth = 4;
      c.strokeStyle = DARK;
      c.beginPath();
      c.moveTo(100, 208);
      c.lineTo(84, 192);
      c.moveTo(200, 208);
      c.lineTo(216, 192);
      c.stroke();
      c.beginPath();
      roundRectPath(c, 100, 200, 100, 40, 9);
      c.fillStyle = "#DCEEF3";
      c.fill();
      c.lineWidth = 4;
      c.stroke();
      c.lineWidth = 2.5;
      c.beginPath();
      c.moveTo(108, 213);
      c.lineTo(192, 213);
      c.moveTo(108, 226);
      c.lineTo(192, 226);
      c.stroke();
    },
  },
  "hanger-beg": {
    name: { ar: "شمّوعة تترجى", en: "Shammoua begging" },
    art(c) {
      hangerBody(c);
      googly(c, 122, 182, 30, 0, -0.75);
      googly(c, 178, 182, 30, 0, -0.75);
      c.lineCap = "round";
      c.lineWidth = 5;
      c.strokeStyle = "#3C0A1B";
      c.beginPath();
      c.moveTo(98, 150);
      c.lineTo(122, 140);
      c.moveTo(202, 150);
      c.lineTo(178, 140);
      c.stroke();
      mouth.sad(c, 150, 222);
      tear(c, 92, 218, 0.9);
    },
  },
  "hanger-mad": {
    name: { ar: "شمّوعة معصبة", en: "Shammoua angry" },
    art(c) {
      hangerBody(c);
      googly(c, 122, 186, 26, 0, 0);
      googly(c, 178, 186, 26, 0, 0);
      c.lineCap = "round";
      c.lineWidth = 9;
      c.strokeStyle = "#3C0A1B";
      c.beginPath();
      c.moveTo(92, 150);
      c.lineTo(142, 168);
      c.moveTo(208, 150);
      c.lineTo(158, 168);
      c.stroke();
      mouth.flat(c, 150, 226);
    },
  },
  "hanger-old": {
    name: { ar: "شمّوعة شابت", en: "Shammoua old" },
    art(c) {
      hangerBody(c);
      googly(c, 122, 182, 26, 0, 0.3);
      googly(c, 178, 182, 26, 0, 0.3);
      /* heavy lids, white brows and a long white beard */
      c.fillStyle = "#CC9C63";
      c.beginPath();
      c.arc(122, 182, 25, Math.PI, 2 * Math.PI);
      c.fill();
      c.beginPath();
      c.arc(178, 182, 25, Math.PI, 2 * Math.PI);
      c.fill();
      c.lineWidth = 4;
      c.strokeStyle = DARK;
      c.beginPath();
      c.moveTo(96, 182);
      c.lineTo(148, 182);
      c.moveTo(152, 182);
      c.lineTo(204, 182);
      c.stroke();
      c.lineCap = "round";
      c.lineWidth = 11;
      c.strokeStyle = "#F4F1EC";
      c.beginPath();
      c.moveTo(96, 156);
      c.lineTo(142, 166);
      c.moveTo(204, 156);
      c.lineTo(158, 166);
      c.stroke();
      c.lineWidth = 4;
      c.fillStyle = "#F4F1EC";
      c.strokeStyle = DARK;
      c.lineJoin = "round";
      c.beginPath();
      c.moveTo(104, 214);
      c.quadraticCurveTo(150, 232, 196, 214);
      c.quadraticCurveTo(206, 262, 178, 262);
      c.quadraticCurveTo(178, 288, 150, 298);
      c.quadraticCurveTo(122, 288, 122, 262);
      c.quadraticCurveTo(94, 262, 104, 214);
      c.closePath();
      c.fill();
      c.stroke();
    },
  },
  "hanger-cool": {
    name: { ar: "شمّوعة بنظارة", en: "Shammoua in sunglasses" },
    art(c) {
      hangerBody(c);
      c.fillStyle = DARK;
      c.strokeStyle = DARK;
      c.lineCap = "round";
      c.lineWidth = 7;
      c.beginPath();
      c.moveTo(88, 168);
      c.lineTo(212, 168);
      c.stroke();
      c.beginPath();
      roundRectPath(c, 92, 164, 56, 40, 13);
      c.fill();
      c.beginPath();
      roundRectPath(c, 152, 164, 56, 40, 13);
      c.fill();
      c.strokeStyle = "#FFFDFB";
      c.lineWidth = 4;
      c.beginPath();
      c.moveTo(104, 193);
      c.lineTo(120, 174);
      c.moveTo(164, 193);
      c.lineTo(180, 174);
      c.stroke();
      c.strokeStyle = "#3C0A1B";
      c.lineWidth = 5.5;
      c.beginPath();
      c.moveTo(130, 224);
      c.quadraticCurveTo(156, 236, 174, 216);
      c.stroke();
    },
  },
  "hanger-broke": {
    name: { ar: "شمّوعة مفلسة", en: "Shammoua broke" },
    art(c) {
      hangerBody(c);
      googly(c, 122, 176, 31, 0, -0.65);
      googly(c, 178, 176, 31, 0, -0.65);
      c.lineCap = "round";
      c.lineWidth = 6;
      c.strokeStyle = "#3C0A1B";
      c.beginPath();
      c.moveTo(94, 148);
      c.lineTo(126, 132);
      c.moveTo(206, 148);
      c.lineTo(174, 132);
      c.stroke();
      c.beginPath();
      c.ellipse(150, 224, 25, 15, 0, 0, Math.PI * 2);
      c.fillStyle = "#3C0A1B";
      c.fill();
      c.beginPath();
      c.ellipse(150, 231, 13, 7, 0, 0, Math.PI * 2);
      c.fillStyle = "#E8919B";
      c.fill();
      [
        [84, 206, 1],
        [66, 240, 0.8],
        [216, 206, 1],
        [234, 240, 0.8],
        [100, 262, 0.7],
        [200, 262, 0.7],
      ].forEach(([x, y, k]) => tear(c, x, y, k));
    },
  },
};
