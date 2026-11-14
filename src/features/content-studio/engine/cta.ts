import { font, roundedRect } from "@/features/content-studio/engine/draw";
import { STUDIO_FONTS } from "@/features/content-studio/engine/fonts";
import { textDirection } from "@/features/content-studio/engine/text-layout";

/** The pill's height at 1080 wide, for a template that keeps room for it. */
export const CTA_HEIGHT = 76;

/**
 * The post's ask ("اطلبوا من الرابط في البايو") as a pill a viewer reads as a button, with its
 * vertical middle at `y` and its edge at `x` on the reading side (or centred). Nothing is drawn
 * without words. Returns the pill's width, 0 when nothing was drawn.
 */
export function drawCallToAction(
  ctx: CanvasRenderingContext2D,
  text: string | null | undefined,
  {
    x,
    y,
    u,
    align,
    fill,
    ink,
    alpha = 1,
    size = 30,
  }: {
    x: number;
    y: number;
    u: number;
    align: "left" | "right" | "center";
    /** The pill's colour. */
    fill: string;
    /** The words' colour on it. */
    ink: string;
    alpha?: number;
    /** The words' size at 1080 wide. */
    size?: number;
  },
): number {
  const line = text?.trim();
  if (!line || alpha <= 0) return 0;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.font = font(size * u, STUDIO_FONTS.body, 600);
  const textW = ctx.measureText(line).width;
  const arrowW = 30 * u;
  const padX = 34 * u;
  const h = CTA_HEIGHT * u * (size / 30);
  const w = textW + arrowW + padX * 2;
  const left = align === "right" ? x - w : align === "center" ? x - w / 2 : x;
  roundedRect(ctx, { x: left, y: y - h / 2, w, h }, h / 2);
  ctx.fillStyle = fill;
  ctx.fill();
  const rtl = textDirection(line) === "rtl";
  // The words, then an arrow pointing up toward the bio, at the reading end.
  ctx.fillStyle = ink;
  ctx.direction = rtl ? "rtl" : "ltr";
  ctx.textBaseline = "middle";
  ctx.textAlign = rtl ? "right" : "left";
  ctx.fillText(line, rtl ? left + w - padX : left + padX, y + 1 * u);
  const ax = rtl ? left + padX + arrowW * 0.35 : left + w - padX - arrowW * 0.35;
  const s = 9 * u;
  ctx.strokeStyle = ink;
  ctx.lineWidth = 3 * u;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(ax, y + s);
  ctx.lineTo(ax, y - s);
  ctx.moveTo(ax - s * 0.8, y - s * 0.2);
  ctx.lineTo(ax, y - s);
  ctx.lineTo(ax + s * 0.8, y - s * 0.2);
  ctx.stroke();
  ctx.restore();
  return w;
}
