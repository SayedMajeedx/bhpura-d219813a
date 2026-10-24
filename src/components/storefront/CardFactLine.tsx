import { useStorefront } from "@/lib/storefront-context";
import { cardFact, hasCardFact } from "@/lib/product-facts";
import { cn } from "@/lib/utils";

/**
 * The one fact a card says under the name (`cardFact`: "Eau de Parfum · Oud", "Ethiopia · Light",
 * "21K · Gold · 4.2 g"). In a store whose kind says one, every card keeps the line, filled or not,
 * so a row's prices stay level; a store whose kind says none draws nothing.
 */
export function CardFactLine({
  details,
  reserve = true,
  className,
}: {
  details?: unknown;
  /** Keep the line when the product has no fact (a grid's row); a list's row leaves it out. */
  reserve?: boolean;
  className?: string;
}) {
  const { settings, lang } = useStorefront();
  const vertical = settings?.store_vertical;
  if (!hasCardFact(vertical)) return null;
  const fact = cardFact(details, vertical, lang === "ar" ? "ar" : "en");
  if (!fact && !reserve) return null;
  return (
    <p
      dir="auto"
      className={cn(
        "min-h-[1lh] truncate text-page-start text-xs text-muted-foreground",
        className,
      )}
    >
      {fact}
    </p>
  );
}
