import type { Ctx, Geometry, Post, PostLook, Tone } from "./types";

/*
 * A post's look: the plain stitched frame it always had, or one of three dressed ones, each in the
 * language of a boutique's workshop. Embroidered: a cloth patterned with stitched flowers and small
 * hangers, its top and foot edged like an abaya's cuff with chain stitch and hanging beads. Lace:
 * lace dots on the cloth and a scalloped lace edge. Black and gold: a quilted lattice and the cuff
 * edge. A dressed look centres the logo, larger, and starts the words lower, below it. Every colour
 * comes from the post's own cloth, so a look suits any of the four.
 */

export const POST_LOOKS: readonly Exclude<PostLook, "plain">[] = ["embroidered", "lace", "gold"];

export const LOOKS: Record<
  Exclude<PostLook, "plain">,
  { name: { ar: string; en: string }; tone: string }
> = {
  embroidered: { name: { ar: "مطرز", en: "Embroidered" }, tone: "wine" },
  lace: { name: { ar: "دانتيل", en: "Lace" }, tone: "cream" },
  gold: { name: { ar: "أسود وذهب", en: "Black and gold" }, tone: "ink" },
};

export const isPostLook = (value: unknown): value is PostLook =>
  value === "plain" || POST_LOOKS.includes(value as Exclude<PostLook, "plain">);

/** A post's look: what it says, else plain, as every post was before the looks. */
export const lookOf = (post: Pick<Post, "look">): PostLook =>
  post.look && isPostLook(post.look) ? post.look : "plain";

/** Whether a cloth is dark: its decoration is then in its gold, else in its ink. */
export const isDarkCloth = (tone: Tone) => luminance(tone.bg) < 0.4;

function rgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? [...h].map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function luminance(hex: string) {
  const [r, g, b] = rgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}
export const withAlpha = (hex: string, alpha: number) => `rgba(${rgb(hex).join(",")},${alpha})`;

/**
 * The thread a look embroiders in: the cloth's gold on a dark cloth (its `sub`: the abaya black's
 * label colour is cream), its ink on a light one.
 */
export const threadOf = (tone: Tone) => (isDarkCloth(tone) ? tone.sub : tone.ink);

/* ── The cloth's pattern, tone on tone ── */

function stitchFlower(c: Ctx, x: number, y: number, r: number, color: string, lw: number) {
  c.save();
  c.strokeStyle = color;
  c.lineWidth = lw;
  c.lineCap = "round";
  c.setLineDash([lw * 1.6, lw * 1.3]);
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    c.beginPath();
    c.ellipse(
      x + Math.cos(a) * r * 0.55,
      y + Math.sin(a) * r * 0.55,
      r * 0.42,
      r * 0.17,
      a,
      0,
      Math.PI * 2,
    );
    c.stroke();
  }
  c.setLineDash([]);
  c.beginPath();
  c.arc(x, y, r * 0.15, 0, Math.PI * 2);
  c.fillStyle = color;
  c.fill();
  c.restore();
}

function hangerGlyph(c: Ctx, x: number, y: number, s: number, color: string, lw: number) {
  c.save();
  c.strokeStyle = color;
  c.lineWidth = lw;
  c.lineCap = "round";
  c.lineJoin = "round";
  c.beginPath();
  c.moveTo(x - s, y + s * 0.5);
  c.lineTo(x, y - s * 0.12);
  c.lineTo(x + s, y + s * 0.5);
  c.closePath();
  c.stroke();
  c.beginPath();
  c.arc(x, y - s * 0.4, s * 0.2, Math.PI * 0.85, Math.PI * 2.35);
  c.stroke();
  c.restore();
}

/** A tile of a look's pattern, made once per look and colour. */
const tiles = new Map<string, HTMLCanvasElement>();
function tile(look: Exclude<PostLook, "plain">, color: string): HTMLCanvasElement {
  const key = `${look}|${color}`;
  const kept = tiles.get(key);
  if (kept) return kept;
  const canvas = document.createElement("canvas");
  const c = canvas.getContext("2d") as Ctx;
  if (look === "embroidered") {
    canvas.width = canvas.height = 220;
    stitchFlower(c, 55, 55, 34, color, 3);
    hangerGlyph(c, 165, 168, 26, color, 3);
  } else if (look === "lace") {
    canvas.width = canvas.height = 120;
    c.strokeStyle = color;
    c.lineWidth = 3;
    for (const [x, y] of [
      [30, 30],
      [90, 90],
    ]) {
      c.beginPath();
      c.arc(x, y, 12, 0, Math.PI * 2);
      c.stroke();
    }
    c.fillStyle = color;
    for (const [x, y] of [
      [90, 30],
      [30, 90],
    ]) {
      c.beginPath();
      c.arc(x, y, 3, 0, Math.PI * 2);
      c.fill();
    }
  } else {
    // A quilted lattice: dashed diagonals both ways, a small cross where they meet.
    canvas.width = canvas.height = 110;
    c.strokeStyle = color;
    c.lineWidth = 3;
    c.setLineDash([12, 9]);
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(110, 110);
    c.moveTo(110, 0);
    c.lineTo(0, 110);
    c.stroke();
  }
  tiles.set(key, canvas);
  return canvas;
}

/** The look's pattern over the whole cloth. Nothing for a plain post. */
export function drawLookCloth(ctx: Ctx, g: Geometry, tone: Tone) {
  if (!g.look || g.look === "plain") return;
  const color = isDarkCloth(tone) ? withAlpha(tone.sub, 0.1) : withAlpha(tone.ink, 0.07);
  ctx.save();
  ctx.fillStyle = ctx.createPattern(tile(g.look, color), "repeat") as CanvasPattern;
  ctx.fillRect(0, 0, g.W, g.H);
  ctx.restore();
}

/* ── The edges ── */

function bead(c: Ctx, x: number, y: number, r: number, color: string) {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fillStyle = color;
  c.fill();
  c.beginPath();
  c.arc(x - r * 0.35, y - r * 0.35, r * 0.33, 0, Math.PI * 2);
  c.fillStyle = "rgba(255,255,255,.5)";
  c.fill();
}

/** An abaya cuff's edge: chain stitch, a running stitch, and beads hanging inward. */
function cuffEdge(c: Ctx, W: number, y: number, inward: 1 | -1, color: string) {
  c.save();
  c.strokeStyle = color;
  c.lineWidth = 4;
  for (let x = -10; x < W + 20; x += 28) {
    c.beginPath();
    c.ellipse(x, y, 15, 8, 0, 0, Math.PI * 2);
    c.stroke();
  }
  c.setLineDash([16, 10]);
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(0, y - inward * 24);
  c.lineTo(W, y - inward * 24);
  c.stroke();
  c.setLineDash([]);
  for (let x = 14, i = 0; x < W; x += 56, i++) {
    const drop = i % 2 ? 34 : 50;
    c.lineWidth = 2.2;
    c.beginPath();
    c.moveTo(x, y + inward * 8);
    c.lineTo(x, y + inward * drop);
    c.stroke();
    bead(c, x, y + inward * (drop + 7), i % 2 ? 5 : 8, color);
  }
  c.restore();
}

/** A lace edge: a band, scallops with their holes, and a dotted line along it. */
function laceEdge(c: Ctx, W: number, H: number, top: boolean, color: string, hole: string) {
  const band = 54;
  const r = 30;
  const y = top ? band : H - band;
  c.save();
  c.fillStyle = color;
  c.fillRect(0, top ? 0 : H - band, W, band);
  for (let x = 0; x <= W + r; x += r * 2) {
    c.beginPath();
    c.arc(x, y, r, top ? 0 : Math.PI, top ? Math.PI : Math.PI * 2);
    c.fillStyle = color;
    c.fill();
    c.beginPath();
    c.arc(x, y + (top ? 10 : -10), 8, 0, Math.PI * 2);
    c.fillStyle = hole;
    c.fill();
  }
  c.strokeStyle = hole;
  c.lineWidth = 3;
  c.setLineDash([2, 9]);
  c.lineCap = "round";
  c.beginPath();
  c.moveTo(0, top ? band - 18 : H - band + 18);
  c.lineTo(W, top ? band - 18 : H - band + 18);
  c.stroke();
  c.restore();
}

/** A look's top and foot, in place of the plain stitched frame. */
export function drawLookEdges(ctx: Ctx, g: Geometry, tone: Tone) {
  if (!g.look || g.look === "plain") return;
  const thread = threadOf(tone);
  if (g.look === "lace") {
    laceEdge(ctx, g.W, g.H, true, thread, tone.bg);
    laceEdge(ctx, g.W, g.H, false, thread, tone.bg);
    return;
  }
  cuffEdge(ctx, g.W, 52, 1, thread);
  cuffEdge(ctx, g.W, g.H - 52, -1, thread);
}
