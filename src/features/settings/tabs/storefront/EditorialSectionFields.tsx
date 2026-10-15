import { useRef, useState } from "react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { uploadPublicMedia } from "@/lib/r2-upload";
import type { EditorialSectionConfig, HomepageEditorialSections } from "@/lib/storefront-context";
import { useBrandSettingsFormContext } from "@/features/settings/use-brand-settings-form";
import { ColorField } from "@/features/settings/shared/ColorField";
import { Button } from "@/components/ui/button";
import { ImagePlus, Loader2, Trash2, UploadCloud } from "lucide-react";

type EditorialKey = keyof HomepageEditorialSections;

const EMPTY_SECTION: EditorialSectionConfig = {
  enabled: true,
  banner_image_url: "",
  background_color: "",
  background_image_url: "",
};

function normalize(raw: unknown): HomepageEditorialSections {
  const source = raw && typeof raw === "object" ? (raw as Partial<HomepageEditorialSections>) : {};
  return {
    best: { ...EMPTY_SECTION, ...(source.best ?? {}) },
    sale: { ...EMPTY_SECTION, ...(source.sale ?? {}) },
    trending: { ...EMPTY_SECTION, ...(source.trending ?? {}) },
  };
}

/**
 * The home page's editorial rails (best / sale / trending): whether each shows, its full-width
 * banner, and a picture or colour behind its products. Writes `homepage_editorial_sections`, and
 * keeps the two older columns it replaced in step (`show_best_sellers`,
 * `trending_banner_background_url`), so each is written from here only.
 */
export function useEditorialSections() {
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

  return { sections, patchSection, upload, uploading };
}

/** One rail's banner, the picture behind its products and its background colour. */
export function EditorialSectionFields({
  kind,
  editorial,
  isAr,
}: {
  kind: EditorialKey;
  editorial: ReturnType<typeof useEditorialSections>;
  isAr: boolean;
}) {
  const section = editorial.sections[kind];
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <SectionBannerPicker
        title={isAr ? "لافتة عريضة فوق القسم" : "Wide banner above the section"}
        imageUrl={section.banner_image_url}
        isUploading={editorial.uploading === `${kind}:banner_image_url`}
        onUpload={(file) => editorial.upload(kind, "banner_image_url", file)}
        onRemove={() => editorial.patchSection(kind, { banner_image_url: "" })}
        isAr={isAr}
      />
      <div className="space-y-3">
        <SectionBannerPicker
          title={isAr ? "صورة الخلفية خلف المنتجات" : "Background image behind products"}
          imageUrl={section.background_image_url}
          isUploading={editorial.uploading === `${kind}:background_image_url`}
          onUpload={(file) => editorial.upload(kind, "background_image_url", file)}
          onRemove={() => editorial.patchSection(kind, { background_image_url: "" })}
          isAr={isAr}
          compact
        />
        <ColorField
          label={isAr ? "لون خلفية القسم" : "Section background colour"}
          value={section.background_color || null}
          onChange={(val) => editorial.patchSection(kind, { background_color: val ?? "" })}
        />
      </div>
    </div>
  );
}

/** A wide picture: upload, replace or remove. */
export function SectionBannerPicker({
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
