import { useId } from "react";
import { Button } from "@/components/ui/button";
import { useBrandSettingsFormContext } from "@/features/settings/use-brand-settings-form";
import { DISPLAY_CURRENCIES, isDisplayCurrency } from "@/lib/exchange-rates";
import { cn } from "@/lib/utils";

/**
 * Which currencies the store's shoppers may see prices in (`business_settings.display_currencies`,
 * migration 20261027130000): a price then reads "≈ 312 SAR" beside the real one. Display only:
 * the store charges, invoices and reports in its own currency. None by default.
 */
export function DisplayCurrenciesField({ isAr }: { isAr: boolean }) {
  const { form, setBs } = useBrandSettingsFormContext();
  const id = useId();
  const store = String(form.bs.currency || "BHD");
  const chosen = (
    Array.isArray(form.bs.display_currencies) ? form.bs.display_currencies : []
  ).filter(isDisplayCurrency);
  const toggle = (code: string) =>
    setBs({
      display_currencies: (chosen as string[]).includes(code)
        ? chosen.filter((c) => c !== code)
        : [...chosen, code],
    });

  return (
    <div className="space-y-1.5 sm:col-span-2">
      <p id={id} className="text-xs font-medium">
        {isAr
          ? "عملات يرى بها العميل الأسعار (تقريبية)"
          : "Currencies shoppers may see prices in (approximate)"}
      </p>
      <div role="group" aria-labelledby={id} className="flex flex-wrap gap-2">
        {DISPLAY_CURRENCIES.filter((c) => c.code !== store).map(({ code, ar, en }) => {
          const on = chosen.includes(code);
          return (
            <Button
              key={code}
              type="button"
              variant="outline"
              aria-pressed={on}
              className={cn(
                "h-9 rounded-full px-3 text-xs",
                on && "border-primary bg-primary/10 text-foreground",
              )}
              onClick={() => toggle(code)}
            >
              {code} · {isAr ? ar : en}
            </Button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        {isAr
          ? `يظهر السعر مثل «≈ 312 SAR» بجانب السعر الحقيقي، ويبقى الدفع بعملة المتجر. الأسعار تُحدَّث يوميًا.`
          : `A price reads "≈ 312 SAR" beside the real one; customers still pay in the store's currency. Rates are refreshed daily.`}
      </p>
    </div>
  );
}
