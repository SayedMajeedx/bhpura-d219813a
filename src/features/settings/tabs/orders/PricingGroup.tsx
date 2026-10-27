import { useI18n } from "@/lib/i18n";
import { DisplayCurrenciesField } from "@/features/settings/tabs/orders/DisplayCurrenciesField";
import { useBrandSettingsFormContext } from "@/features/settings/use-brand-settings-form";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useId } from "react";
import { Coins, Percent } from "lucide-react";
import { hasVatNumber, vatNumberPatch } from "@/lib/vat-registration";

const SUPPORTED_CURRENCIES = [
  { code: "BHD", name_en: "BHD — Bahraini Dinar", name_ar: "د.ب — دينار بحريني" },
  { code: "SAR", name_en: "SAR — Saudi Riyal", name_ar: "ر.س — ريال سعودي" },
  { code: "AED", name_en: "AED — UAE Dirham", name_ar: "د.إ — درهم إماراتي" },
  { code: "KWD", name_en: "KWD — Kuwaiti Dinar", name_ar: "د.ك — دينار كويتي" },
  { code: "QAR", name_en: "QAR — Qatari Riyal", name_ar: "ر.ق — ريال قطري" },
  { code: "OMR", name_en: "OMR — Omani Rial", name_ar: "ر.ع — ريال عماني" },
  { code: "USD", name_en: "USD — US Dollar ($)", name_ar: "$ — دولار أمريكي" },
  { code: "EUR", name_en: "EUR — Euro (€)", name_ar: "€ — يورو" },
  { code: "GBP", name_en: "GBP — British Pound (£)", name_ar: "£ — جنيه إسترليني" },
];

export function PricingGroup() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const { form, setBs } = useBrandSettingsFormContext();
  const bs = form.bs;
  const ids = useId();
  // VAT is charged only with a VAT number: until one is written the rate stays 0.
  const registered = hasVatNumber(bs.vat_number);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border p-5 bg-card shadow-sm space-y-5">
        <div>
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Coins className="size-4 text-primary" />
            <span>{isAr ? "الأسعار والضريبة" : "Pricing & tax"}</span>
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {isAr
              ? "حدد عملة الحساب الأساسية ونسبة ضريبة القيمة المضافة (VAT) وكيفية احتسابها في المتجر."
              : "Configure store base currency, tax identification number, and VAT calculation rules."}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Base Currency */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">
              {isAr ? "عملة المتجر الأساسية" : "Store Base Currency"}
            </Label>
            <Select value={bs.currency || "BHD"} onValueChange={(val) => setBs({ currency: val })}>
              <SelectTrigger className="text-xs h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUPPORTED_CURRENCIES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {isAr ? c.name_ar : c.name_en}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* VAT Registration Number: VAT is charged only with one */}
          <div className="space-y-1.5">
            <Label htmlFor={`${ids}-vat-number`} className="text-xs font-medium">
              {isAr ? "الرقم الضريبي للمنشأة" : "Tax / VAT ID Number"}
            </Label>
            <Input
              id={`${ids}-vat-number`}
              className="text-xs h-9 font-mono"
              value={bs.vat_number ?? ""}
              placeholder="3xxxxxxxxxxxxxx"
              onChange={(e) => setBs(vatNumberPatch(e.target.value))}
            />
          </div>
          <DisplayCurrenciesField isAr={isAr} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* VAT Rate: only with a VAT number */}
          <div className="space-y-1.5">
            <Label
              htmlFor={`${ids}-vat-rate`}
              className="text-xs font-medium flex items-center gap-1.5"
            >
              <Percent className="size-3.5 text-primary" />
              <span>{isAr ? "نسبة ضريبة القيمة المضافة (%)" : "VAT Tax Rate (%)"}</span>
            </Label>
            <Input
              id={`${ids}-vat-rate`}
              type="number"
              step="0.1"
              min="0"
              max="100"
              className="text-xs h-9 font-mono"
              value={registered ? (bs.default_tax_rate ?? 0) : 0}
              disabled={!registered}
              aria-describedby={`${ids}-vat-note`}
              placeholder="10"
              onChange={(e) =>
                setBs({
                  default_tax_rate: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                })
              }
            />
            <p id={`${ids}-vat-note`} className="text-xs text-muted-foreground">
              {registered
                ? isAr
                  ? "تُضاف إلى طلبات المتجر الجديدة بهذه النسبة."
                  : "Added to the store's new orders at this rate."
                : isAr
                  ? "لا تُحتسب ضريبة على طلباتك حتى تكتب الرقم الضريبي للمنشأة."
                  : "No VAT is charged on your orders until you enter your VAT number."}
            </p>
          </div>
          {/* VAT Inclusive Switch */}
          <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-3.5 bg-background self-end">
            <div>
              <Label className="cursor-pointer text-xs font-semibold">
                {isAr ? "الأسعار شاملة الضريبة" : "Prices are VAT inclusive"}
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isAr ? "السعر المعروض للعميل يتضمن الضريبة" : "Displayed prices include tax"}
              </p>
            </div>
            <Switch
              checked={bs.vat_inclusive ?? false}
              disabled={!registered}
              aria-label={isAr ? "الأسعار شاملة الضريبة" : "Prices are VAT inclusive"}
              onCheckedChange={(checked) => setBs({ vat_inclusive: checked })}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">
              {isAr ? "خصم شراء الطقم (%)" : "Bundle discount (%)"}
            </Label>
            <Input
              type="number"
              min={0}
              max={50}
              className="text-xs h-9 font-mono"
              value={bs.bundle_discount_percent ?? 0}
              onChange={(e) =>
                setBs({
                  bundle_discount_percent: Math.min(50, Math.max(0, Number(e.target.value) || 0)),
                })
              }
            />
            <p className="text-xs text-muted-foreground">
              {isAr
                ? 'يُطبَّق على عرض "أكمل طلبك" في صفحة المنتج. صفر = اقتراح بدون خصم.'
                : 'Applied to the "Complete the set" offer on product pages. 0 = suggestion without discount.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
