import { drawLogo, LOGO_RATIO } from "./text";
import { AR } from "./tones";
import type { Ctx } from "./types";

/* The quiet label beside Shammoua's: the store's mark, a fine gold frame and the same words in the
   brand's own light Arabic face, with nothing drawn for fun. Light paper and fine lines, as a deep field comes out
   streaked on a shop's printer. Drawn in a 1000 box with square corners. */

export const FINE_WORDS = "ملبوس العافية";

const WINE = "#3C0A1B";
const PAPER = "#FBF6F1";
const GOLD = "#A9834F";
/** The brand's Arabic headline face, self-hosted in src/fonts.css and loaded with the kit's fonts. */
const WORDS_FONT = '"29LT Azer", "29LT Kaff", "Readex Pro", Tahoma, sans-serif';

export function drawFineLabel(c: Ctx, handle = "@puraline.bh", phone = "") {
  c.save();
  c.fillStyle = PAPER;
  c.fillRect(0, 0, 1000, 1000);

  // Two gold lines, a heavier one outside: a frame, not a stitch.
  c.strokeStyle = GOLD;
  c.lineWidth = 6;
  c.strokeRect(46, 46, 908, 908);
  c.lineWidth = 2;
  c.strokeRect(66, 66, 868, 868);

  const logoW = 470;
  drawLogo(c, (1000 - logoW) / 2, 236, logoW, WINE);
  const logoBottom = 236 + logoW * LOGO_RATIO;

  // A fine rule with a small diamond at its middle, between the mark and the words.
  const ruleY = logoBottom + 92;
  c.strokeStyle = GOLD;
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(370, ruleY);
  c.lineTo(484, ruleY);
  c.moveTo(516, ruleY);
  c.lineTo(630, ruleY);
  c.stroke();
  c.fillStyle = GOLD;
  c.beginPath();
  c.moveTo(500, ruleY - 10);
  c.lineTo(510, ruleY);
  c.lineTo(500, ruleY + 10);
  c.lineTo(490, ruleY);
  c.closePath();
  c.fill();

  c.direction = "rtl";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillStyle = WINE;
  let size = 118;
  do {
    c.font = `200 ${size}px ${WORDS_FONT}`;
    size -= 4;
  } while (c.measureText(FINE_WORDS).width > 640 && size > 40);
  c.fillText(FINE_WORDS, 500, ruleY + 108);

  c.direction = "ltr";
  c.font = `500 32px ${AR}`;
  c.fillStyle = GOLD;
  c.fillText(handle, 500, phone ? 812 : 850);
  if (phone) c.fillText(phone, 500, 860);
  c.textBaseline = "alphabetic";
  c.restore();
}
