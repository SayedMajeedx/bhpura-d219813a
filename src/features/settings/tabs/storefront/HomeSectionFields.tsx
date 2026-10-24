import { useRef, useState } from "react";
import { toast } from "sonner";
import { ImagePlus, Loader2, Trash2, UploadCloud } from "lucide-react";
import { useBrandSettingsFormContext } from "@/features/settings/use-brand-settings-form";
import { TrustBadgesEditor } from "@/components/settings/TrustBadgesEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  STORY_POINTS_MAX,
  brandStoryDefaults,
  type StoryPoint,
} from "@/lib/brand-templates/brand-story";
import { uploadPublicMedia } from "@/lib/r2-upload";

/** Where the trust bar shows, and its badges (the footer's badges on the classic look). */
export function TrustBarFields({ isAr }: { isAr: boolean }) {
  const { form, setBs } = useBrandSettingsFormContext();
  const bs = form.bs;
  return (
    <>
      <div className="max-w-xs space-y-1.5">
        <Label htmlFor="trust-bar-position">{isAr ? "مكان الشريط" : "Where it shows"}</Label>
        <Select
          value={bs.trust_bar_position || "below_hero"}
          onValueChange={(value) => setBs({ trust_bar_position: value })}
        >
          <SelectTrigger id="trust-bar-position" className="h-9 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="below_hero">{isAr ? "تحت الواجهة" : "Below the hero"}</SelectItem>
            <SelectItem value="above_footer">
              {isAr ? "فوق التذييل" : "Above the footer"}
            </SelectItem>
            <SelectItem value="both">{isAr ? "الاثنان" : "Both"}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <TrustBadgesEditor
        value={bs.trust_badges as any}
        onChange={(value) => setBs({ trust_badges: value as any })}
        isAr={isAr}
        footerBg={bs.footer_bg}
        footerFg={bs.footer_fg}
        vertical={bs.store_vertical}
        settings={bs as any}
      />
    </>
  );
}

/**
 * The brand story: its picture and words. The words are the store's "about" text, which the
 * footer shows too; until the store writes them the section shows its kind of store's default
 * story, shown here as it will read so nothing appears that the merchant has not seen.
 */
export function BrandStoryFields({ isAr }: { isAr: boolean }) {
  const { form, setBs, setBrand, brandId } = useBrandSettingsFormContext();
  const bs = form.bs;
  const brand = form.brand;
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const defaults = brandStoryDefaults(bs.store_vertical);
  const ownWords = Boolean(brand.about_ar?.trim() || brand.about_en?.trim());

  const upload = async (file: File) => {
    try {
      setUploading(true);
      const url = await uploadPublicMedia(brandId, file, "hero");
      setBs({ brand_story_image_url: url });
      toast.success(isAr ? "تم رفع الصورة — لا تنسَ الحفظ" : "Image uploaded — remember to save");
    } catch (e: any) {
      toast.error(e?.message ?? (isAr ? "فشل رفع الصورة" : "Upload failed"));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="grid gap-4 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]">
      <div className="space-y-1.5">
        <Label>{isAr ? "الصورة (طولية 4:5)" : "Picture (portrait 4:5)"}</Label>
        <input
          ref={input}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = "";
          }}
        />
        {bs.brand_story_image_url ? (
          <div className="space-y-2">
            <img
              src={bs.brand_story_image_url}
              alt=""
              className="aspect-[4/5] w-full max-w-40 rounded-lg border border-border object-cover"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploading}
                onClick={() => input.current?.click()}
              >
                {uploading ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <UploadCloud className="size-3.5" />
                )}
                {isAr ? "استبدال" : "Replace"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:bg-destructive/10"
                onClick={() => setBs({ brand_story_image_url: null })}
              >
                <Trash2 className="size-3.5" />
                {isAr ? "إزالة" : "Remove"}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            disabled={uploading}
            onClick={() => input.current?.click()}
            className="flex aspect-[4/5] h-auto w-full max-w-40 flex-col items-center justify-center gap-1 whitespace-normal border-2 border-dashed"
          >
            {uploading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ImagePlus className="size-4 text-muted-foreground" />
            )}
            <span className="text-xs text-muted-foreground">
              {isAr ? "رفع صورة" : "Upload a picture"}
            </span>
          </Button>
        )}
      </div>

      <div className="min-w-0 space-y-3">
        <div className="min-w-0" dir="rtl">
          <Label htmlFor="brand-story-ar">{isAr ? "القصة — عربي" : "Story — Arabic"}</Label>
          <Textarea
            id="brand-story-ar"
            rows={3}
            className="mt-1.5 text-xs"
            value={brand.about_ar ?? ""}
            placeholder={defaults.description.ar}
            onChange={(e) => setBrand({ about_ar: e.target.value || null })}
          />
        </div>
        <div className="min-w-0" dir="ltr">
          <Label htmlFor="brand-story-en">{isAr ? "القصة — إنجليزي" : "Story — English"}</Label>
          <Textarea
            id="brand-story-en"
            rows={3}
            className="mt-1.5 text-xs"
            value={brand.about_en ?? ""}
            placeholder={defaults.description.en}
            onChange={(e) => setBrand({ about_en: e.target.value || null })}
          />
        </div>
        <StoryPointsFields isAr={isAr} suggestions={defaults.values} />
        <p className="text-xs text-muted-foreground">
          {ownWords
            ? isAr
              ? "تظهر قصتك هنا وفي أسفل الموقع."
              : "Your story shows here and in the footer."
            : isAr
              ? "لم تكتب قصتك بعد: يظهر النص الرمادي أعلاه، وهو قصة افتراضية لنوع متجرك."
              : "You have not written your story yet: the grey text above shows, a default story for your kind of store."}
        </p>
      </div>
    </div>
  );
}

/**
 * The story's points (up to three, a short line each): shown under the story only once written.
 * The grey text is the kind of store's suggestion, never shown to a shopper by itself. Kept in
 * `homepage_editorial_sections.story_points`, beside the home page's other sections.
 */
function StoryPointsFields({
  isAr,
  suggestions,
}: {
  isAr: boolean;
  suggestions: readonly StoryPoint[];
}) {
  const { form, setBs } = useBrandSettingsFormContext();
  const sections =
    form.bs.homepage_editorial_sections && typeof form.bs.homepage_editorial_sections === "object"
      ? (form.bs.homepage_editorial_sections as Record<string, unknown>)
      : {};
  const stored = Array.isArray(sections.story_points)
    ? (sections.story_points as Partial<StoryPoint>[])
    : [];
  const points = Array.from({ length: STORY_POINTS_MAX }, (_, i) => ({
    ar: stored[i]?.ar ?? "",
    en: stored[i]?.en ?? "",
  }));
  const write = (index: number, lang: "ar" | "en", value: string) => {
    const next = points.map((point, i) => (i === index ? { ...point, [lang]: value } : point));
    setBs({ homepage_editorial_sections: { ...sections, story_points: next } as any });
  };
  return (
    <fieldset className="min-w-0 space-y-2">
      <legend className="text-sm font-medium">
        {isAr ? "نقاط تحت القصة (اختياري)" : "Points under the story (optional)"}
      </legend>
      <p className="text-xs text-muted-foreground">
        {isAr
          ? "ما تعد به زبائنك في سطر قصير. لا يظهر إلا ما تكتبه، والرمادي اقتراح فقط."
          : "What you promise your customers, a short line each. Only what you write shows; the grey text is a suggestion."}
      </p>
      {points.map((point, index) => (
        <div key={index} className="grid gap-2 sm:grid-cols-2">
          <Input
            dir="rtl"
            maxLength={80}
            aria-label={isAr ? `النقطة ${index + 1} — عربي` : `Point ${index + 1} — Arabic`}
            className="h-9 text-xs"
            value={point.ar}
            placeholder={suggestions[index]?.ar}
            onChange={(e) => write(index, "ar", e.target.value)}
          />
          <Input
            dir="ltr"
            maxLength={80}
            aria-label={isAr ? `النقطة ${index + 1} — إنجليزي` : `Point ${index + 1} — English`}
            className="h-9 text-xs"
            value={point.en}
            placeholder={suggestions[index]?.en}
            onChange={(e) => write(index, "en", e.target.value)}
          />
        </div>
      ))}
    </fieldset>
  );
}

/** The banner at the top of a category's page. */
export function CategoryBannerField({ isAr }: { isAr: boolean }) {
  const { form, setBs, brandId } = useBrandSettingsFormContext();
  const bs = form.bs;
  const [uploading, setUploading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const upload = async (file: File) => {
    try {
      setUploading(true);
      const url = await uploadPublicMedia(brandId, file, "page");
      setBs({ category_banner_background_url: url });
      toast.success(isAr ? "تم رفع صورة البنر" : "Banner image uploaded");
    } catch (e: any) {
      toast.error(e?.message || (isAr ? "فشل رفع البنر" : "Failed to upload banner"));
    } finally {
      setUploading(false);
    }
  };
  return (
    <div className="space-y-1.5">
      <Label>{isAr ? "لافتة أعلى صفحة القسم (عريضة 21:9)" : "Banner at the top (wide 21:9)"}</Label>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
          e.target.value = "";
        }}
      />
      <div className="flex flex-wrap items-center gap-3">
        {bs.category_banner_background_url && (
          <img
            src={bs.category_banner_background_url}
            alt=""
            className="aspect-[21/9] h-16 rounded-md border border-border object-cover"
          />
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => input.current?.click()}
        >
          {uploading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <UploadCloud className="size-3.5" />
          )}
          {bs.category_banner_background_url
            ? isAr
              ? "استبدال"
              : "Replace"
            : isAr
              ? "رفع صورة"
              : "Upload"}
        </Button>
        {bs.category_banner_background_url && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive hover:bg-destructive/10"
            onClick={() => setBs({ category_banner_background_url: null })}
          >
            <Trash2 className="size-3.5" />
            {isAr ? "إزالة" : "Remove"}
          </Button>
        )}
      </div>
    </div>
  );
}

/** A section's own title over its products; empty uses the default shown in grey. */
export function SectionTitleFields({
  isAr,
  idPrefix,
  valueAr,
  valueEn,
  defaultAr,
  defaultEn,
  onChange,
}: {
  isAr: boolean;
  idPrefix: string;
  valueAr: string | null | undefined;
  valueEn: string | null | undefined;
  defaultAr: string;
  defaultEn: string;
  onChange: (patch: { ar?: string | null; en?: string | null }) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="min-w-0" dir="rtl">
        <Label htmlFor={`${idPrefix}-ar`}>{isAr ? "العنوان — عربي" : "Title — Arabic"}</Label>
        <Input
          id={`${idPrefix}-ar`}
          className="mt-1.5 h-9 text-xs"
          value={valueAr ?? ""}
          placeholder={defaultAr}
          onChange={(e) => onChange({ ar: e.target.value || null })}
        />
      </div>
      <div className="min-w-0" dir="ltr">
        <Label htmlFor={`${idPrefix}-en`}>{isAr ? "العنوان — إنجليزي" : "Title — English"}</Label>
        <Input
          id={`${idPrefix}-en`}
          className="mt-1.5 h-9 text-xs"
          value={valueEn ?? ""}
          placeholder={defaultEn}
          onChange={(e) => onChange({ en: e.target.value || null })}
        />
      </div>
    </div>
  );
}
