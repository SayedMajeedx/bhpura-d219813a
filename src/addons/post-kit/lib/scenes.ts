import { AR, RUQAA } from "./tones";
import { centredLines, drawLogo, fit, sewnTag } from "./text";
import { bolt, googly, tear } from "./sticker-kit";
import { knot, needleAndGround, sewnBag, sewnWords, threadPen, upright } from "./scene-kit";
import type { Ctx, Tone } from "./types";

export function sceneMind(c: Ctx, tone: Tone, text: string, flipped: boolean) {
  c.save();
  c.translate(-30, -272);
  threadPen(c, tone);
  const line = (draw: () => void) => {
    c.beginPath();
    draw();
    c.stroke();
  };
  /* stepladder */
  line(() => {
    c.moveTo(322, 1006);
    c.lineTo(322, 1234);
  });
  line(() => {
    c.moveTo(252, 1006);
    c.lineTo(122, 1234);
  });
  line(() => {
    c.moveTo(308, 1190);
    c.lineTo(152, 1190);
  });
  line(() => {
    c.moveTo(196, 1100);
    c.lineTo(296, 1100);
  });
  line(() => {
    c.moveTo(186, 994);
    c.lineTo(352, 994);
  });
  /* the friend on the ladder, in her abaya */
  line(() => {
    c.moveTo(264, 490);
    c.lineTo(344, 488);
    c.quadraticCurveTo(372, 740, 362, 972);
    c.lineTo(190, 972);
    c.quadraticCurveTo(208, 730, 264, 490);
  });
  line(() => {
    c.moveTo(258, 516);
    c.lineTo(150, 628);
    c.lineTo(226, 724);
  });
  line(() => {
    c.moveTo(342, 512);
    c.quadraticCurveTo(520, 520, 660, 408);
  });
  line(() => c.arc(358, 384, 98, 0, Math.PI * 2));
  line(() => {
    c.moveTo(388, 454);
    c.quadraticCurveTo(410, 462, 428, 448);
  });
  knot(c, 236, 738, 14, 20, tone, -0.5);
  /* the one being read */
  line(() => {
    c.moveTo(680, 846);
    c.lineTo(680, 1046);
    c.lineTo(630, 1226);
  });
  line(() => {
    c.moveTo(680, 1046);
    c.lineTo(736, 1226);
  });
  line(() => {
    c.moveTo(680, 892);
    c.lineTo(610, 1062);
  });
  line(() => {
    c.moveTo(680, 892);
    c.lineTo(750, 1062);
  });
  line(() => c.arc(680, 722, 118, 0, Math.PI * 2));
  threadPen(c, tone, [12, 10]);
  line(() => c.arc(680, 756, 46, 0.2 * Math.PI, 0.8 * Math.PI));
  knot(c, 606, 1078, 12, 18, tone, 0.2);
  knot(c, 754, 1078, 12, 18, tone, -0.2);
  knot(c, 610, 1236, 32, 12, tone);
  knot(c, 756, 1236, 32, 12, tone);
  c.setLineDash([]);
  googly(c, 644, 726, 29, 0, 0);
  googly(c, 716, 726, 29, 0, 0);
  googly(c, 410, 414, 25, 0.8, 0.5);
  /* the abaya in the bag, the handles, then the bag sewn on as a patch */
  c.beginPath();
  c.moveTo(590, 470);
  [
    [606, 432],
    [642, 444],
    [670, 424],
    [706, 442],
    [738, 430],
    [762, 472],
  ].forEach(([x, y], i, all) => {
    const px = i ? all[i - 1][0] : 590,
      py = i ? all[i - 1][1] : 470;
    c.quadraticCurveTo((px + x) / 2, Math.min(py, y) - 18, x, y);
  });
  c.closePath();
  c.fillStyle = "#171214";
  c.fill();
  c.lineWidth = 3;
  c.strokeStyle = tone.ink;
  c.stroke();
  threadPen(c, tone, [14, 10]);
  line(() => {
    c.moveTo(628, 468);
    c.quadraticCurveTo(642, 372, 678, 400);
    c.quadraticCurveTo(716, 372, 736, 470);
  });
  c.setLineDash([]);
  sewnTag(c, 552, 464, 270, 170, tone.tag, tone.tagInk, 0.006);
  sewnWords(c, text, 687, 522, 226, 58, tone, flipped);
  upright(c, flipped, 687, () => drawLogo(c, 639, 566, 96, tone.tagInk));
  knot(c, 672, 402, 17, 14, tone, -0.3);
  threadPen(c, tone, [12, 9], 8);
  [
    [858, 452, 892, 428],
    [838, 424, 858, 388],
    [876, 496, 916, 486],
  ].forEach(([a, b, d, e]) =>
    line(() => {
      c.moveTo(a, b);
      c.lineTo(d, e);
    }),
  );
  needleAndGround(c, 100, 880, 1258, tone);
  c.restore();
}
export function sceneHusband(c: Ctx, tone: Tone, text: string, flipped: boolean) {
  threadPen(c, tone);
  const line = (draw: () => void) => {
    c.beginPath();
    draw();
    c.stroke();
  };
  /* his thobe, his head and the ghutra */
  line(() => {
    c.moveTo(590, 372);
    c.lineTo(700, 372);
    c.quadraticCurveTo(738, 650, 750, 912);
    c.lineTo(530, 912);
    c.quadraticCurveTo(544, 650, 590, 372);
  });
  line(() => c.arc(645, 262, 88, 0, Math.PI * 2));
  line(() => {
    c.moveTo(536, 352);
    c.quadraticCurveTo(516, 170, 645, 146);
    c.quadraticCurveTo(774, 170, 754, 352);
  });
  c.setLineDash([]);
  line(() => {
    c.moveTo(566, 192);
    c.quadraticCurveTo(645, 160, 724, 192);
  });
  threadPen(c, tone, [12, 10]);
  line(() => c.arc(645, 336, 26, 1.2 * Math.PI, 1.8 * Math.PI));
  /* both arms round the pile */
  threadPen(c, tone);
  line(() => {
    c.moveTo(596, 440);
    c.quadraticCurveTo(500, 478, 404, 470);
  });
  line(() => {
    c.moveTo(600, 500);
    c.quadraticCurveTo(510, 610, 410, 742);
  });
  knot(c, 402, 470, 15, 12, tone);
  knot(c, 404, 750, 15, 12, tone);
  knot(c, 566, 930, 34, 13, tone);
  knot(c, 722, 930, 34, 13, tone);
  c.setLineDash([]);
  googly(c, 614, 256, 29, -0.9, 0);
  googly(c, 678, 256, 29, -0.9, 0);
  tear(c, 772, 244, 1.2);
  tear(c, 800, 316, 0.9);
  /* the pile of bags, taller than he is */
  threadPen(c, tone, [14, 10]);
  line(() => {
    c.moveTo(214, 180);
    c.quadraticCurveTo(262, 92, 312, 180);
  });
  c.setLineDash([]);
  sewnBag(c, 150, 618, 252, 148, 0.018, tone, flipped);
  sewnBag(c, 172, 472, 232, 148, -0.024, tone, flipped);
  sewnBag(c, 142, 326, 242, 148, 0.022, tone, flipped);
  sewnBag(c, 168, 178, 214, 150, -0.016, tone, flipped);
  /* his staff badge */
  sewnTag(c, 582, 520, 136, 74, tone.tag, tone.tagInk, -0.02);
  sewnWords(c, text, 650, 557, 108, 44, tone, flipped);
  needleAndGround(c, 70, 880, 968, tone);
}
/* A cardboard sign hung from the neck of a hanger, written by hand. */
export function sceneSign(c: Ctx, tone: Tone, text: string, flipped: boolean) {
  const edge = [
    [62, 206],
    [942, 196],
    [952, 792],
    [48, 804],
  ];
  const shape = () => {
    c.beginPath();
    edge.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath();
  };
  c.lineCap = "round";
  c.strokeStyle = "#EFE3CF";
  c.lineWidth = 6;
  c.beginPath();
  c.moveTo(292, 232);
  c.lineTo(500, -42);
  c.lineTo(708, 228);
  c.stroke();
  c.save();
  c.shadowColor = "rgba(20,5,10,.38)";
  c.shadowBlur = 40;
  c.shadowOffsetY = 18;
  shape();
  c.fillStyle = "#C8A16D";
  c.fill();
  c.restore();
  c.save();
  shape();
  c.clip();
  c.strokeStyle = "rgba(70,45,20,.05)";
  c.lineWidth = 3;
  for (let x = 40; x < 970; x += 15) {
    c.beginPath();
    c.moveTo(x, 190);
    c.lineTo(x + 6, 810);
    c.stroke();
  }
  [
    [250, 330, 170, 0.1],
    [760, 640, 220, 0.12],
    [640, 300, 120, 0.07],
  ].forEach(([x, y, r, a]) => {
    const stain = c.createRadialGradient(x, y, 10, x, y, r);
    stain.addColorStop(0, `rgba(80,50,20,${a})`);
    stain.addColorStop(1, "rgba(80,50,20,0)");
    c.fillStyle = stain;
    c.fillRect(x - r, y - r, r * 2, r * 2);
  });
  c.strokeStyle = "rgba(60,38,16,.22)";
  c.lineWidth = 5;
  c.beginPath();
  c.moveTo(214, 190);
  c.lineTo(222, 810);
  c.stroke();
  c.restore();
  shape();
  c.strokeStyle = "#8A6A3E";
  c.lineWidth = 4;
  c.stroke();
  [
    [292, 232],
    [708, 228],
  ].forEach(([x, y]) => {
    c.beginPath();
    c.arc(x, y, 9, 0, Math.PI * 2);
    c.fillStyle = "#3A2A1A";
    c.fill();
  });
  upright(c, flipped, 500, () => {
    const layout = { ...fit(c, text || "", RUQAA, 700, 118, 44, 800, 500, 1.42), noTag: true };
    const h = layout.lines.length * layout.size * layout.lh;
    centredLines(c, layout, 500, 500 - h / 2 - layout.size * 0.1, { ...tone, ink: "#1B1512" });
  });
}
/* A phone sewn on the cloth, watching its own button spark. */
export function scenePhone(c: Ctx, tone: Tone, text: string, flipped: boolean) {
  threadPen(c, tone);
  const line = (draw: () => void) => {
    c.beginPath();
    draw();
    c.stroke();
  };
  line(() => {
    c.moveTo(230, 90);
    c.lineTo(520, 90);
    c.arcTo(580, 90, 580, 150, 60);
    c.lineTo(580, 790);
    c.arcTo(580, 850, 520, 850, 60);
    c.lineTo(230, 850);
    c.arcTo(170, 850, 170, 790, 60);
    c.lineTo(170, 150);
    c.arcTo(170, 90, 230, 90, 60);
  });
  threadPen(c, tone, [12, 10]);
  line(() => {
    c.moveTo(330, 124);
    c.lineTo(420, 124);
  });
  c.setLineDash([]);
  upright(c, flipped, 375, () => {
    drawLogo(c, 275, 170, 200, tone.ink);
    c.fillStyle = tone.ink;
    c.font = `500 27px ${AR}`;
    c.textAlign = "center";
    c.direction = "ltr";
    c.fillText("pura.boutq.store", 375, 290);
    c.direction = "rtl";
  });
  googly(c, 335, 400, 42, 0, 0.9);
  googly(c, 415, 400, 42, 0, 0.9);
  sewnTag(c, 222, 540, 306, 120, tone.tag, tone.tagInk, -0.012);
  sewnWords(c, text, 375, 600, 262, 78, tone, flipped);
  bolt(c, 648, 500, 1.3, 0.2);
  bolt(c, 660, 690, 1, 0.45);
  bolt(c, 118, 590, 1.05, -0.3);
  needleAndGround(c, 90, 860, 930, tone);
}
