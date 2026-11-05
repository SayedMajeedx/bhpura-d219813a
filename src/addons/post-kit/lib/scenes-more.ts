import { AR, HAND } from "./tones";
import { centredLines, drawLogo, drawText, fit, roundRect, sewnTag } from "./text";
import { DARK, googly, tear } from "./sticker-kit";
import { knot, needleAndGround, sewnBag, sewnWords, threadPen, upright } from "./scene-kit";
import type { Ctx, Tone } from "./types";

/* An owl that sees everything, perched on a Pura hanger, staring straight at the reader. */
export function sceneOwl(c: Ctx, tone: Tone) {
  threadPen(c, tone);
  const line = (draw: () => void) => {
    c.beginPath();
    draw();
    c.stroke();
  };
  /* the hanger under it, in the same wood as Shammoua */
  c.setLineDash([]);
  c.lineCap = "round";
  c.lineJoin = "round";
  const arch = () => {
    c.beginPath();
    c.moveTo(110, 900);
    c.quadraticCurveTo(300, 770, 470, 730);
    c.quadraticCurveTo(640, 770, 830, 900);
  };
  c.strokeStyle = DARK;
  c.lineWidth = 50;
  arch();
  c.stroke();
  c.strokeStyle = "#CC9C63";
  c.lineWidth = 38;
  arch();
  c.stroke();
  c.strokeStyle = DARK;
  c.lineWidth = 22;
  c.beginPath();
  c.moveTo(120, 912);
  c.lineTo(820, 912);
  c.stroke();
  c.strokeStyle = "#B98A53";
  c.lineWidth = 11;
  c.beginPath();
  c.moveTo(120, 912);
  c.lineTo(820, 912);
  c.stroke();
  drawLogo(c, 395, 800, 150, tone.ink);
  /* body, ear tufts and wings */
  threadPen(c, tone);
  line(() => c.ellipse(470, 430, 205, 285, 0, 0, Math.PI * 2));
  line(() => {
    c.moveTo(322, 225);
    c.lineTo(284, 62);
    c.lineTo(416, 158);
  });
  line(() => {
    c.moveTo(618, 225);
    c.lineTo(656, 62);
    c.lineTo(524, 158);
  });
  line(() => {
    c.moveTo(300, 330);
    c.quadraticCurveTo(220, 470, 318, 640);
  });
  line(() => {
    c.moveTo(640, 330);
    c.quadraticCurveTo(720, 470, 622, 640);
  });
  /* chest feathers */
  threadPen(c, tone, [11, 9], 7);
  [
    [392, 500],
    [470, 500],
    [548, 500],
    [430, 568],
    [510, 568],
    [470, 636],
  ].forEach(([x, y]) =>
    line(() => {
      c.moveTo(x - 26, y - 14);
      c.quadraticCurveTo(x, y + 18, x + 26, y - 14);
    }),
  );
  /* the stare: heavy brows, and eyes that do not look away */
  threadPen(c, tone, [], 13);
  line(() => {
    c.moveTo(322, 232);
    c.lineTo(450, 286);
  });
  line(() => {
    c.moveTo(618, 232);
    c.lineTo(490, 286);
  });
  c.setLineDash([]);
  googly(c, 386, 340, 72, 0, 0);
  googly(c, 554, 340, 72, 0, 0);
  c.beginPath();
  c.moveTo(450, 396);
  c.lineTo(490, 396);
  c.lineTo(470, 442);
  c.closePath();
  c.fillStyle = "#D99A3B";
  c.fill();
  c.lineWidth = 4;
  c.strokeStyle = DARK;
  c.stroke();
  /* claws on the hanger */
  [
    [420, 716],
    [448, 720],
    [492, 720],
    [520, 716],
  ].forEach(([x, y]) => knot(c, x, y, 13, 19, tone));
}
/* A well with a roof, and a Pura bag falling into it: your secret is in the well. */
export function sceneWell(c: Ctx, tone: Tone, _text: string, flipped: boolean) {
  threadPen(c, tone);
  const line = (draw: () => void) => {
    c.beginPath();
    draw();
    c.stroke();
  };
  /* posts and roof */
  line(() => {
    c.moveTo(290, 540);
    c.lineTo(290, 160);
  });
  line(() => {
    c.moveTo(710, 540);
    c.lineTo(710, 160);
  });
  line(() => {
    c.moveTo(220, 180);
    c.lineTo(500, 56);
    c.lineTo(780, 180);
    c.closePath();
  });
  /* the walls and the courses of stone */
  line(() => {
    c.moveTo(262, 590);
    c.lineTo(262, 850);
    c.quadraticCurveTo(500, 950, 738, 850);
    c.lineTo(738, 590);
  });
  threadPen(c, tone, [13, 10], 7);
  line(() => {
    c.moveTo(262, 700);
    c.quadraticCurveTo(500, 780, 738, 700);
  });
  [
    [340, 640, 340, 712],
    [500, 660, 500, 736],
    [660, 640, 660, 712],
    [420, 750, 420, 836],
    [590, 750, 590, 836],
  ].forEach(([a, b, d, e]) =>
    line(() => {
      c.moveTo(a, b);
      c.lineTo(d, e);
    }),
  );
  /* the dark mouth of the well */
  c.setLineDash([]);
  c.beginPath();
  c.ellipse(500, 584, 238, 62, 0, 0, Math.PI * 2);
  c.fillStyle = "#171214";
  c.fill();
  threadPen(c, tone);
  line(() => c.ellipse(500, 584, 238, 62, 0, 0, Math.PI * 2));
  c.setLineDash([]);
  /* the bag on its way down, and the lines behind it */
  sewnBag(c, 395, 340, 210, 180, 0.14, tone, flipped);
  threadPen(c, tone, [12, 9], 8);
  [
    [436, 268, 442, 312],
    [500, 236, 502, 300],
    [564, 266, 556, 312],
  ].forEach(([a, b, d, e]) =>
    line(() => {
      c.moveTo(a, b);
      c.lineTo(d, e);
    }),
  );
  c.setLineDash([]);
  googly(c, 452, 800, 40, 0, -0.9);
  googly(c, 548, 800, 40, 0, -0.9);
  needleAndGround(c, 110, 860, 950, tone);
}
/* A joke sick note on paper, stitched to the cloth and stamped by the hanger. */
export function sceneNote(c: Ctx, tone: Tone, text: string, flipped: boolean) {
  c.save();
  c.shadowColor = "rgba(20,5,10,.26)";
  c.shadowBlur = 30;
  c.shadowOffsetY = 12;
  c.fillStyle = "#FFFDFB";
  roundRect(c, 70, 90, 860, 800, 10);
  c.fill();
  c.restore();
  c.strokeStyle = "#7A3B4E";
  c.lineWidth = 6;
  c.lineCap = "round";
  c.setLineDash([18, 13]);
  roundRect(c, 96, 116, 808, 748, 6);
  c.stroke();
  c.setLineDash([]);
  const ink = { ...tone, ink: "#231517" };
  upright(c, flipped, 500, () => {
    const title = { ...fit(c, "سكليف", AR, 700, 84, 40, 700, 110, 1.2), noTag: true };
    centredLines(c, title, 500, 146, ink);
    c.strokeStyle = "#231517";
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(170, 268);
    c.lineTo(830, 268);
    c.stroke();
    const body = { ...fit(c, text || "", AR, 500, 54, 28, 680, 310, 1.62), noTag: true };
    drawText(c, body, 840, 292, ink);
    const sign = { ...fit(c, "د. شمّوعة", HAND, 700, 44, 24, 300, 70, 1.2), noTag: true };
    drawText(c, sign, 840, 730, ink);
  });
  /* the stamp */
  c.save();
  c.translate(258, 730);
  c.rotate(-0.22);
  c.strokeStyle = "#3C0A1B";
  c.lineWidth = 7;
  c.beginPath();
  c.arc(0, 0, 92, 0, Math.PI * 2);
  c.stroke();
  c.lineWidth = 3;
  c.beginPath();
  c.arc(0, 0, 78, 0, Math.PI * 2);
  c.stroke();
  upright(c, flipped, 0, () => drawLogo(c, -58, -20, 116, "#3C0A1B"));
  c.restore();
}
/* A calculator in the red, and the holiday leaving without you. */
export function sceneCalc(c: Ctx, tone: Tone, text: string, flipped: boolean) {
  threadPen(c, tone);
  const line = (draw: () => void) => {
    c.beginPath();
    draw();
    c.stroke();
  };
  line(() => {
    c.moveTo(200, 180);
    c.lineTo(480, 180);
    c.arcTo(530, 180, 530, 230, 50);
    c.lineTo(530, 830);
    c.arcTo(530, 880, 480, 880, 50);
    c.lineTo(200, 880);
    c.arcTo(150, 880, 150, 830, 50);
    c.lineTo(150, 230);
    c.arcTo(150, 180, 200, 180, 50);
  });
  c.setLineDash([]);
  sewnTag(c, 188, 216, 304, 112, tone.tag, tone.tagInk, -0.01);
  sewnWords(c, text, 340, 272, 262, 80, tone, flipped);
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      knot(c, 208 + col * 88, 610 + row * 92, 30, 30, col === 3 ? { ink: tone.tag } : tone);
    }
  }
  googly(c, 288, 448, 54, 0, -0.9);
  googly(c, 394, 448, 54, 0, -0.9);
  tear(c, 226, 520, 1.3);
  tear(c, 456, 520, 1.3);
  /* the plane flying off along a stitched trail */
  threadPen(c, tone, [16, 13], 7);
  line(() => {
    c.moveTo(590, 600);
    c.quadraticCurveTo(650, 380, 790, 300);
  });
  threadPen(c, tone, [], 7);
  line(() => {
    c.moveTo(800, 292);
    c.lineTo(950, 140);
    c.lineTo(760, 214);
    c.closePath();
  });
  line(() => {
    c.moveTo(800, 292);
    c.lineTo(950, 140);
    c.lineTo(832, 320);
    c.closePath();
  });
  needleAndGround(c, 110, 860, 950, tone);
}
/* Waiting for payday: a white plastic chair, pink slippers, and a phone that never leaves its charger. */
function slipper(c: Ctx, x: number, y: number, tilt: number) {
  c.save();
  c.translate(x, y);
  c.rotate(tilt);
  c.lineWidth = 5;
  c.strokeStyle = DARK;
  c.fillStyle = "#E8B4B8";
  [
    [-46, -40],
    [-16, -44],
  ].forEach(([ex, ey]) => {
    c.beginPath();
    c.ellipse(ex, ey, 13, 21, -0.2, 0, Math.PI * 2);
    c.fill();
    c.stroke();
  });
  c.beginPath();
  c.ellipse(0, 0, 76, 34, 0, 0, Math.PI * 2);
  c.fill();
  c.stroke();
  [
    [-46, -6],
    [-16, -6],
  ].forEach(([ex, ey]) => {
    c.beginPath();
    c.arc(ex, ey, 6, 0, Math.PI * 2);
    c.fillStyle = DARK;
    c.fill();
  });
  c.restore();
}
export function sceneSalary(c: Ctx, tone: Tone) {
  c.setLineDash([]);
  c.lineCap = "round";
  c.lineJoin = "round";
  /* the wall socket */
  c.fillStyle = "#FFFDFB";
  c.strokeStyle = DARK;
  c.lineWidth = 5;
  roundRect(c, 806, 440, 118, 148, 12);
  c.fill();
  c.stroke();
  roundRect(c, 836, 490, 58, 62, 8);
  c.fillStyle = "#EDE7DF";
  c.fill();
  c.stroke();
  /* the monobloc chair */
  const plastic = (draw: () => void, width: number) => {
    c.strokeStyle = DARK;
    c.lineWidth = width + 10;
    draw();
    c.stroke();
    c.strokeStyle = "#FFFDFB";
    c.lineWidth = width;
    draw();
    c.stroke();
  };
  plastic(() => {
    c.beginPath();
    c.moveTo(430, 640);
    c.lineTo(392, 880);
  }, 24);
  plastic(() => {
    c.beginPath();
    c.moveTo(640, 640);
    c.lineTo(684, 880);
  }, 24);
  plastic(() => {
    c.beginPath();
    c.moveTo(662, 610);
    c.quadraticCurveTo(700, 500, 668, 386);
  }, 26);
  c.fillStyle = "#FFFDFB";
  c.strokeStyle = DARK;
  c.lineWidth = 5;
  c.beginPath();
  c.moveTo(382, 612);
  c.quadraticCurveTo(520, 660, 684, 606);
  c.lineTo(684, 628);
  c.quadraticCurveTo(520, 686, 382, 636);
  c.closePath();
  c.fill();
  c.stroke();
  /* her, in thread: torso, arms, one leg over the other */
  threadPen(c, tone);
  const line = (draw: () => void) => {
    c.beginPath();
    draw();
    c.stroke();
  };
  line(() => {
    c.moveTo(575, 345);
    c.quadraticCurveTo(612, 480, 590, 600);
  });
  line(() => {
    c.moveTo(590, 600);
    c.lineTo(340, 588);
    c.lineTo(284, 838);
  });
  line(() => {
    c.moveTo(590, 596);
    c.lineTo(362, 520);
    c.lineTo(190, 650);
  });
  line(() => {
    c.moveTo(580, 402);
    c.quadraticCurveTo(480, 500, 402, 452);
  });
  line(() => {
    c.moveTo(584, 420);
    c.quadraticCurveTo(500, 520, 368, 474);
  });
  line(() => c.arc(560, 240, 98, 0, Math.PI * 2));
  /* the sheila, drawn round her head */
  line(() => {
    c.moveTo(610, 354);
    c.quadraticCurveTo(700, 250, 640, 148);
    c.quadraticCurveTo(540, 90, 450, 190);
  });
  threadPen(c, tone, [12, 10], 7);
  line(() => c.arc(486, 282, 26, 0.15 * Math.PI, 0.8 * Math.PI));
  c.setLineDash([]);
  /* the charger's cable, then the phone in both hands */
  c.strokeStyle = tone.ink;
  c.lineWidth = 7;
  c.beginPath();
  c.moveTo(366, 384);
  c.bezierCurveTo(420, 300, 800, 330, 865, 520);
  c.stroke();
  c.save();
  c.translate(382, 438);
  c.rotate(-0.28);
  roundRect(c, -36, -62, 72, 124, 12);
  c.fillStyle = DARK;
  c.fill();
  c.lineWidth = 4;
  c.strokeStyle = "#FFFDFB";
  c.stroke();
  c.restore();
  knot(c, 410, 462, 17, 13, tone);
  knot(c, 368, 482, 17, 13, tone);
  googly(c, 472, 232, 36, -0.75, 0.75);
  googly(c, 552, 232, 36, -0.75, 0.75);
  slipper(c, 256, 868, 0);
  slipper(c, 162, 672, -0.45);
  needleAndGround(c, 60, 860, 950, tone);
}
