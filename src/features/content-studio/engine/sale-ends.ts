import { font } from "@/features/content-studio/engine/draw";
import { STUDIO_FONTS } from "@/features/content-studio/engine/fonts";
import { textDirection } from "@/features/content-studio/engine/text-layout";

/**
 * The line that says when a sale ends ("Until 14 Nov" / "حتى 14 نوفمبر"), set small under the
 * price or the badge it belongs to. Nothing is drawn without a date: a sale with no end says none.
 */
export function drawSaleEnds(
  ctx: CanvasRenderingContext2D,
  text: string | null | undefined,
  at: {
    x: number;
    y: number;
    u: number;
    color: string;
    align?: CanvasTextAlign;
    size?: number;
    alpha?: number;
    baseline?: CanvasTextBaseline;
  },
) {
  const line = text?.trim();
  if (!line) return;
  ctx.save();
  ctx.globalAlpha *= at.alpha ?? 1;
  ctx.fillStyle = at.color;
  ctx.font = font((at.size ?? 26) * at.u, STUDIO_FONTS.body, 500);
  ctx.direction = textDirection(line);
  ctx.textAlign = at.align ?? "center";
  ctx.textBaseline = at.baseline ?? "top";
  ctx.fillText(line, at.x, at.y);
  ctx.restore();
}
