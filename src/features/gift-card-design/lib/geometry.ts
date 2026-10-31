import type { Ornament } from "./occasions";
import type { Orientation } from "./design";

/**
 * The card's paper and its drawing, in millimetres. A6 is 105 x 148 mm; the ground runs 3 mm past
 * the trim (the bleed a print shop cuts into) and nothing that must be read sits within the
 * margin. Every mark here is drawn with ruler and compass, as a designer would: a crescent from
 * two circles, an eight-pointed star from two squares, the star-and-cross pattern from stars set
 * point to point, a pointed arch from two arcs. Nothing is generated or traced from a picture.
 */

export const BLEED = 3;
export const A6 = { short: 105, long: 148 } as const;

export function cardSize(orientation: Orientation): { w: number; h: number } {
  return orientation === "landscape" ? { w: A6.long, h: A6.short } : { w: A6.short, h: A6.long };
}

export type Align = "left" | "center" | "right";
export type CardFont = {
  family: string;
  weight: number;
  /** In millimetres (1 pt is 0.3528 mm). */
  size: number;
  /** Tracking in millimetres; never set on Arabic, which it would break apart. */
  spacing?: number;
};

export type Shape =
  | {
      kind: "rect";
      x: number;
      y: number;
      w: number;
      h: number;
      fill?: string;
      stroke?: string;
      width?: number;
      radius?: number;
    }
  | { kind: "path"; d: string; fill?: string; stroke?: string; width?: number }
  | {
      kind: "text";
      x: number;
      y: number;
      text: string;
      font: CardFont;
      fill: string;
      align: Align;
      dir: "ltr" | "rtl";
    }
  /** A photo filling its box (cropped to it, centred). */
  | { kind: "image"; href: string; x: number; y: number; w: number; h: number }
  /** The store's logo in one ink, drawn exactly in its rectangle from the trimmed part `crop`. */
  | {
      kind: "logo";
      href: string;
      x: number;
      y: number;
      w: number;
      h: number;
      tint: string;
      /** The part of the picture drawn, as fractions of it (its see-through margins left out). */
      crop: { x: number; y: number; w: number; h: number };
    };

const r2 = (n: number) => Math.round(n * 100) / 100;

function rotate([x, y]: [number, number], cx: number, cy: number, angle: number) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = x - cx;
  const dy = y - cy;
  return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos] as [number, number];
}

/** A crescent: the outer circle less a second one set off it, turned a little. */
export function crescentPath(cx: number, cy: number, radius: number): string {
  const R = radius;
  const d = R * 0.42;
  const r = R * 0.84;
  const x = (d * d + R * R - r * r) / (2 * d);
  const y = Math.sqrt(Math.max(R * R - x * x, 0));
  const turn = -Math.PI / 5;
  const [ax, ay] = rotate([cx + x, cy - y], cx, cy, turn);
  const [bx, by] = rotate([cx + x, cy + y], cx, cy, turn);
  return [
    `M${r2(ax)} ${r2(ay)}`,
    `A${r2(R)} ${r2(R)} 0 1 0 ${r2(bx)} ${r2(by)}`,
    `A${r2(r)} ${r2(r)} 0 1 1 ${r2(ax)} ${r2(ay)}Z`,
  ].join("");
}

/** An eight-pointed star: two squares, one turned an eighth of a turn. */
export function starPolygon(cx: number, cy: number, radius: number): string {
  const inner = radius * 0.7654;
  const points: string[] = [];
  for (let i = 0; i < 16; i++) {
    const angle = (Math.PI / 8) * i - Math.PI / 2;
    const r = i % 2 === 0 ? radius : inner;
    points.push(`${r2(cx + r * Math.cos(angle))} ${r2(cy + r * Math.sin(angle))}`);
  }
  return `M${points.join("L")}Z`;
}

/** The star-and-cross pattern over a box: stars point to point, the crosses left between them. */
export function starAndCrossPath(x: number, y: number, w: number, h: number, step: number) {
  const parts: string[] = [];
  for (let row = 0; y + row * step <= y + h + step; row++) {
    for (let col = 0; x + col * step <= x + w + step; col++) {
      parts.push(starPolygon(x + col * step, y + row * step, step / 2));
    }
  }
  return parts.join("");
}

/** A pointed arch with its top at `y`: two arcs meeting at the apex, straight sides below. */
export function archPath(x: number, y: number, w: number, h: number): string {
  const R = w * 0.7;
  const rise = Math.sqrt(R * R - (w / 2 - R) * (w / 2 - R));
  return [
    `M${r2(x)} ${r2(y + h)}`,
    `L${r2(x)} ${r2(y + rise)}`,
    `A${r2(R)} ${r2(R)} 0 0 1 ${r2(x + w / 2)} ${r2(y)}`,
    `A${r2(R)} ${r2(R)} 0 0 1 ${r2(x + w)} ${r2(y + rise)}`,
    `L${r2(x + w)} ${r2(y + h)}Z`,
  ].join("");
}

/** A diamond (lozenge) centred on a point. */
function diamondPath(cx: number, cy: number, size: number): string {
  return `M${r2(cx)} ${r2(cy - size)}L${r2(cx + size)} ${r2(cy)}L${r2(cx)} ${r2(cy + size)}L${r2(cx - size)} ${r2(cy)}Z`;
}

/** The occasion's one mark, centred on a point, about `size` mm across, in `color`. */
export function ornamentShapes(
  ornament: Ornament,
  cx: number,
  cy: number,
  size: number,
  color: string,
): Shape[] {
  if (ornament === "crescent") {
    return [
      { kind: "path", d: crescentPath(cx - size * 0.12, cy, size * 0.5), fill: color },
      {
        kind: "path",
        d: starPolygon(cx + size * 0.34, cy - size * 0.08, size * 0.13),
        fill: color,
      },
    ];
  }
  if (ornament === "star") {
    return [{ kind: "path", d: starPolygon(cx, cy, size * 0.42), fill: color }];
  }
  if (ornament === "rings") {
    const radius = size * 0.3;
    const circle = (x: number) =>
      `M${r2(x - radius)} ${r2(cy)}a${r2(radius)} ${r2(radius)} 0 1 0 ${r2(radius * 2)} 0a${r2(radius)} ${r2(radius)} 0 1 0 ${r2(-radius * 2)} 0Z`;
    return [
      {
        kind: "path",
        d: circle(cx - radius * 0.62) + circle(cx + radius * 0.62),
        stroke: color,
        width: 0.35,
      },
    ];
  }
  if (ornament === "rule") {
    const half = size * 0.9;
    const gap = 2;
    return [
      {
        kind: "path",
        d: `M${r2(cx - half)} ${r2(cy)}L${r2(cx - gap)} ${r2(cy)}M${r2(cx + gap)} ${r2(cy)}L${r2(cx + half)} ${r2(cy)}`,
        stroke: color,
        width: 0.25,
      },
      { kind: "path", d: diamondPath(cx, cy, 0.9), fill: color },
    ];
  }
  return [];
}

/** Thin parallel lines across a seam (a ribbon), horizontal or vertical. */
export function ribbonPath(
  from: number,
  to: number,
  at: number,
  count: number,
  gap: number,
  vertical: boolean,
): string {
  const lines: string[] = [];
  for (let i = 0; i < count; i++) {
    const p = r2(at + i * gap);
    lines.push(vertical ? `M${p} ${r2(from)}L${p} ${r2(to)}` : `M${r2(from)} ${p}L${r2(to)} ${p}`);
  }
  return lines.join("");
}
