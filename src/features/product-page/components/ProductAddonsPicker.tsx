import { useStorefront, formatPrice } from "@/lib/storefront-context";
import { Sparkles, Check } from "lucide-react";
import { shouldShowPrices } from "@/lib/storefront-mode";
import type { fetchCustomizationOptions } from "@/lib/data/storefront";

/** Optional paid or free add-ons for this product. */
export function ProductAddonsPicker({
  applicableAddons,
  currency,
  lang,
  selectedAddonIds,
  settings,
  t,
  toggleAddon,
}: {
  applicableAddons: Awaited<ReturnType<typeof fetchCustomizationOptions>>;
  currency: ReturnType<typeof useStorefront>["currency"];
  lang: ReturnType<typeof useStorefront>["lang"];
  selectedAddonIds: string[];
  settings: ReturnType<typeof useStorefront>["settings"];
  t: ReturnType<typeof useStorefront>["t"];
  toggleAddon: (id: string) => void;
}) {
  return (
    <div className="mb-6 space-y-3 rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Sparkles className="h-4 w-4 text-primary" />
        <span>{t("الإضافات والتخصيصات المتاحة", "Available Add-ons & Customizations")}</span>
      </div>
      <div className="grid gap-2">
        {applicableAddons.map((addon: any) => {
          const isSelected = selectedAddonIds.includes(addon.id);
          const delta = Number(addon.price_delta || 0);
          return (
            <button
              key={addon.id}
              type="button"
              onClick={() => toggleAddon(addon.id)}
              className={`flex items-center justify-between gap-3 rounded-lg border p-3 text-start transition-all ${
                isSelected
                  ? "border-primary bg-primary/5 text-primary font-medium ring-1 ring-primary"
                  : "border-border hover:border-muted-foreground/40 bg-background"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                    isSelected
                      ? "bg-primary border-primary text-primary-foreground"
                      : "border-muted-foreground/40"
                  }`}
                >
                  {isSelected && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                </div>
                <span className="text-sm truncate">{addon.name}</span>
              </div>
              {shouldShowPrices(settings) &&
                (delta > 0 ? (
                  <span className="shrink-0 text-xs font-semibold dir-ltr">
                    + {formatPrice(delta, currency, lang)}
                  </span>
                ) : (
                  <span className="shrink-0 text-xs text-muted-foreground font-medium">
                    {t("مجاني", "Free")}
                  </span>
                ))}
            </button>
          );
        })}
      </div>
    </div>
  );
}
