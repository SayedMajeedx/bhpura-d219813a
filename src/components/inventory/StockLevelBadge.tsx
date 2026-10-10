import { useVocabulary } from "@/hooks/use-vocabulary";
import { stockUnitsLabel } from "@/lib/inventory-labels";
import {
  availabilityBadge,
  productAvailability,
  type AvailabilityProduct,
  type AvailabilityTone,
} from "@/lib/product-availability";

const TONE_CLASSES: Record<AvailabilityTone, string> = {
  out: "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300",
  low: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  ok: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  made_to_order: "bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-300",
  service: "bg-muted text-muted-foreground",
};

/**
 * A product's stock in one badge, the same on the desktop list and the mobile cards: out of
 * stock, N left, N available, or (for a made-to-order piece) "made to order" in the store's own
 * word, with the pieces left to make (when the store limits them) and the ready pieces beside it.
 */
export function StockLevelBadge({
  product,
  totalStock,
  lang,
  className = "",
}: {
  product: AvailabilityProduct;
  totalStock: number;
  lang: "ar" | "en";
  className?: string;
}) {
  const { vocabulary } = useVocabulary();
  const badge = availabilityBadge(productAvailability(product, totalStock), lang, {
    unitsLabel: (units, kind) => stockUnitsLabel(units, kind, lang),
    madeToOrder: vocabulary.made_to_order?.[lang],
  });
  return (
    <span className={`inline-flex flex-wrap items-center gap-1.5 ${className}`}>
      <span
        className={`inline-flex rounded-md px-2 py-0.5 text-xs font-bold ${TONE_CLASSES[badge.tone]}`}
      >
        {badge.label}
      </span>
      {badge.details.map((detail) => (
        <span
          key={detail}
          className="inline-flex rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-foreground"
        >
          {detail}
        </span>
      ))}
    </span>
  );
}
