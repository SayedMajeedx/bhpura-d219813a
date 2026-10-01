import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Package, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import { useBrand } from "@/lib/brand-context";
import { catalogQueries } from "@/lib/data/catalog";
import { formatDuration } from "@/lib/bookings/format";
import { MAX_PACKAGE_QUANTITY, type PackageLine } from "@/lib/bookings/service-package";
import { applyPercentOff, packagePriceRows } from "@/features/inventory/lib/package-pricing";
import type { ServicePricing } from "@/features/inventory/lib/service-pricing";

const PERCENTS = [10, 15, 20, 25];

/**
 * Makes a service a package: the services it includes (and how many of each),
 * with what they cost apart beside the package's own price and a shortcut to
 * price it a chosen percent below them. A booked package holds each included
 * service's own capacity, setup time and notice.
 */
export function ServicePackageFields({
  productId,
  isPackage,
  lines,
  onPackage,
  onLines,
  pricing,
  onPricing,
  currency,
  isAr,
  error,
}: {
  productId: string | null;
  isPackage: boolean;
  lines: PackageLine[];
  onPackage: (isPackage: boolean) => void;
  onLines: (lines: PackageLine[]) => void;
  pricing: ServicePricing | null;
  onPricing?: (pricing: ServicePricing) => void;
  currency: string;
  isAr: boolean;
  error?: string | null;
}) {
  const brand = useBrand();
  const products = useQuery(catalogQueries.products(brand.id)).data;
  const variants = useQuery(catalogQueries.variants(brand.id)).data;
  // Services a package can include: this store's active services that are not packages.
  const services = useMemo(
    () =>
      (products ?? [])
        .filter(
          (product) =>
            product.item_kind === "service" &&
            !product.is_package &&
            product.is_active &&
            product.id !== productId,
        )
        .map((product) => ({
          id: product.id,
          name: (isAr ? product.name_ar || product.name : product.name_en || product.name) ?? "",
          variants: (variants ?? []).filter((variant) => variant.product_id === product.id),
        })),
    [products, variants, productId, isAr],
  );
  const nameOf = (id: string) => services.find((service) => service.id === id)?.name ?? "";
  const unused = services.filter(
    (service) => !lines.some((line) => line.product_id === service.id),
  );
  const rows = pricing && isPackage ? packagePriceRows(pricing, lines, services) : [];
  const setLine = (index: number, patch: Partial<PackageLine>) =>
    onLines(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)));

  return (
    <section className="space-y-3 rounded-xl border border-border bg-muted/20 p-3">
      <div className="space-y-1">
        <Label className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
          <Package className="size-3.5" aria-hidden="true" />
          {isAr ? "باقة خدمات" : "Package of services"}
        </Label>
        <p className="text-xs text-muted-foreground">
          {isAr
            ? "اجمع عدة خدمات في باقة بسعر خاص. كل خدمة فيها تحتفظ بسعتها ووقت تجهيزها."
            : "Bundle several services into one package at its own price. Each service in it keeps its own capacity and setup time."}
        </p>
        <div
          role="group"
          aria-label={isAr ? "نوع الخدمة" : "Kind of service"}
          className="grid grid-cols-2 gap-1.5 pt-1"
        >
          {[false, true].map((value) => (
            <Button
              key={String(value)}
              type="button"
              size="sm"
              variant="chip"
              aria-pressed={isPackage === value}
              onClick={() => onPackage(value)}
              className={cn(
                "border border-border",
                isPackage === value && "border-primary bg-primary/10 text-foreground",
              )}
            >
              {value ? (isAr ? "باقة" : "A package") : isAr ? "خدمة واحدة" : "A single service"}
            </Button>
          ))}
        </div>
      </div>

      {isPackage && (
        <>
          <ul className="space-y-2">
            {lines.map((line, index) => (
              <li key={line.product_id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                  {nameOf(line.product_id) || (isAr ? "خدمة" : "Service")}
                </span>
                <Label htmlFor={`package-qty-${line.product_id}`} className="sr-only">
                  {isAr ? "الكمية" : "Quantity"}
                </Label>
                <Input
                  id={`package-qty-${line.product_id}`}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MAX_PACKAGE_QUANTITY}
                  dir="ltr"
                  className="h-9 w-20"
                  value={line.quantity}
                  onChange={(event) => setLine(index, { quantity: Number(event.target.value) })}
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  aria-label={isAr ? "إزالة من الباقة" : "Remove from the package"}
                  onClick={() => onLines(lines.filter((_, i) => i !== index))}
                >
                  <X className="size-4" />
                </Button>
              </li>
            ))}
          </ul>

          {unused.length > 0 ? (
            <div className="flex items-center gap-2">
              <Label htmlFor="package-add" className="sr-only">
                {isAr ? "أضف خدمة" : "Add a service"}
              </Label>
              <select
                id="package-add"
                className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm"
                value=""
                onChange={(event) => {
                  if (event.target.value) {
                    onLines([...lines, { product_id: event.target.value, quantity: 1 }]);
                  }
                }}
              >
                <option value="">
                  {isAr ? "+ أضف خدمة إلى الباقة" : "+ Add a service to the package"}
                </option>
                {unused.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            lines.length === 0 && (
              <p className="text-xs text-muted-foreground">
                {isAr
                  ? "أنشئ خدمات أولاً لتضيفها إلى الباقة."
                  : "Create some services first to put in a package."}
              </p>
            )
          )}

          {rows.length > 0 && (
            <div className="space-y-2 rounded-lg bg-background p-2.5 text-xs">
              {rows.map((row) => (
                <p key={row.minutes ?? "fixed"} className="flex flex-wrap justify-between gap-x-3">
                  <span className="font-semibold text-foreground">
                    {row.minutes === null
                      ? isAr
                        ? "السعر"
                        : "Price"
                      : formatDuration(row.minutes, isAr)}
                  </span>
                  <span className="text-muted-foreground">
                    {row.separate === null
                      ? isAr
                        ? "سعر الخدمات منفصلة غير متاح لهذه المدة"
                        : "Services apart: not priced for this length"
                      : `${isAr ? "منفصلة" : "Apart"} ${formatMoney(row.separate, currency)}`}
                    {" · "}
                    {isAr ? "الباقة" : "Package"} {formatMoney(row.price, currency)}
                    {row.saving && (
                      <span className="ms-1.5 font-semibold text-success">
                        {isAr ? `توفير ${row.saving.percent}%` : `saves ${row.saving.percent}%`}
                      </span>
                    )}
                  </span>
                </p>
              ))}
              {onPricing && pricing && lines.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-muted-foreground">
                    {isAr ? "سعّرها أقل من المنفصلة بـ" : "Price it below the services apart by"}
                  </span>
                  {PERCENTS.map((percent) => (
                    <Button
                      key={percent}
                      type="button"
                      size="xs"
                      variant="chip"
                      className="border border-border"
                      onClick={() => onPricing(applyPercentOff(pricing, lines, services, percent))}
                    >
                      {percent}%
                    </Button>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
      {error && (
        <p className="text-xs font-semibold text-destructive" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
