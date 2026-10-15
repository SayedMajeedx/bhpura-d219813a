import { useI18n } from "@/lib/i18n";
import { useBrandSettingsFormContext } from "@/features/settings/use-brand-settings-form";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sparkles } from "lucide-react";

type BoolKey =
  | "product_card_hover_image"
  | "product_card_color_dots"
  | "product_card_quick_add"
  | "quick_view_enabled"
  | "category_filters_enabled"
  | "pdp_image_zoom"
  | "social_proof_enabled"
  | "motion_enabled"
  | "back_in_stock_enabled";

const TOGGLES: Array<{ key: BoolKey; ar: string; en: string; hintAr: string; hintEn: string }> = [
  {
    key: "product_card_hover_image",
    ar: "صورة ثانية عند المرور",
    en: "Second image on hover",
    hintAr: "تبديل الصورة عند تمرير الماوس على البطاقة",
    hintEn: "Swap to the second product image on hover",
  },
  {
    key: "product_card_color_dots",
    ar: "نقاط الألوان على البطاقة",
    en: "Colour dots on cards",
    hintAr: "ألوان المنتج المتاحة أسفل الصورة",
    hintEn: "Available colours under the card image",
  },
  {
    key: "product_card_quick_add",
    ar: "إضافة سريعة",
    en: "Quick add",
    hintAr: "اختيار المقاس والإضافة للسلة من الشبكة (سطح المكتب)",
    hintEn: "Pick a size and add from the grid (desktop)",
  },
  {
    key: "quick_view_enabled",
    ar: "معاينة سريعة",
    en: "Quick view",
    hintAr: "نافذة معاينة المنتج من الشبكة",
    hintEn: "Product preview modal from the grid",
  },
  {
    key: "category_filters_enabled",
    ar: "فلاتر الأقسام",
    en: "Category filters",
    hintAr: "المقاس واللون والسعر والمتوفر",
    hintEn: "Size, colour, price and in-stock filters",
  },
  {
    key: "pdp_image_zoom",
    ar: "تكبير صور المنتج",
    en: "Product image zoom",
    hintAr: "تكبير عند المرور وlightbox على الجوال",
    hintEn: "Hover zoom on desktop, lightbox on mobile",
  },
  {
    key: "social_proof_enabled",
    ar: "دليل اجتماعي حقيقي",
    en: "Real social proof",
    hintAr: '"تم شراؤه N مرات" في صفحة المنتج من الطلبات الفعلية',
    hintEn: '"Purchased N times" on product page from real orders',
  },
  {
    key: "motion_enabled",
    ar: "حركة الظهور عند التمرير",
    en: "Scroll-reveal motion",
    hintAr: "يحترم تفضيل تقليل الحركة تلقائياً",
    hintEn: "Honours reduced-motion automatically",
  },
  {
    key: "back_in_stock_enabled",
    ar: "نبّهني عند التوفر",
    en: "Back-in-stock alerts",
    hintAr: "نموذج بدل زر الشراء عند نفاد المخزون",
    hintEn: "Form instead of the buy button when sold out",
  },
];

const TOGGLE_SECTIONS: Array<{ ar: string; en: string; keys: BoolKey[] }> = [
  {
    ar: "بطاقة المنتج",
    en: "Product card",
    keys: [
      "product_card_hover_image",
      "product_card_color_dots",
      "product_card_quick_add",
      "quick_view_enabled",
    ],
  },
  {
    ar: "صفحة المنتج والأقسام",
    en: "Product page & categories",
    keys: [
      "social_proof_enabled",
      "pdp_image_zoom",
      "category_filters_enabled",
      "back_in_stock_enabled",
    ],
  },
  {
    ar: "المتجر كله",
    en: "Whole store",
    keys: ["motion_enabled"],
  },
];

/**
 * The new look's product card and product page: what a card shows, what the product page and a
 * category's page offer, and the scroll motion. The home page's sections are in the Home page
 * group and the footer's options in the Header & footer group; this group held them all.
 */
export function DesignV2Group() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const { form, setBs } = useBrandSettingsFormContext();
  const bs = form.bs;
  const isV2 = bs.storefront_design_version === 2;

  return (
    <div className="rounded-xl border border-border p-5 bg-card shadow-sm space-y-5">
      <div>
        <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          <span>{isAr ? "بطاقة المنتج وصفحته" : "Product card & page"}</span>
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {isV2
            ? isAr
              ? "ما تعرضه بطاقة المنتج، وما تقدّمه صفحة المنتج وصفحات الأقسام. كلها مفعّلة افتراضياً."
              : "What a product card shows, and what the product page and category pages offer. Everything is on by default."
            : isAr
              ? 'هذه الخيارات تعمل بعد تفعيل المظهر الجديد من بطاقة "ترقية المظهر" أعلاه.'
              : 'These options apply once the new look is enabled from the "Upgrade design" card above.'}
        </p>
      </div>

      {/* Toggles — dense rows grouped by surface (half the height of card-per-toggle) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
        {TOGGLE_SECTIONS.map((section) => (
          <div key={section.en} className="rounded-xl border border-border bg-background">
            <div className="px-3.5 pt-3 pb-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {isAr ? section.ar : section.en}
            </div>
            <ul className="divide-y divide-border">
              {section.keys.map((key) => {
                const item = TOGGLES.find((t) => t.key === key)!;
                return (
                  <li
                    key={item.key}
                    className="flex items-center justify-between gap-3 px-3.5 py-2.5"
                  >
                    <div className="min-w-0">
                      <Label
                        htmlFor={`v2-${item.key}`}
                        className="cursor-pointer text-xs font-semibold"
                      >
                        {isAr ? item.ar : item.en}
                      </Label>
                      <p className="text-xs text-muted-foreground truncate">
                        {isAr ? item.hintAr : item.hintEn}
                      </p>
                    </div>
                    <Switch
                      id={`v2-${item.key}`}
                      checked={bs[item.key] ?? true}
                      onCheckedChange={(checked) => setBs({ [item.key]: checked })}
                      aria-label={isAr ? item.ar : item.en}
                    />
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      {/* Selects & numbers */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2 border-t border-border">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">
            {isAr ? 'شارة "جديد" لمدة (أيام)' : '"New" badge for (days)'}
          </Label>
          <Input
            type="number"
            min={0}
            max={90}
            className="h-9 text-xs font-mono"
            value={bs.new_badge_days ?? 14}
            onChange={(e) => setBs({ new_badge_days: Math.max(0, Number(e.target.value) || 0) })}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">
            {isAr ? "تناسب صور معرض المنتج" : "PDP Gallery Aspect Ratio"}
          </Label>
          <Select
            value={bs.pdp_gallery_aspect_ratio || "3:4"}
            onValueChange={(val) => setBs({ pdp_gallery_aspect_ratio: val })}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="3:4">
                {isAr ? "طولي 3:4 (أزياء وعبايات)" : "Portrait 3:4 (Fashion)"}
              </SelectItem>
              <SelectItem value="1:1">
                {isAr ? "مربع 1:1 (إكسسوارات وعطور)" : "Square 1:1 (Accessories)"}
              </SelectItem>
              <SelectItem value="4:5">
                {isAr ? "طولي 4:5 (افتتاحي)" : "Portrait 4:5 (Editorial)"}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Fabric & care / specifications text (PDP accordion) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-border">
        <div>
          <Label className="text-xs font-medium">
            {isAr
              ? "المواصفات والعناية / القماش (عربي)"
              : "Specifications & care / Fabric (Arabic)"}
          </Label>
          <Textarea
            dir="rtl"
            rows={3}
            className="mt-1 text-xs"
            value={bs.fabric_care_ar ?? ""}
            onChange={(e) => setBs({ fabric_care_ar: e.target.value || null })}
          />
        </div>
        <div>
          <Label className="text-xs font-medium">
            {isAr
              ? "المواصفات والعناية / القماش (إنجليزي)"
              : "Specifications & care / Fabric (English)"}
          </Label>
          <Textarea
            dir="ltr"
            rows={3}
            className="mt-1 text-xs"
            value={bs.fabric_care_en ?? ""}
            onChange={(e) => setBs({ fabric_care_en: e.target.value || null })}
          />
        </div>
      </div>
    </div>
  );
}
