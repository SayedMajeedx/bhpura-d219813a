import { BLEED, type Align, type Shape } from "./geometry";

/**
 * A card face as SVG: what the screen shows and what is printed, with its text as real text (the
 * browser shapes the Arabic, and a print shop's file stays sharp). The canvas painter
 * (`canvas.ts`) draws the same shapes for the picture a phone shares.
 */

const esc = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const n = (value: number) => String(Math.round(value * 1000) / 1000);

/** SVG's anchor for an edge on the page, in the text's own direction. */
export function textAnchor(align: Align, dir: "ltr" | "rtl"): "start" | "middle" | "end" {
  if (align === "center") return "middle";
  if (align === "left") return dir === "rtl" ? "end" : "start";
  return dir === "rtl" ? "start" : "end";
}

const ASPECT: Record<Align, string> = { left: "xMinYMid", center: "xMidYMid", right: "xMaxYMid" };

function shapeSvg(shape: Shape, id: string): string {
  if (shape.kind === "rect") {
    return `<rect x="${n(shape.x)}" y="${n(shape.y)}" width="${n(shape.w)}" height="${n(shape.h)}"${
      shape.radius ? ` rx="${n(shape.radius)}"` : ""
    } fill="${shape.fill ?? "none"}"${
      shape.stroke ? ` stroke="${shape.stroke}" stroke-width="${n(shape.width ?? 0.25)}"` : ""
    }/>`;
  }
  if (shape.kind === "path") {
    return `<path d="${shape.d}" fill="${shape.fill ?? "none"}"${
      shape.stroke
        ? ` stroke="${shape.stroke}" stroke-width="${n(shape.width ?? 0.25)}" stroke-linecap="round" stroke-linejoin="round"`
        : ""
    }/>`;
  }
  if (shape.kind === "text") {
    const f = shape.font;
    return `<text x="${n(shape.x)}" y="${n(shape.y)}" font-family="${esc(f.family)}" font-size="${n(
      f.size,
    )}" font-weight="${f.weight}"${
      f.spacing ? ` letter-spacing="${n(f.spacing)}"` : ""
    } fill="${shape.fill}" text-anchor="${textAnchor(shape.align, shape.dir)}" direction="${
      shape.dir
    }">${esc(shape.text)}</text>`;
  }
  if (shape.kind === "image") {
    return `<clipPath id="${id}"><rect x="${n(shape.x)}" y="${n(shape.y)}" width="${n(
      shape.w,
    )}" height="${n(shape.h)}"/></clipPath><image href="${esc(shape.href)}" x="${n(
      shape.x,
    )}" y="${n(shape.y)}" width="${n(shape.w)}" height="${n(
      shape.h,
    )}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/>`;
  }
  return `<mask id="${id}" maskUnits="userSpaceOnUse" x="${n(shape.x)}" y="${n(shape.y)}" width="${n(
    shape.w,
  )}" height="${n(shape.h)}" style="mask-type:alpha"><image href="${esc(shape.href)}" x="${n(
    shape.x,
  )}" y="${n(shape.y)}" width="${n(shape.w)}" height="${n(shape.h)}" preserveAspectRatio="${
    ASPECT[shape.align]
  } meet"/></mask><rect x="${n(shape.x)}" y="${n(shape.y)}" width="${n(shape.w)}" height="${n(
    shape.h,
  )}" fill="${shape.tint}" mask="url(#${id})"/>`;
}

/**
 * The face as an SVG document: the trimmed card for a screen, or with its bleed for print
 * (`bleed`), sized in millimetres. `idPrefix` keeps two faces on one page apart.
 */
export function cardSvg(
  shapes: Shape[],
  size: { w: number; h: number },
  opts: { bleed?: boolean; idPrefix?: string; title?: string } = {},
): string {
  const pad = opts.bleed ? BLEED : 0;
  const w = size.w + pad * 2;
  const h = size.h + pad * 2;
  const prefix = opts.idPrefix ?? "gc";
  const body = shapes.map((shape, i) => shapeSvg(shape, `${prefix}-${i}`)).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${n(-pad)} ${n(-pad)} ${n(w)} ${n(
    h,
  )}" width="${n(w)}mm" height="${n(h)}mm" role="img"${
    opts.title ? ` aria-label="${esc(opts.title)}"` : ""
  }>${opts.bleed ? "" : `<clipPath id="${prefix}-trim"><rect x="0" y="0" width="${n(size.w)}" height="${n(size.h)}"/></clipPath>`}<g${
    opts.bleed ? "" : ` clip-path="url(#${prefix}-trim)"`
  }>${body}</g></svg>`;
}
