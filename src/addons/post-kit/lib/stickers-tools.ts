import { AR } from "./tones";
import { roundRect } from "./text";
import { threadOf } from "./looks";
import type { Ctx, StickerDef, Tone } from "./types";

/*
 * The workshop's tools as stickers, drawn in a 1000 box: a spool of thread, a needle trailing its
 * thread, a tape measure. Laid half off the post's edge they make it look bigger than the screen,
 * as the dressed looks' samples do. The thread is the look's (the cloth's gold on a dark cloth, its
 * ink on a light one), or the colour chosen for it.
 */

function spool(c: Ctx, tone: Tone) {
  c.save();
  c.translate(500, 500);
  c.scale(2.3, 2.3);
  c.shadowColor = "rgba(0,0,0,.35)";
  c.shadowBlur = 24;
  c.shadowOffsetY = 12;
  c.fillStyle = "#9C6E45";
  roundRect(c, -100, -134, 200, 40, 14);
  c.fill();
  roundRect(c, -100, 94, 200, 40, 14);
  c.fill();
  c.shadowColor = "transparent";
  c.fillStyle = "#D9B48A";
  roundRect(c, -100, -140, 200, 32, 14);
  c.fill();
  roundRect(c, -100, 88, 200, 32, 14);
  c.fill();
  c.fillStyle = threadOf(tone);
  c.fillRect(-74, -108, 148, 200);
  c.strokeStyle = "rgba(0,0,0,.2)";
  c.lineWidth = 3;
  for (let y = -100; y < 92; y += 9) {
    c.beginPath();
    c.moveTo(-74, y);
    c.lineTo(74, y + 6);
    c.stroke();
  }
  c.fillStyle = "rgba(255,255,255,.2)";
  c.fillRect(-52, -108, 24, 200);
  c.restore();
}

function needle(c: Ctx, tone: Tone) {
  // The thread first, curling away from the eye.
  c.save();
  c.strokeStyle = threadOf(tone);
  c.lineWidth = 9;
  c.lineCap = "round";
  c.beginPath();
  c.moveTo(330, 640);
  c.bezierCurveTo(140, 760, 220, 930, 420, 880);
  c.bezierCurveTo(620, 830, 640, 980, 520, 990);
  c.stroke();
  c.restore();
  c.save();
  c.translate(330, 640);
  c.rotate(-Math.PI / 4);
  c.shadowColor = "rgba(0,0,0,.35)";
  c.shadowBlur = 16;
  c.shadowOffsetY = 8;
  const len = 640;
  c.beginPath();
  c.moveTo(0, -14);
  c.lineTo(len, -4);
  c.lineTo(len + 60, 0);
  c.lineTo(len, 4);
  c.lineTo(0, 14);
  c.arc(0, 0, 14, Math.PI / 2, Math.PI * 1.5);
  c.fillStyle = "#D7D9DE";
  c.fill();
  c.shadowColor = "transparent";
  c.fillStyle = "rgba(255,255,255,.45)";
  c.fillRect(30, -9, len - 40, 4);
  c.beginPath();
  c.ellipse(30, 0, 18, 5, 0, 0, Math.PI * 2);
  c.fillStyle = "#6B6F78";
  c.fill();
  c.restore();
}

function tapeMeasure(c: Ctx) {
  c.save();
  c.translate(500, 500);
  c.rotate(-Math.PI / 4);
  const len = 1300;
  const h = 150;
  c.shadowColor = "rgba(0,0,0,.25)";
  c.shadowBlur = 20;
  c.shadowOffsetY = 10;
  c.fillStyle = "#E9C77B";
  c.fillRect(-len / 2, -h / 2, len, h);
  c.shadowColor = "transparent";
  c.strokeStyle = "#3C2A14";
  c.fillStyle = "#3C2A14";
  c.font = `600 44px ${AR}`;
  c.textAlign = "center";
  c.direction = "ltr";
  for (let i = 0, x = -len / 2 + 20; x < len / 2; i++, x += 24) {
    const long = i % 5 === 0;
    c.lineWidth = long ? 5 : 3;
    c.beginPath();
    c.moveTo(x, -h / 2);
    c.lineTo(x, -h / 2 + (long ? 52 : 28));
    c.stroke();
    if (i % 10 === 0) c.fillText(String(i / 10 + 1), x, h / 2 - 22);
  }
  c.restore();
}

const tool = { group: "tools" as const, bare: true };

export const TOOL_STICKERS: Record<string, StickerDef> = {
  "tool-spool": { name: { ar: "بكرة خيط", en: "Spool of thread" }, ...tool, art: spool },
  "tool-needle": { name: { ar: "إبرة وخيط", en: "Needle and thread" }, ...tool, art: needle },
  "tool-tape": { name: { ar: "متر خياطة", en: "Tape measure" }, ...tool, art: tapeMeasure },
};
