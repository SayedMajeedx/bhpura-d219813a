import { useI18n } from "@/lib/i18n";
import { useBrandSettingsFormContext } from "@/features/settings/use-brand-settings-form";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { META_DESCRIPTION_LIMIT, META_TITLE_LIMIT, sanitizeMetaText } from "@/lib/seo";
import { Globe, Search } from "lucide-react";

export function SeoGroup() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const { form, setBrand } = useBrandSettingsFormContext();
  const brand = form.brand;

  const metaTitle = brand.meta_title ?? "";
  const metaDescription = brand.meta_description ?? "";

  const brandDisplayName =
    (isAr ? brand.name_ar : brand.name_en) || brand.name_en || brand.slug || "Boutique";
  const previewTitle = metaTitle || `${brandDisplayName} | ${isAr ? "المتجر الإلكتروني الرسمي" : "Official Boutique"}`;
  const previewDesc =
    metaDescription ||
    (isAr
      ? "تسوق أرقى التشكيلات والتصاميم الحصرية أونلاين مع خدمة التوصيل السريع والدفع الآمن."
      : "Shop our exclusive collections and unique designs online with fast delivery and secure checkout.");

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border p-5 bg-card shadow-sm space-y-5">
        <div>
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Search className="size-4 text-primary" />
            <span>{isAr ? "تهيئة محركات البحث ومواقع التواصل (SEO)" : "Search Engine Optimization (SEO)"}</span>
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {isAr
              ? "تحكم في عنوان ووصف المتجر الذي يظهر في نتائج بحث Google وبطاقات المشاركة في واتساب وإنستغرام."
              : "Control the title and snippet displayed on Google search results and social share cards."}
          </p>
        </div>

        {/* Live SERP Snippet Preview */}
        <div className="rounded-xl border border-border bg-muted/10 p-4 space-y-2">
          <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <Globe className="size-3.5 text-primary" />
            <span>{isAr ? "معاينة بطاقة نتيجة البحث في Google:" : "Google Search Result Preview:"}</span>
          </span>
          <div className="rounded-lg border border-border bg-background p-3.5 shadow-xs space-y-1">
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="font-mono">boutq.app › {brand.slug}</span>
            </div>
            <h4 className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer truncate">
              {previewTitle}
            </h4>
            <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
              {previewDesc}
            </p>
          </div>
        </div>

        {/* Meta Title Input */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center text-xs">
            <Label className="font-medium">
              {isAr ? "عنوان الصفحة الرئيسية (Meta Title)" : "Homepage Meta Title"}
            </Label>
            <span
              className={`font-mono text-[11px] ${
                metaTitle.length > META_TITLE_LIMIT ? "text-destructive font-semibold" : "text-muted-foreground"
              }`}
            >
              {metaTitle.length}/{META_TITLE_LIMIT}
            </span>
          </div>
          <Input
            value={metaTitle}
            maxLength={META_TITLE_LIMIT}
            onChange={(e) =>
              setBrand({
                meta_title: sanitizeMetaText(e.target.value, META_TITLE_LIMIT) || null,
              })
            }
            placeholder={
              isAr ? "اسم المتجر ووصفه المختصر والمميز" : "Store name and concise value proposition"
            }
            className="text-xs h-9"
          />
        </div>

        {/* Meta Description Input */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center text-xs">
            <Label className="font-medium">
              {isAr ? "وصف الصفحة الرئيسية (Meta Description)" : "Homepage Meta Description"}
            </Label>
            <span
              className={`font-mono text-[11px] ${
                metaDescription.length > META_DESCRIPTION_LIMIT
                  ? "text-destructive font-semibold"
                  : "text-muted-foreground"
              }`}
            >
              {metaDescription.length}/{META_DESCRIPTION_LIMIT}
            </span>
          </div>
          <Textarea
            value={metaDescription}
            maxLength={META_DESCRIPTION_LIMIT}
            rows={3}
            onChange={(e) =>
              setBrand({
                meta_description: sanitizeMetaText(e.target.value, META_DESCRIPTION_LIMIT) || null,
              })
            }
            placeholder={
              isAr
                ? "وصف جذاب ومختصر للمتجر ومنتجاته يظهر في نتائج البحث..."
                : "A concise and compelling storefront description..."
            }
            className="text-xs min-h-[72px]"
          />
        </div>
      </div>
    </div>
  );
}
