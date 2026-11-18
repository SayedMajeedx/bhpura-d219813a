import { AR, HAND } from "./tones";
import { roundRect, wrap } from "./text";
import type { Ctx, Sticker, TextAlign, TextColor, TextLook, Tone } from "./types";

/*
 * Words laid anywhere on a post, as a sticker: moved, sized and turned like one. Four looks: plain,
 * a meme's white with a black edge, on a band of colour as Instagram writes, and in handwriting.
 * The size is the sticker's `s`; the words wrap at the post's width.
 */

export const TEXT_LOOKS: readonly TextLook[] = ["plain", "meme", "box", "hand"];
export const TEXT_COLORS: readonly TextColor[] = ["ink", "sub", "tag", "bg", "white", "black"];
export const TEXT_ALIGNS: readonly TextAlign[] = ["right", "center", "left"];

/** A new piece of words: plain, in the cloth's ink, in the middle of the post. */
export const newText = (): Sticker => ({
  id: "text",
  x: 0.5,
  y: 0.5,
  s: 420,
  r: 0,
  text: "اكتب هني",
  look: "plain",
  color: "ink",
  align: "center",
});

/** The words' size in post pixels: a sixth of the sticker's size. */
export const fontSize = (st: Pick<Sticker, "s">) => Math.max(18, Math.round(st.s / 6));
const WRAP_AT = 880;

/** A colour of the cloth, by its name. */
export function colorOf(tone: Tone, color: TextColor | undefined) {
  switch (color) {
    case "sub":
      return tone.sub;
    case "tag":
      return tone.tag;
    case "bg":
      return tone.bg;
    case "white":
      return "#FFFFFF";
    case "black":
      return "#111111";
    default:
      return tone.ink;
  }
}

/** What reads on a band of a colour: the cloth's pair for it. */
export function inkOn(tone: Tone, color: TextColor | undefined) {
  switch (color) {
    case "sub":
      return tone.bg;
    case "tag":
      return tone.tagInk;
    case "bg":
      return tone.ink;
    case "white":
      return "#111111";
    case "black":
      return "#FFFFFF";
    default:
      return tone.bg;
  }
}

const fontOf = (st: Sticker, size: number) =>
  st.look === "hand"
    ? `600 ${size}px ${HAND}`
    : `${st.look === "meme" ? 800 : 700} ${size}px ${AR}`;

/** The box each words sticker took when last drawn, so a tap and its handles fit the words. */
const boxes = new Map<string, { w: number; h: number }>();
const boxKey = (st: Sticker) => `${st.look}|${st.s}|${st.text}`;

/** The words' box: as last drawn, else a guess from their length. */
export function textBox(st: Sticker): { w: number; h: number } {
  const kept = boxes.get(boxKey(st));
  if (kept) return kept;
  const size = fontSize(st);
  const lines = String(st.text ?? "").split("\n");
  const longest = Math.max(1, ...lines.map((l) => l.length));
  return {
    w: Math.min(WRAP_AT, longest * size * 0.55) + size,
    h: lines.length * size * 1.3 + size * 0.6,
  };
}

/** Draws the words in their own frame, centred on (0, 0). */
export function drawTextSticker(ctx: Ctx, st: Sticker, tone: Tone) {
  const text = String(st.text ?? "").trim();
  if (!text) return;
  const size = fontSize(st);
  ctx.save();
  ctx.font = fontOf(st, size);
  ctx.direction = "rtl";
  const lines = text
    .split("\n")
    .flatMap((line) => wrap(ctx, line, WRAP_AT).lines)
    .map((line) => ({ t: line.tokens.map((tok) => tok.t).join(" "), w: 0 }));
  for (const line of lines) line.w = ctx.measureText(line.t).width;
  const lh = size * 1.3;
  const pad = st.look === "box" ? size * 0.5 : size * 0.25;
  const w = Math.max(...lines.map((l) => l.w)) + pad * 2;
  const h = lines.length * lh + pad * 2 - size * 0.3;
  boxes.set(boxKey(st), { w, h });
  if (boxes.size > 200) boxes.delete(boxes.keys().next().value as string);

  if (st.look === "box") {
    ctx.fillStyle = colorOf(tone, st.color);
    roundRect(ctx, -w / 2, -h / 2, w, h, size * 0.32);
    ctx.fill();
  }
  const align = st.align ?? "center";
  ctx.textAlign = align;
  const x = align === "right" ? w / 2 - pad : align === "left" ? -w / 2 + pad : 0;
  let y = -h / 2 + pad + size * 0.92;
  for (const line of lines) {
    if (st.look === "meme") {
      ctx.lineJoin = "round";
      ctx.lineWidth = size * 0.17;
      ctx.strokeStyle = "#0B0B0B";
      ctx.strokeText(line.t, x, y);
      ctx.fillStyle = "#FFFFFF";
    } else {
      ctx.fillStyle = st.look === "box" ? inkOn(tone, st.color) : colorOf(tone, st.color);
    }
    ctx.fillText(line.t, x, y);
    y += lh;
  }
  ctx.restore();
}
