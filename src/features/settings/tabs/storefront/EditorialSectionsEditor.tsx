import { useRef, useState } from "react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { uploadPublicMedia } from "@/lib/r2-upload";
import type { EditorialSectionConfig, HomepageEditorialSections } from "@/lib/storefront-context";
import { useBrandSettingsFormContext } from "@/features/settings/use-brand-settings-form";
import { ColorField } from "@/features/settings/shared/ColorField";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { ImagePlus, Loader2, Trash2, UploadCloud } from "lucide-react";

type EditorialKey = keyof HomepageEditorialSections;

const EMPTY_SECTION: EditorialSectionConfig = {
  enabled: true,
  banner_image_url: "",
  background_color: "",
  background_image_url: "",
};

const SECTION_META: Array<{
  key: EditorialKey;
  ar: string;
  en: string;
  hintAr: string;
  hintEn: string;
}> = [
  {
    key: "best",
    ar: "الأكثر مبيعاً",
    en: "Best Sellers",
    hintAr: "لافتة عريضة تظهر فوق منتجات الأكثر مبيعاً",
    hintEn: "Full-width banner above the best sellers rail",
  },
  {
    key: "sale",
    ar: "التنزيلات والعروض",
    en: "Sale & Offers",
    hintAr: "يظهر فقط عند وجود منتجات مخفّضة",
    hintEn: "Shown only when discounted products exist",
  },
  {
    key: "trending",
    ar: "الرائج الآن",
    en: "Trending Now",
    hintAr: "المنتجات الأعلى تفاعلاً هذا الأسبوع",
    hintEn: "Most viewed products this week",
  },
];

function normalize(raw: unknown): HomepageEditorialSections {
  const source = raw && typeof raw === "object" ? (raw as Partial<HomepageEditorialSections>) : {};
  return {
    best: { ...EMPTY_SECTION, ...(source.best ?? {}) },
    sale: { ...EMPTY_SECTION, ...(source.sale ?? {}) },
    trending: { ...EMPTY_SECTION, ...(source.trending ?? {}) },
  };
}

/**
 * Per-section editor for the homepage editorial rails (best / sale / trending):
 * visibility, full-width banner image, background image and background colour.
 * Writes `homepage_editorial_sections` and keeps `trending_banner_background_url`
 * in sync for the legacy storefront reader.
 */
export function EditorialSectionsEditor() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const { form, setBs, brandId } = useBrandSettingsFormContext();
  const sections = normalize(form.bs.homepage_editorial_sections);
  const [uploading, setUploading] = useState<string | null>(null);

  const patchSection = (key: EditorialKey, patch: Partial<EditorialSectionConfig>) => {
    const next: HomepageEditorialSections = {
      ...sections,
      [key]: { ...sections[key], ...patch },
    };
    setBs({
      homepage_editorial_sections: next as any,
      ...(key === "best" && patch.enabled !== undefined
        ? { show_best_sellers: patch.enabled }
        : {}),
      ...(key === "trending" && patch.banner_image_url !== undefined
        ? { trending_banner_background_url: patch.banner_image_url || null }
        : {}),
    });
  };

  const upload = async (
    key: EditorialKey,
    field: "banner_image_url" | "background_image_url",
    file: File,
  ) => {
    const token = `${key}:${field}`;
    try {
      setUploading(token);
      const url = await uploadPublicMedia(brandId, file, "hero");
      patchSection(key, { [field]: url });
      toast.success(isAr ? "تم رفع الصورة — لا تنسَ الحفظ" : "Image uploaded — remember to save");
    } catch (e: any) {
      toast.error(e?.message ?? (isAr ? "فشل رفع الصورة" : "Upload failed"));
    } finally {
      setUploading(null);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs font-semibold">
          {isAr ? "لافتات الأقسام الرئيسية" : "Homepage section banners"}
        </Label>
        <p className="text-xs text-muted-foreground mt-0.5">
          {isAr
            ? "لكل قسم: إظهار/إخفاء، صورة لافتة عريضة، صورة وخلفية ملونة خلف المنتجات."
            : "Per section: visibility, a full-width banner image, and an optional background image/colour behind the products."}
        </p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {SECTION_META.map((meta) => {
          const section = sections[meta.key];
          return (
            <div
              key={meta.key}
              className="space-y-3 rounded-xl border border-border p-3.5 bg-background"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label className="cursor-pointer text-xs font-semibold">
                    {isAr ? meta.ar : meta.en}
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {isAr ? meta.hintAr : meta.hintEn}
                  </p>
                </div>
                <Switch
                  checked={section.enabled}
                  onCheckedChange={(checked) => patchSection(meta.key, { enabled: checked })}
                />
              </div>
              <SectionBannerPicker
                title={isAr ? "صورة اللافتة" : "Banner image"}
                imageUrl={section.banner_image_url}
                isUploading={uploading === `${meta.key}:banner_image_url`}
                onUpload={(file) => upload(meta.key, "banner_image_url", file)}
                onRemove={() => patchSection(meta.key, { banner_image_url: "" })}
                isAr={isAr}
              />
              <SectionBannerPicker
                title={isAr ? "صورة الخلفية خلف المنتجات" : "Background image behind products"}
                imageUrl={section.background_image_url}
                isUploading={uploading === `${meta.key}:background_image_url`}
                onUpload={(file) => upload(meta.key, "background_image_url", file)}
                onRemove={() => patchSection(meta.key, { background_image_url: "" })}
                isAr={isAr}
                compact
              />
              <ColorField
                label={isAr ? "لون خلفية القسم" : "Section background colour"}
                value={section.background_color || null}
                onChange={(val) => patchSection(meta.key, { background_color: val ?? "" })}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SectionBannerPicker({
  title,
  imageUrl,
  isUploading,
  onUpload,
  onRemove,
  isAr,
  compact = false,
}: {
  title: string;
  imageUrl?: string | null;
  isUploading: boolean;
  onUpload: (file: File) => void;
  onRemove: () => void;
  isAr: boolean;
  compact?: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{title}</span>
        {imageUrl && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRemove}
            className="h-6 px-1.5 text-xs text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="size-3 me-1" />
            {isAr ? "إزالة" : "Remove"}
          </Button>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
          e.target.value = "";
        }}
      />
      {imageUrl ? (
        <div
          className={`group relative w-full overflow-hidden rounded-md border border-border bg-muted ${compact ? "aspect-[4/1]" : "aspect-[21/9]"}`}
        >
          <img src={imageUrl} alt="" className="size-full object-cover" />
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
              className="text-xs shadow-md"
            >
              {isUploading ? (
                <Loader2 className="size-3.5 me-1.5 animate-spin" />
              ) : (
                <UploadCloud className="size-3.5 me-1.5" />
              )}
              {isAr ? "استبدال" : "Replace"}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          disabled={isUploading}
          onClick={() => fileInputRef.current?.click()}
          className={`w-full border-dashed border-2 flex flex-col items-center justify-center gap-1 hover:bg-muted/40 ${compact ? "h-12" : "h-20"}`}
        >
          {isUploading ? (
            <Loader2 className="size-4 animate-spin text-primary" />
          ) : (
            <>
              <ImagePlus className="size-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                {isAr ? "اضغط لرفع صورة (عريضة 21:9)" : "Click to upload (wide 21:9)"}
              </span>
            </>
          )}
        </Button>
      )}
    </div>
  );
}
