import { useI18n } from "@/lib/i18n";
import { useBrandSettingsFormContext } from "@/features/settings/use-brand-settings-form";
import { AdvancedOnly } from "@/features/settings/FieldVisibility";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2, Sparkles } from "lucide-react";

export function LoaderGroup() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const { form, setBs } = useBrandSettingsFormContext();
  const bs = form.bs;

  const textAr = bs.storefront_loader_text_ar ?? "";
  const textEn = bs.storefront_loader_text_en ?? "";
  const previewText = (isAr ? textAr : textEn) || (isAr ? textEn : textAr) || (isAr ? "جاري فتح المتجر الإلكتروني..." : "Loading boutique storefront...");

  return (
    <AdvancedOnly
      fieldKey="storefront_loader_text_ar"
      reason={isAr ? "تخصيص عبارة شاشة التحميل الترحيبية" : "Customize storefront loading screen message"}
    >
      <div className="rounded-xl border border-border p-5 bg-card shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          <div>
            <h3 className="text-base font-semibold text-foreground">
              {isAr ? "شاشة تحميل وفتح المتجر (Loading Screen)" : "Storefront Loading Screen"}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {isAr
                ? "العبارة الترحيبية التي تظهر للمتسوقين لثوانٍ معدودة أثناء تجهيز وفتح المتجر لأول مرة."
                : "The message shown to shoppers during initial storefront load and resource caching."}
            </p>
          </div>
        </div>

        {/* Live Loader Preview */}
        <div className="rounded-xl border border-border p-6 bg-muted/10 flex flex-col items-center justify-center gap-3 text-center">
          <Loader2 className="size-6 text-primary animate-spin" />
          <p className="text-xs font-medium text-foreground tracking-wide">
            {previewText}
          </p>
          <span className="text-[10px] text-muted-foreground">
            {isAr ? "معاينة حية لشاشة فتح المتجر" : "Live loading screen preview"}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div dir="rtl">
            <Label className="text-xs font-medium">
              {isAr ? "عبارة التحميل (عربي)" : "Loading Message (Arabic)"}
            </Label>
            <Input
              className="mt-1.5 text-end text-xs h-9"
              value={textAr}
              placeholder={isAr ? "جاري فتح المتجر الإلكتروني..." : "Loading..."}
              onChange={(e) => setBs({ storefront_loader_text_ar: e.target.value || null })}
            />
          </div>

          <div dir="ltr">
            <Label className="text-xs font-medium">
              {isAr ? "عبارة التحميل (إنجليزي)" : "Loading Message (English)"}
            </Label>
            <Input
              className="mt-1.5 text-start text-xs h-9"
              value={textEn}
              placeholder="Loading boutique storefront..."
              onChange={(e) => setBs({ storefront_loader_text_en: e.target.value || null })}
            />
          </div>
        </div>
      </div>
    </AdvancedOnly>
  );
}
