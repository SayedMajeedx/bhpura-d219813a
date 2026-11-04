import { isLightPaper } from "./design";
import type { Shape } from "./geometry";

/**
 * Whether a card face prints well on any printer (the owner's report of 2026-11-04: the black and
 * store-colour cards came out streaked, faded and uneven on a shop's printer, one card at a
 * time). A face may lay down ink in lines, letters and small marks, and the store's photograph in
 * its frame; a field of colour deeper than light paper may take only a sliver of it.
 */

/** The most of a card a field deeper than light paper may cover (marks, a crescent, a star). */
export const MOST_DEEP_FIELD = 0.02;

type Box = { x: number; y: number; w: number; h: number };

/**
 * A path's bounding box (an upper bound of what it covers): its points, and for an arc its end
 * widened by its radius on every side.
 */
function pathBox(d: string): Box | null {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [, command, args] of d.matchAll(/([MLHVCSQTAZ])([^MLHVCSQTAZ]*)/gi)) {
    const n = (args.match(/-?\d*\.?\d+(?:e-?\d+)?/gi) ?? []).map(Number);
    const c = command.toUpperCase();
    if (c === "A") {
      for (let i = 0; i + 6 < n.length; i += 7) {
        const [rx, ry, , , , x, y] = n.slice(i, i + 7);
        xs.push(x - rx, x + rx);
        ys.push(y - ry, y + ry);
      }
    } else if (c === "H") xs.push(...n);
    else if (c === "V") ys.push(...n);
    else {
      for (let i = 0; i + 1 < n.length; i += 2) {
        xs.push(n[i]);
        ys.push(n[i + 1]);
      }
    }
  }
  if (!xs.length || !ys.length) return null;
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** The part of a box on the card (a ground drawn into the bleed counts only on the card). */
function onCard(box: Box, size: { w: number; h: number }): number {
  const w = Math.min(box.x + box.w, size.w) - Math.max(box.x, 0);
  const h = Math.min(box.y + box.h, size.h) - Math.max(box.y, 0);
  return Math.max(w, 0) * Math.max(h, 0);
}

export function printCoverage(
  shapes: readonly Shape[],
  size: { w: number; h: number },
): {
  /** The share of the card under fields deeper than light paper. */
  deepField: number;
  /** The share under the store's photograph. */
  photo: number;
  /** A photograph runs past the card's edge (into what a home printer cannot reach). */
  photoBleeds: boolean;
} {
  const card = size.w * size.h;
  let deep = 0;
  let photo = 0;
  let photoBleeds = false;
  for (const shape of shapes) {
    if (shape.kind === "image") {
      photo += onCard(shape, size);
      photoBleeds ||=
        shape.x < 0 || shape.y < 0 || shape.x + shape.w > size.w || shape.y + shape.h > size.h;
      continue;
    }
    if (shape.kind !== "rect" && shape.kind !== "path") continue;
    const fill = shape.fill;
    if (!fill || fill === "none" || isLightPaper(fill)) continue;
    const box = shape.kind === "rect" ? shape : pathBox(shape.d);
    if (box) deep += onCard(box, size);
  }
  return { deepField: deep / card, photo: photo / card, photoBleeds };
}
