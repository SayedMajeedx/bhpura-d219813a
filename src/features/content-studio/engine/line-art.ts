/**
 * Line art that draws itself: shapes as polylines (lists of points), and a
 * stroke that traces the first part of a polyline by length. Everything but
 * `traceLines` is pure geometry, in whatever units the caller works in.
 */

export type Point = [number, number];
export type Polyline = Point[];

/** The length of a polyline. */
export function polylineLength(line: Polyline): number {
  let length = 0;
  for (let i = 1; i < line.length; i++) {
    length += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
  }
  return length;
}

/** The first `fraction` (0 to 1) of a polyline, by length, ending exactly there. */
export function partialPolyline(line: Polyline, fraction: number): Polyline {
  if (fraction <= 0 || line.length < 2) return [];
  if (fraction >= 1) return line;
  let remaining = polylineLength(line) * fraction;
  const out: Polyline = [line[0]];
  for (let i = 1; i < line.length; i++) {
    const [ax, ay] = line[i - 1];
    const [bx, by] = line[i];
    const step = Math.hypot(bx - ax, by - ay);
    if (step >= remaining) {
      const k = step === 0 ? 0 : remaining / step;
      out.push([ax + (bx - ax) * k, ay + (by - ay) * k]);
      return out;
    }
    out.push(line[i]);
    remaining -= step;
  }
  return out;
}

/** Points along a circle's arc from angle `from` to `to` (radians, y down). */
export function arcPoints(
  cx: number,
  cy: number,
  r: number,
  from: number,
  to: number,
  steps = 48,
): Polyline {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = from + ((to - from) * i) / steps;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as Point;
  });
}

/**
 * A pointed (Islamic) arch standing on the line `bottom`, `width` wide,
 * springing at `springY`: the two sides rise and meet in a point. `sharpness`
 * is each arc's radius as a share of the width (above 0.5; higher is taller).
 * Traced from the bottom left, over the apex, to the bottom right.
 */
export function pointedArch(
  x: number,
  width: number,
  springY: number,
  bottom: number,
  sharpness = 0.6,
): Polyline {
  const r = width * sharpness;
  const half = width / 2;
  // The left side's arc is centred on the springing line, r in from the left.
  const apexAngle = Math.acos((r - half) / r);
  const left = arcPoints(x + r, springY, r, Math.PI, Math.PI + apexAngle, 40);
  const right = arcPoints(x + width - r, springY, r, -apexAngle, 0, 40);
  return [[x, bottom], ...left, ...right.slice(1), [x + width, bottom]];
}

/** How high a pointed arch's apex rises above its springing line. */
export function archRise(width: number, sharpness = 0.6): number {
  const r = width * sharpness;
  return Math.sqrt(r * r - (r - width / 2) ** 2);
}

/**
 * The run of a circle's points (sampled every degree) that `keep` accepts,
 * in order: the arc between the two places the circle crosses another shape.
 */
function keptArc(cx: number, cy: number, r: number, keep: (point: Point) => boolean): Polyline {
  const points: Point[] = arcPoints(cx, cy, r, 0, Math.PI * 2, 360).slice(0, 360);
  const kept = points.map(keep);
  // Start just after a rejected point, so the kept run is not split at the seam.
  const start = kept.findIndex((ok, i) => ok && !kept[(i + 359) % 360]);
  if (start < 0) return kept[0] ? points : [];
  const run: Polyline = [];
  for (let i = 0; i < 360; i++) {
    const index = (start + i) % 360;
    if (!kept[index]) break;
    run.push(points[index]);
  }
  return run;
}

/**
 * A crescent moon of radius `r` opening to the right (to the left when
 * `mirror`), as one closed stroke: round the outer edge from tip to tip, then
 * back along the inner edge.
 */
export function crescent(cx: number, cy: number, r: number, mirror = false): Polyline[] {
  const side = mirror ? -1 : 1;
  const inner = { x: cx + side * r * 0.4, y: cy - r * 0.14, r: r * 0.84 };
  const outer = keptArc(cx, cy, r, ([x, y]) => Math.hypot(x - inner.x, y - inner.y) > inner.r);
  const edge = keptArc(inner.x, inner.y, inner.r, ([x, y]) => Math.hypot(x - cx, y - cy) < r);
  if (outer.length < 2 || edge.length < 2) return [outer];
  // The inner edge runs back from where the outer one ends.
  const end = outer[outer.length - 1];
  const closer = (p: Point) => Math.hypot(p[0] - end[0], p[1] - end[1]);
  const back = closer(edge[0]) <= closer(edge[edge.length - 1]) ? edge : [...edge].reverse();
  return [[...outer, ...back, outer[0]]];
}

/** A star with `points` tips, as one closed stroke. */
export function star(cx: number, cy: number, r: number, points = 5, inner = 0.45): Polyline {
  const line: Polyline = [];
  for (let i = 0; i <= points * 2; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / points;
    const radius = i % 2 === 0 ? r : r * inner;
    line.push([cx + radius * Math.cos(a), cy + radius * Math.sin(a)]);
  }
  return line;
}

/** The eight-pointed star of two squares (rub el hizb), with a ring inside. */
export function eightPointStar(cx: number, cy: number, r: number): Polyline[] {
  const square = (turn: number): Polyline =>
    Array.from({ length: 5 }, (_, i) => {
      const a = turn + (Math.PI / 2) * i;
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as Point;
    });
  return [
    square(-Math.PI / 2),
    square(-Math.PI / 4),
    arcPoints(cx, cy, r * 0.42, -Math.PI / 2, Math.PI * 1.5, 48),
  ];
}

/**
 * A hanging lantern (fanous): its chain from `top`, the cap, a six-sided body
 * with a rib down the middle, and the base. `h` is the lantern's height.
 */
export function lantern(cx: number, top: number, chain: number, h: number): Polyline[] {
  const w = h * 0.46;
  const y0 = top + chain;
  const capH = h * 0.22;
  const bodyTop = y0 + capH;
  const bodyH = h * 0.58;
  const bodyBottom = bodyTop + bodyH;
  return [
    [
      [cx, top],
      [cx, y0 - h * 0.05],
    ],
    arcPoints(cx, y0 - h * 0.025, h * 0.025, -Math.PI / 2, Math.PI * 1.5, 16),
    [
      [cx - w * 0.2, y0],
      [cx + w * 0.2, y0],
      [cx + w * 0.55, bodyTop],
      [cx - w * 0.55, bodyTop],
      [cx - w * 0.2, y0],
    ],
    [
      [cx - w * 0.55, bodyTop],
      [cx - w * 0.5, bodyTop + bodyH * 0.5],
      [cx - w * 0.3, bodyBottom],
      [cx + w * 0.3, bodyBottom],
      [cx + w * 0.5, bodyTop + bodyH * 0.5],
      [cx + w * 0.55, bodyTop],
    ],
    [
      [cx, bodyTop],
      [cx, bodyBottom],
    ],
    [
      [cx - w * 0.3, bodyBottom],
      [cx - w * 0.18, bodyBottom + h * 0.12],
      [cx + w * 0.18, bodyBottom + h * 0.12],
      [cx + w * 0.3, bodyBottom],
    ],
  ];
}

/** An ellipse's outline, turned by `turn` radians. */
function ellipse(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  turn: number,
  steps = 40,
): Polyline {
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = (Math.PI * 2 * i) / steps;
    const x = rx * Math.cos(a);
    const y = ry * Math.sin(a);
    return [cx + x * cos - y * sin, cy + x * sin + y * cos] as Point;
  });
}

/** A flower: `petals` rounded petals around a small heart, each its own stroke. */
export function flower(cx: number, cy: number, r: number, petals = 6): Polyline[] {
  const lines: Polyline[] = Array.from({ length: petals }, (_, i) => {
    const a = -Math.PI / 2 + (Math.PI * 2 * i) / petals;
    return ellipse(cx + r * 0.52 * Math.cos(a), cy + r * 0.52 * Math.sin(a), r * 0.46, r * 0.24, a);
  });
  lines.push(arcPoints(cx, cy, r * 0.16, -Math.PI / 2, Math.PI * 1.5, 24));
  return lines;
}

/** A stem hanging from a flower, with a leaf on the leading side. */
export function stem(cx: number, top: number, length: number, mirror = false): Polyline[] {
  const side = mirror ? -1 : 1;
  const leafY = top + length * 0.5;
  return [
    [
      [cx, top],
      [cx, top + length],
    ],
    ellipse(cx + side * length * 0.16, leafY, length * 0.18, length * 0.07, side * -0.6),
  ];
}

/** A firework: `rays` short strokes bursting out from a ring around the centre. */
export function burst(cx: number, cy: number, r: number, rays = 12): Polyline[] {
  return Array.from({ length: rays }, (_, i) => {
    const a = (Math.PI * 2 * i) / rays;
    return [
      [cx + r * 0.35 * Math.cos(a), cy + r * 0.35 * Math.sin(a)],
      [cx + r * Math.cos(a), cy + r * Math.sin(a)],
    ] as Polyline;
  });
}

/** Strokes the first `fraction` of each polyline (the stroke style is the caller's). */
export function traceLines(
  ctx: CanvasRenderingContext2D,
  lines: readonly Polyline[],
  fraction: (index: number) => number,
) {
  lines.forEach((line, index) => {
    const part = partialPolyline(line, fraction(index));
    if (part.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(part[0][0], part[0][1]);
    for (let i = 1; i < part.length; i++) ctx.lineTo(part[i][0], part[i][1]);
    ctx.stroke();
  });
}
