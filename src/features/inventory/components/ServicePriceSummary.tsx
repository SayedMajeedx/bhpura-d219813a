import { CalendarDays, Package } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useBrand } from "@/lib/brand-context";
import { catalogQueries } from "@/lib/data/catalog";
import { packageLinesById, servicePackagesQueries } from "@/lib/data/service-packages";
import { packageLinesText } from "@/lib/bookings/service-package";
import { formatMoney } from "@/lib/format";
import { formatDuration } from "@/lib/bookings/format";
import type { Product, Variant } from "@/features/inventory/types";
import { describeServiceBooking, serviceBookingFrom } from "@/lib/bookings/service-capacity";

/** The services a package includes, in its list entry. */
function PackageContentsLine({ productId, isAr }: { productId: string; isAr: boolean }) {
  const brand = useBrand();
  const items = useQuery(servicePackagesQueries.items(brand.id)).data;
  const products = useQuery(catalogQueries.products(brand.id)).data;
  const included = items ? (packageLinesById(items).get(productId) ?? []) : [];
  const text = packageLinesText(
    included,
    (id) => {
      const item = (products ?? []).find((candidate) => candidate.id === id);
      return (isAr ? item?.name_ar || item?.name : item?.name_en || item?.name) ?? "";
    },
    isAr,
  );
  return (
    <p className="flex items-start gap-1.5 text-xs font-medium text-foreground">
      <Package className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span>
        {isAr ? "باقة تشمل: " : "Package including: "}
        {text || (isAr ? "لا خدمات بعد" : "no services yet")}
      </span>
    </p>
  );
}

/**
 * A service in the inventory list: its lengths and prices (or its fixed
 * price) instead of a product's sizes, colours and stock. Its prices are
 * edited in the service's own editor.
 */
export function ServicePriceSummary({
  variants,
  isAr,
  currency,
  product,
}: {
  variants: readonly Variant[];
  isAr: boolean;
  currency: string;
  /** The service itself: its booking rules (capacity, scope, notice) show under its prices. */
  product?: Product;
}) {
  const rules = describeServiceBooking(serviceBookingFrom(product), isAr);
  const rows = [...variants]
    .map((variant) => ({
      id: variant.id,
      minutes: (variant as Variant & { duration_minutes?: number | null }).duration_minutes ?? null,
      price: Number(variant.selling_price ?? 0),
      was: Number(variant.original_price ?? 0),
    }))
    .sort((a, b) => (a.minutes ?? 0) - (b.minutes ?? 0));

  return (
    <div className="space-y-2 rounded-xl border border-border bg-muted/20 p-3 text-sm">
      <p className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
        <CalendarDays className="size-3.5" aria-hidden="true" />
        {isAr ? "الأسعار والمدد" : "Prices & lengths"}
      </p>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {isAr
            ? "لا سعر بعد: افتح تعديل الخدمة وأضف سعرها."
            : "No price yet: open the service's editor and add its price."}
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex items-baseline gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5"
            >
              <span className="font-medium text-foreground">
                {row.minutes
                  ? formatDuration(row.minutes, isAr)
                  : isAr
                    ? "سعر ثابت"
                    : "Fixed price"}
              </span>
              <span dir="ltr" className="text-foreground">
                {formatMoney(row.price, currency)}
              </span>
              {row.was > row.price && (
                <span dir="ltr" className="text-xs text-muted-foreground line-through">
                  {formatMoney(row.was, currency)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {product?.is_package && <PackageContentsLine productId={product.id} isAr={isAr} />}
      {rules.length > 0 && (
        <p className="text-xs font-medium text-foreground">{rules.join(" · ")}</p>
      )}
      <p className="text-xs text-muted-foreground">
        {isAr ? "تُعدَّل الأسعار من تعديل الخدمة." : "Edit the prices in the service's editor."}
      </p>
    </div>
  );
}
