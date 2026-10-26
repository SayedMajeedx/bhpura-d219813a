import { formatPrice, useStorefront } from "@/lib/storefront-context";
import type { AddOnLine } from "@/features/services-home/lib/rental-card";

/**
 * A service's add-ons with their prices (`addOnLines`: what comes with every booking first, "+ 30",
 * a block price as "from", "Included"). One list for a rental's card and a service's own page:
 * the page, the one most often shared, once showed none of them.
 */
export function AddOnList({ lines }: { lines: readonly AddOnLine[] }) {
  const { lang, currency, t } = useStorefront();
  if (lines.length === 0) return null;
  return (
    <section className="space-y-1.5" aria-label={t("الإضافات", "Add-ons")}>
      <h4 className="text-xs font-semibold text-muted-foreground">{t("الإضافات", "Add-ons")}</h4>
      <ul className="divide-y divide-border/60 text-sm">
        {lines.map((extra) => (
          <li key={extra.id} className="flex items-baseline justify-between gap-3 py-1.5">
            <span className="min-w-0 break-words text-foreground">
              {extra.name}
              {extra.always && extra.price !== null && (
                <span className="text-xs text-muted-foreground">
                  {t(" · مع كل حجز", " · with every booking")}
                </span>
              )}
            </span>
            <span className="shrink-0 font-medium text-foreground">
              {extra.price === null ? (
                <span className="text-muted-foreground">{t("مشمولة", "Included")}</span>
              ) : (
                <>
                  {extra.from ? t("من ", "from ") : "+ "}
                  <span>{formatPrice(extra.price, currency, lang)}</span>
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
