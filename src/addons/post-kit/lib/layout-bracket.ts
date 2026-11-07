import { handle, stitchedFrame, wordmark } from "./frame";
import { drawText, fit, roundRect } from "./text";
import { AR } from "./tones";
import type { Ctx, Geometry, Post, Tone } from "./types";

/**
 * The cup's bracket: the first round in a column at the reading side, each later round beside it,
 * and the champion on a filled label at the end, joined by stitched lines. A place not yet decided
 * is an empty stitched box.
 */
export function drawBracket(c: Ctx, s: Post, g: Geometry, tone: Tone) {
  stitchedFrame(c, g, tone);
  wordmark(c, g, tone);
  handle(c, g, tone);
  const right = g.W - g.M,
    w = g.W - g.M * 2;
  const head = fit(c, s.head, AR, 700, 84, 50, w, 130, 1.3);
  const top = drawText(c, head, right, g.T, tone) + 40;
  const rounds = s.rounds ?? [];
  if (!rounds.length) return;

  const columns = rounds.length;
  const gap = 26;
  const boxW = (w - gap * (columns - 1)) / columns;
  const slot = (g.B - top) / rounds[0].length;
  const boxH = Math.min(slot - 10, 66);
  const xOf = (round: number) => right - boxW - round * (boxW + gap);
  /** A place's height: the middle of the first-round places it can be reached from. */
  const yOf = (round: number, index: number) => {
    const span = 2 ** round;
    return top + slot * (index * span + span / 2);
  };

  c.save();
  c.strokeStyle = tone.stitch;
  c.lineWidth = 3;
  c.setLineDash([9, 8]);
  c.lineCap = "round";
  rounds.slice(0, -1).forEach((names, round) => {
    names.forEach((_, index) => {
      const fromX = xOf(round);
      const toX = xOf(round + 1) + boxW;
      const fromY = yOf(round, index);
      const toY = yOf(round + 1, Math.floor(index / 2));
      const midX = (fromX + toX) / 2;
      c.beginPath();
      c.moveTo(fromX, fromY);
      c.lineTo(midX, fromY);
      c.lineTo(midX, toY);
      c.lineTo(toX, toY);
      c.stroke();
    });
  });
  c.restore();

  rounds.forEach((names, round) => {
    const last = round === columns - 1;
    names.forEach((name, index) => {
      const x = xOf(round);
      const y = yOf(round, index) - boxH / 2;
      c.save();
      roundRect(c, x, y, boxW, boxH, 9);
      if (name) {
        c.fillStyle = last ? tone.tag : tone.ink;
        c.fill();
      } else {
        c.strokeStyle = tone.stitch;
        c.lineWidth = 3;
        c.setLineDash([9, 8]);
        c.stroke();
      }
      c.restore();
      if (!name) return;
      let size = last ? 34 : 30;
      for (; size > 16; size -= 1) {
        c.font = `600 ${size}px ${AR}`;
        if (c.measureText(name).width <= boxW - 16) break;
      }
      c.font = `600 ${size}px ${AR}`;
      c.fillStyle = last ? tone.tagInk : tone.bg;
      c.textAlign = "center";
      c.fillText(name, x + boxW / 2, y + boxH / 2 + size * 0.36);
    });
  });
}
