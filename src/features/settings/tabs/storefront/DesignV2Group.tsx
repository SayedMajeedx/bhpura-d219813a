import { useRef, useState } from "react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { uploadPublicMedia } from "@/lib/r2-upload";
import { useBrandSettingsFormContext } from "@/features/settings/use-brand-settings-form";
import { ColorField } from "@/features/settings/shared/ColorField";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ImagePlus, Loader2, Sparkles, Trash2 } from "lucide-react";

type BoolKey =
  | "trust_bar_enabled"
  | "product_card_hover_image"
  | "product_card_color_dots"
  | "product_card_quick_add"
  | "quick_view_enabled"
  | "category_filters_enabled"
  | "pdp_image_zoom"
  | "social_proof_enabled"
  | "recently_viewed_enabled"
  | "motion_enabled"
  | "back_in_stock_enabled"
  | "brand_story_enabled"
  | "newsletter_enabled"
  | "footer_show_payment_methods";

const TOGGLES: Array<{ key: BoolKey; ar: string; en: string; hintAr: string; hintEn: string }> = [
  {
    key: "trust_bar_enabled",
    ar: "شريط الثقة",
    en: "Trust bar",
    hintAr: "توصيل، استبدال، دفع آمن تحت الهيرو",
    hintEn: "Delivery, returns, secure payment below the hero",
  },
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
    key: "recently_viewed_enabled",
    ar: "شوهد مؤخراً",
    en: "Recently viewed",
    hintAr: "آخر المنتجات التي تصفحها العميل",
    hintEn: "Products the customer viewed recently",
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
  {
    key: "brand_story_enabled",
    ar: "قسم قصتنا",
    en: "Brand story section",
    hintAr: "النبذة مع صورة تحريرية في الرئيسية",
    hintEn: "About text with an editorial image on the homepage",
  },
  {
    key: "newsletter_enabled",
    ar: "اشتراك النشرة في التذييل",
    en: "Footer newsletter signup",
    hintAr: "واتساب أو بريد — يغذّي حملات الواتساب",
    hintEn: "WhatsApp or email — feeds WhatsApp campaigns",
  },
  {
    key: "footer_show_payment_methods",
    ar: "أيقونات طرق الدفع في التذييل",
    en: "Payment icons in footer",
    hintAr: "بنفت، فيزا، ماستركارد، الدفع عند الاستلام",
    hintEn: "Benefit, Visa, Mastercard, COD",
  },
];

const TOGGLE_SECTIONS: Array<{ ar: string; en: string; keys: BoolKey[] }> = [
  {
    ar: "الصفحة الرئيسية",
    en: "Homepage",
    keys: [
      "trust_bar_enabled",
      "brand_story_enabled",
      "recently_viewed_enabled",
      "motion_enabled",
    ],
  },
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
    ar: "التذييل",
    en: "Footer",
    keys: ["newsletter_enabled", "footer_show_payment_methods"],
  },
];

/**
 * Storefront 2.0 options. Every column added by the storefront_v2 migration is
 * editable here so merchants can tune or disable each new behaviour.
 */
export function DesignV2Group() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const { form, setBs, brandId } = useBrandSettingsFormContext();
  const bs = form.bs;
  const storyInput = useRef<HTMLInputElement>(null);
  const [uploadingStory, setUploadingStory] = useState(false);
  const isV2 = bs.storefront_design_version === 2;

  const uploadStoryImage = async (file: File) => {
    try {
      setUploadingStory(true);
      const url = await uploadPublicMedia(brandId, file, "hero");
      setBs({ brand_story_image_url: url });
      toast.success(isAr ? "تم رفع الصورة — لا تنسَ الحفظ" : "Image uploaded — remember to save");
    } catch (e: any) {
      toast.error(e?.message ?? (isAr ? "فشل رفع الصورة" : "Upload failed"));
    } finally {
      setUploadingStory(false);
    }
  };

  return (
    <div className="rounded-xl border border-border p-5 bg-card shadow-sm space-y-5">
      <div>
        <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          <span>
            {isAr ? "خيارات المظهر الجديد (Storefront 2.0)" : "New look options (Storefront 2.0)"}
          </span>
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {isV2
            ? isAr
              ? "تحكّم في كل ميزة من ميزات المظهر الجديد. كل الخيارات مفعّلة افتراضياً."
              : "Tune every feature of the new look. Everything is on by default."
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
            {isAr ? "موضع شريط الثقة" : "Trust bar position"}
          </Label>
          <Select
            value={bs.trust_bar_position || "below_hero"}
            onValueChange={(val) => setBs({ trust_bar_position: val })}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="below_hero">{isAr ? "تحت الهيرو" : "Below hero"}</SelectItem>
              <SelectItem value="above_footer">{isAr ? "فوق التذييل" : "Above footer"}</SelectItem>
              <SelectItem value="both">{isAr ? "الاثنان" : "Both"}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">{isAr ? "تخطيط التذييل" : "Footer layout"}</Label>
          <Select
            value={bs.footer_layout || "minimal"}
            onValueChange={(val) => setBs({ footer_layout: val })}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="minimal">
                {isAr ? "بسيط (الحالي)" : "Minimal (current)"}
              </SelectItem>
              <SelectItem value="columns">
                {isAr ? "أعمدة (بريميوم)" : "Columns (premium)"}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">
            {isAr ? "تخطيط صفحة المنتج" : "Product page layout"}
          </Label>
          <Select
            value={bs.pdp_layout || "accordion"}
            onValueChange={(val) => setBs({ pdp_layout: val })}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="accordion">{isAr ? "أكورديون" : "Accordion"}</SelectItem>
              <SelectItem value="flat">{isAr ? "مسطّح (الحالي)" : "Flat (current)"}</SelectItem>
            </SelectContent>
          </Select>
        </div>
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
      </div>

      {/* Hero overlay + title colour */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-border">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">
            {isAr ? "قوة التعتيم فوق الهيرو (%)" : "Hero overlay strength (%)"}
          </Label>
          <Input
            type="range"
            min={0}
            max={80}
            step={5}
            value={bs.hero_overlay_strength ?? 45}
            onChange={(e) => setBs({ hero_overlay_strength: Number(e.target.value) })}
            aria-valuetext={`${bs.hero_overlay_strength ?? 45}%`}
          />
          <p className="text-xs text-muted-foreground">{bs.hero_overlay_strength ?? 45}%</p>
        </div>
        <ColorField
          label={
            isAr
              ? "لون عنوان الهيرو (فارغ = تلقائي مقروء)"
              : "Hero title colour (empty = auto readable)"
          }
          value={bs.hero_title_color_v2 || null}
          onChange={(val) => setBs({ hero_title_color_v2: val })}
        />
      </div>

      {/* Newsletter titles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-border">
        <div>
          <Label className="text-xs font-medium">
            {isAr ? "عنوان الاشتراك (عربي)" : "Newsletter title (Arabic)"}
          </Label>
          <Input
            dir="rtl"
            className="mt-1 h-9 text-xs"
            placeholder="اشترك لتصلك أحدث المنتجات والعروض"
            value={bs.newsletter_title_ar ?? ""}
            onChange={(e) => setBs({ newsletter_title_ar: e.target.value || null })}
          />
        </div>
        <div>
          <Label className="text-xs font-medium">
            {isAr ? "عنوان الاشتراك (إنجليزي)" : "Newsletter title (English)"}
          </Label>
          <Input
            dir="ltr"
            className="mt-1 h-9 text-xs"
            placeholder="Be the first to see new arrivals"
            value={bs.newsletter_title_en ?? ""}
            onChange={(e) => setBs({ newsletter_title_en: e.target.value || null })}
          />
        </div>
      </div>

      {/* Brand story image */}
      <div className="space-y-2 pt-2 border-t border-border">
        <Label className="text-xs font-medium">
          {isAr ? "صورة قسم قصتنا" : "Brand story image"}
        </Label>
        <input
          ref={storyInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void uploadStoryImage(file);
            e.target.value = "";
          }}
        />
        {bs.brand_story_image_url ? (
          <div className="flex items-center gap-3">
            <img
              src={bs.brand_story_image_url}
              alt=""
              className="h-16 w-24 rounded-md object-cover border border-border"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              disabled={uploadingStory}
              onClick={() => storyInput.current?.click()}
            >
              {uploadingStory ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : isAr ? (
                "استبدال"
              ) : (
                "Replace"
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-destructive"
              onClick={() => setBs({ brand_story_image_url: null })}
            >
              <Trash2 className="size-3.5 me-1" />
              {isAr ? "إزالة" : "Remove"}
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="h-16 w-full border-dashed border-2 text-xs gap-2"
            disabled={uploadingStory}
            onClick={() => storyInput.current?.click()}
          >
            {uploadingStory ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ImagePlus className="size-4 text-muted-foreground" />
            )}
            {isAr
              ? "رفع صورة (تُستخدم صورة الهيرو إن تُركت فارغة)"
              : "Upload image (hero poster is used if empty)"}
          </Button>
        )}
      </div>

      {/* Fabric & care / specifications text (PDP accordion) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-border">
        <div>
          <Label className="text-xs font-medium">
            {isAr ? "المواصفات والعناية / القماش (عربي)" : "Specifications & care / Fabric (Arabic)"}
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
            {isAr ? "المواصفات والعناية / القماش (إنجليزي)" : "Specifications & care / Fabric (English)"}
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
