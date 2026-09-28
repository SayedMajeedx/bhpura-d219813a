import { resolveColorHex } from "@/lib/color-names";
import { formatAxisValue, type ResolvedVariantAxis, type VariantLike } from "@/lib/variant-axes";

/** One stop of the run: an option value, how it reads, its swatch colour and photo. */
export type OptionStop = {
  value: string;
  label: string;
  /** A paintable CSS colour when the axis is a colour axis, else null (drawn as a chip). */
  color: string | null;
  /** The photo of the first variant with this value that has one. */
  imageUrl: string | null;
};

export type OptionRun = {
  /** The axis name as the store labels it ("Colour", "Roast level"). */
  axisLabel: string;
  swatch: boolean;
  stops: OptionStop[];
};

/** At most this many stops, so each one stays on screen long enough to read. */
export const MAX_STOPS = 6;

/**
 * The option a Swatch Run cycles through for one product: its colour axis
 * when it has one (round swatches), otherwise another option with at least
 * two values (chips). Sizes are skipped: they rarely have photos of their
 * own. Null when the product has nothing to cycle through.
 */
export function optionRun(
  axes: ResolvedVariantAxis[],
  variants: Array<VariantLike & { image_url?: string | null }>,
  lang: "ar" | "en",
): OptionRun | null {
  const axis =
    axes.find((candidate) => candidate.swatch && candidate.values.length >= 2) ??
    axes.find((candidate) => candidate.field !== "size" && candidate.values.length >= 2);
  if (!axis) return null;
  const stops = axis.values.slice(0, MAX_STOPS).map((value) => {
    const key = value.trim().toLowerCase();
    const withPhoto = variants.find(
      (variant) =>
        (variant[axis.field] ?? "").trim().toLowerCase() === key && Boolean(variant.image_url),
    );
    return {
      value,
      label: formatAxisValue(axis, value, lang, variants),
      color: axis.swatch ? resolveColorHex(value) : null,
      imageUrl: withPhoto?.image_url ?? null,
    };
  });
  return { axisLabel: axis.label, swatch: axis.swatch, stops };
}
