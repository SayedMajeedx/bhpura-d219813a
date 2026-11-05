import { HAND } from "./tones";
import { drawLogo } from "./text";
import type { Ctx } from "./types";

/* What the stickers are drawn with, in a 300 box. Each is cut out with a white edge when it is placed. */

export const DARK = "#231517";
export function googly(c: Ctx, x: number, y: number, r: number, dx = 0, dy = 0) {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fillStyle = "#fff";
  c.fill();
  c.lineWidth = 5;
  c.strokeStyle = DARK;
  c.stroke();
  c.beginPath();
  c.arc(x + dx * r * 0.4, y + dy * r * 0.4, r * 0.56, 0, Math.PI * 2);
  c.fillStyle = DARK;
  c.fill();
  c.beginPath();
  c.arc(x + dx * r * 0.4 - r * 0.18, y + dy * r * 0.4 - r * 0.2, r * 0.13, 0, Math.PI * 2);
  c.fillStyle = "#fff";
  c.fill();
}
export function tear(c: Ctx, x: number, y: number, s = 1) {
  c.beginPath();
  c.moveTo(x, y - 18 * s);
  c.bezierCurveTo(x + 13 * s, y + 2 * s, x + 11 * s, y + 15 * s, x, y + 15 * s);
  c.bezierCurveTo(x - 11 * s, y + 15 * s, x - 13 * s, y + 2 * s, x, y - 18 * s);
  c.fillStyle = "#86BEDD";
  c.fill();
  c.lineWidth = 3;
  c.strokeStyle = DARK;
  c.stroke();
}
export function hangerBody(c: Ctx) {
  c.lineCap = "round";
  c.lineJoin = "round";
  c.strokeStyle = "#8D8B90";
  c.lineWidth = 10;
  c.beginPath();
  c.moveTo(150, 112);
  c.lineTo(150, 84);
  c.bezierCurveTo(150, 62, 184, 62, 184, 40);
  c.bezierCurveTo(184, 16, 132, 12, 126, 42);
  c.stroke();
  const arch = () => {
    c.beginPath();
    c.moveTo(24, 240);
    c.bezierCurveTo(68, 186, 116, 138, 150, 126);
    c.bezierCurveTo(184, 138, 232, 186, 276, 240);
  };
  arch();
  c.closePath();
  c.fillStyle = "#F3E0C4";
  c.fill();
  c.strokeStyle = DARK;
  c.lineWidth = 39;
  arch();
  c.stroke();
  c.strokeStyle = "#CC9C63";
  c.lineWidth = 30;
  arch();
  c.stroke();
  c.strokeStyle = DARK;
  c.lineWidth = 15;
  c.beginPath();
  c.moveTo(38, 246);
  c.lineTo(262, 246);
  c.stroke();
  c.strokeStyle = "#B98A53";
  c.lineWidth = 8;
  c.beginPath();
  c.moveTo(38, 246);
  c.lineTo(262, 246);
  c.stroke();
  drawLogo(c, 127, 118, 46, "#330a0a");
}
export const mouth: Record<string, (c: Ctx, x: number, y: number) => void> = {
  o(c, x, y) {
    c.beginPath();
    c.ellipse(x, y, 10, 13, 0, 0, Math.PI * 2);
    c.fillStyle = "#3C0A1B";
    c.fill();
  },
  smile(c, x, y) {
    c.beginPath();
    c.arc(x, y - 8, 15, 0.15 * Math.PI, 0.85 * Math.PI);
    c.lineWidth = 5.5;
    c.lineCap = "round";
    c.strokeStyle = "#3C0A1B";
    c.stroke();
  },
  flat(c, x, y) {
    c.beginPath();
    c.moveTo(x - 13, y + 1);
    c.lineTo(x + 13, y - 3);
    c.lineWidth = 5.5;
    c.lineCap = "round";
    c.strokeStyle = "#3C0A1B";
    c.stroke();
  },
  sad(c, x, y) {
    c.beginPath();
    c.arc(x, y + 14, 14, 1.2 * Math.PI, 1.8 * Math.PI);
    c.lineWidth = 5.5;
    c.lineCap = "round";
    c.strokeStyle = "#3C0A1B";
    c.stroke();
  },
};
export function bubble(c: Ctx, text: string, fill: string, ink: string, tailLeft: boolean) {
  c.fillStyle = fill;
  c.strokeStyle = DARK;
  c.lineWidth = 5;
  c.lineJoin = "round";
  c.beginPath();
  roundRectPath(c, 14, 62, 272, 136, 44);
  c.fill();
  c.stroke();
  const tx = tailLeft ? 70 : 230;
  c.beginPath();
  c.moveTo(tx - 22, 192);
  c.lineTo(tx + (tailLeft ? -14 : 14), 238);
  c.lineTo(tx + 24, 192);
  c.closePath();
  c.fill();
  c.stroke();
  c.beginPath();
  c.moveTo(tx - 20, 195);
  c.lineTo(tx + 22, 195);
  c.lineWidth = 7;
  c.strokeStyle = fill;
  c.stroke();
  c.fillStyle = ink;
  c.direction = "rtl";
  c.textAlign = "center";
  c.textBaseline = "middle";
  let size = 58;
  do {
    c.font = `700 ${size}px ${HAND}`;
    size -= 2;
  } while (c.measureText(text).width > 240 && size > 22);
  c.fillText(text, 150, 130);
  c.textBaseline = "alphabetic";
}
export function roundRectPath(c: Ctx, x: number, y: number, w: number, h: number, r: number) {
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
export function bolt(c: Ctx, x: number, y: number, k: number, tilt = 0) {
  c.save();
  c.translate(x, y);
  c.rotate(tilt);
  c.scale(k, k);
  c.beginPath();
  [
    [6, -52],
    [-30, 8],
    [-5, 8],
    [-16, 52],
    [32, -14],
    [6, -14],
    [20, -52],
  ].forEach(([a, b], i) => (i ? c.lineTo(a, b) : c.moveTo(a, b)));
  c.closePath();
  c.fillStyle = "#F5C542";
  c.fill();
  c.setLineDash([]);
  c.lineJoin = "round";
  c.lineWidth = 5;
  c.strokeStyle = DARK;
  c.stroke();
  c.restore();
}
