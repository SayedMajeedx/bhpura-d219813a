import { useI18n } from "@/lib/i18n";
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
import { Coins, Percent } from "lucide-react";

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

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border p-5 bg-card shadow-sm space-y-5">
        <div>
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Coins className="size-4 text-primary" />
            <span>{isAr ? "العملة والضرائب (Currency & VAT)" : "Currency & Taxation"}</span>
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
            <Select
              value={bs.currency || "BHD"}
              onValueChange={(val) => setBs({ currency: val })}
            >
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

          {/* Default VAT Rate */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium flex items-center gap-1.5">
              <Percent className="size-3.5 text-primary" />
              <span>{isAr ? "نسبة ضريبة القيمة المضافة (%)" : "VAT Tax Rate (%)"}</span>
            </Label>
            <Input
              type="number"
              step="0.1"
              min="0"
              max="100"
              className="text-xs h-9 font-mono"
              value={bs.default_tax_rate ?? 0}
              placeholder="10"
              onChange={(e) =>
                setBs({
                  default_tax_rate: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                })
              }
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
          {/* VAT Registration Number */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">
              {isAr ? "الرقم الضريبي للمنشأة" : "Tax / VAT ID Number"}
            </Label>
            <Input
              className="text-xs h-9 font-mono"
              value={bs.vat_number ?? ""}
              placeholder="3xxxxxxxxxxxxxx"
              onChange={(e) => setBs({ vat_number: e.target.value || null })}
            />
          </div>

          {/* VAT Inclusive Switch */}
          <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-3.5 bg-background self-end">
            <div>
              <Label className="cursor-pointer text-xs font-semibold">
                {isAr ? "الأسعار شاملة الضريبة" : "Prices are VAT inclusive"}
              </Label>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {isAr ? "السعر المعروض للعميل يتضمن الضريبة" : "Displayed prices include tax"}
              </p>
            </div>
            <Switch
              checked={bs.vat_inclusive ?? false}
              onCheckedChange={(checked) => setBs({ vat_inclusive: checked })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
