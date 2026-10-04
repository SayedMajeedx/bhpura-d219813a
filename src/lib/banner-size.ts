/**
 * How tall the storefront's banners are: the picture-and-title bands above a home page section
 * and above a category's products. The merchant keeps the picture and the title they chose; this
 * only sets how much of the screen the band takes.
 *
 *   compact  a slim band: the products start in the first screen (the default)
 *   medium   room for the picture to read, still well under half the screen
 *   large    the original tall band: a statement, at the cost of the first screen
 */
export const BANNER_SIZES = ["compact", "medium", "large"] as const;
export type BannerSize = (typeof BANNER_SIZES)[number];
export const DEFAULT_BANNER_SIZE: BannerSize = "compact";

/** A stored value as a size; anything unknown is the default. */
export function resolveBannerSize(value: unknown): BannerSize {
  return (BANNER_SIZES as readonly unknown[]).includes(value)
    ? (value as BannerSize)
    : DEFAULT_BANNER_SIZE;
}

/** The classes of one banner at one size (written out whole so Tailwind finds them). */
export type BannerSpec = {
  /** The band's least height. */
  height: string;
  /** The title's size. */
  title: string;
  /** Space above and below the title inside the band. */
  padding: string;
  /** Space above and below the products under it. */
  body: string;
  /** Space between the breadcrumb and the title (a category banner). */
  gap: string;
};

/** The band above a home page section (new arrivals, best sellers, sale, trending). */
export const SECTION_BANNER: Record<BannerSize, BannerSpec> = {
  compact: {
    height: "min-h-[clamp(8rem,14vw,11rem)]",
    title: "text-[clamp(1.5rem,3vw,2.25rem)]",
    padding: "py-6 sm:py-8",
    body: "py-8 sm:py-10",
    gap: "mb-3",
  },
  medium: {
    height: "min-h-[clamp(11rem,22vw,16rem)]",
    title: "text-[clamp(1.75rem,4vw,3rem)]",
    padding: "py-8 sm:py-10",
    body: "py-10 sm:py-12",
    gap: "mb-4",
  },
  large: {
    height: "min-h-[clamp(14rem,30vw,24rem)]",
    title: "text-[clamp(2rem,5vw,4rem)]",
    padding: "py-10 sm:py-14",
    body: "py-10 sm:py-14",
    gap: "mb-5",
  },
};

/** The band above a category's products. */
export const CATEGORY_BANNER: Record<BannerSize, BannerSpec> = {
  compact: {
    height: "min-h-[clamp(9rem,15vw,12rem)]",
    title: "text-2xl sm:text-3xl",
    padding: "py-6 sm:py-8",
    body: "",
    gap: "mb-3",
  },
  medium: {
    height: "min-h-[clamp(12rem,22vw,17rem)]",
    title: "text-3xl sm:text-4xl",
    padding: "py-8 sm:py-12",
    body: "",
    gap: "mb-4",
  },
  large: {
    height: "min-h-[clamp(16rem,32vw,24rem)]",
    title: "text-3xl sm:text-5xl",
    padding: "py-12 sm:py-16",
    body: "",
    gap: "mb-5",
  },
};
