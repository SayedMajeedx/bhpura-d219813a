import { useQuery } from "@tanstack/react-query";
import { Check, Package } from "lucide-react";
import { formatPrice, useStorefront } from "@/lib/storefront-context";
import { storefrontQueries } from "@/lib/data/storefront";
import { packageLinesById, servicePackagesQueries } from "@/lib/data/service-packages";
import { packageSaving, separatePrice } from "@/lib/bookings/service-package";

/**
 * What a package includes, on its page: each service (with how many), what
 * they would cost apart for the chosen length, and the saving. Renders nothing
 * for a service that is not a package.
 */
export function PackageIncludes({
  product,
  minutes,
  price,
}: {
  product: { id: string; is_package?: boolean | null };
  /** The chosen length (null for a package priced at one fixed price). */
  minutes: number | null;
  /** The package's price at that length. */
  price: number;
}) {
  const { brand, lang, currency, t } = useStorefront();
  const isAr = lang === "ar";
  const enabled = Boolean(product.is_package);
  const items = useQuery({ ...servicePackagesQueries.items(brand.id), enabled }).data;
  const products = useQuery({ ...storefrontQueries.products(brand), enabled }).data;
  if (!enabled || !items) return null;

  const lines = packageLinesById(items).get(product.id) ?? [];
  if (lines.length === 0) return null;
  const services = (products ?? []).map((item) => ({
    id: item.id,
    name: (isAr ? item.name_ar || item.name : item.name_en || item.name) ?? "",
    variants: item.product_variants,
  }));
  const apart = separatePrice(lines, services, minutes);
  const saving = packageSaving(apart, price);

  return (
    <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Package className="size-4 text-primary" aria-hidden="true" />
        {t("ما تشمله الباقة", "What's in the package")}
      </p>
      <ul className="space-y-1.5">
        {lines.map((line) => {
          const name = services.find((service) => service.id === line.product_id)?.name;
          if (!name) return null;
          return (
            <li key={line.product_id} className="flex items-start gap-2 text-sm text-foreground">
              <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              <span className="min-w-0 break-words">
                {name}
                {line.quantity > 1 ? ` × ${line.quantity}` : ""}
              </span>
            </li>
          );
        })}
      </ul>
      {saving && apart !== null && (
        <p className="text-sm text-muted-foreground">
          {t("منفصلة: ", "Apart: ")}
          <s dir="ltr">{formatPrice(apart, currency, lang)}</s>
          <span className="ms-2 font-semibold text-success">
            {t(
              `وفّر ${saving.percent}% (${formatPrice(saving.amount, currency, lang)})`,
              `Save ${saving.percent}% (${formatPrice(saving.amount, currency, lang)})`,
            )}
          </span>
        </p>
      )}
    </div>
  );
}
