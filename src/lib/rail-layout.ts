/**
 * How a home page section lays out its products on a wide screen.
 *
 * From four products up it is the usual grid (3 columns, 4 on large screens). With fewer, a grid
 * leaves its right half empty and the section looks unfinished, so the few cards keep the size
 * they would have in the grid and sit in the middle, as a small curated edit. A phone scrolls
 * sideways whatever the count.
 */
export type RailLayout = "grid" | "centered";

/** The most products that are centred instead of filling a grid row. */
export const CENTERED_RAIL_MAX = 3;

export function railLayout(count: number): RailLayout {
  return count > 0 && count <= CENTERED_RAIL_MAX ? "centered" : "grid";
}

/** Classes for the products' container on a wide screen (the phone's sideways scroll is shared). */
export const RAIL_CONTAINER: Record<RailLayout, string> = {
  grid: "md:grid md:grid-cols-3 md:gap-6 md:overflow-visible md:pb-0 lg:grid-cols-4",
  centered: "md:flex md:flex-wrap md:justify-center md:gap-6 md:overflow-visible md:pb-0",
};

/** Classes for one card: in the centred layout it is as wide as a grid column would be. */
export const RAIL_CARD: Record<RailLayout, string> = {
  grid: "md:w-auto md:min-w-0 md:shrink",
  centered: "md:min-w-0 md:shrink-0 md:w-[calc((100%-3rem)/3)] lg:w-[calc((100%-4.5rem)/4)]",
};
