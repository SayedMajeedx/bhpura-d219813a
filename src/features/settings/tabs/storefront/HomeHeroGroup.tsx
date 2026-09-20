import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useBrandSettingsFormContext } from "@/features/settings/use-brand-settings-form";
import { AdvancedOnly } from "@/features/settings/FieldVisibility";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ColorField } from "@/features/settings/shared/ColorField";
import { HeroSlidesEditor, type HeroSlide } from "./HeroSlidesEditor";
import { ImageCropperDialog } from "@/components/image-cropper-dialog";
import { uploadPublicMedia } from "@/lib/r2-upload";
import { toast } from "sonner";
import { ImagePlus, Loader2, Sparkles, Trash2, Video } from "lucide-react";

interface MediaItem {
  type: "image" | "video";
  url: string;
}

export function HomeHeroGroup() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const { form, setBrand, setBs, brandId } = useBrandSettingsFormContext();
  const brand = form.brand;
  const bs = form.bs;

  const [uploadingBg, setUploadingBg] = useState(false);
  const [backgroundCropSrc, setBackgroundCropSrc] = useState<string | null>(null);

  // Parse hero_media
  const heroMedia = (
    brand.hero_media && typeof brand.hero_media === "object" && !Array.isArray(brand.hero_media)
      ? brand.hero_media
      : {}
  ) as { background?: MediaItem | null; slides?: HeroSlide[] };

  const backgroundMedia = heroMedia.background ?? null;
  const slides = Array.isArray(heroMedia.slides) ? heroMedia.slides : [];

  const updateBackground = (bg: MediaItem | null) => {
    setBrand({
      hero_media: {
        ...heroMedia,
        background: bg,
        slides,
      } as any,
    });
  };

  const updateSlides = (newSlides: HeroSlide[]) => {
    setBrand({
      hero_media: {
        ...heroMedia,
        background: backgroundMedia,
        slides: newSlides,
      } as any,
    });
  };

  const handleUploadBgFile = async (file: File) => {
    const isVid = file.type.startsWith("video") || /\.(mp4|webm|mov|m4v|mkv)$/i.test(file.name);
    if (isVid) {
      try {
        setUploadingBg(true);
        const url = await uploadPublicMedia(brandId, file, "hero");
        updateBackground({ type: "video", url });
        toast.success(isAr ? "تم رفع فيديو الخلفية" : "Background video uploaded");
      } catch (err: any) {
        toast.error(err.message || (isAr ? "فشل رفع الفيديو" : "Failed to upload video"));
      } finally {
        setUploadingBg(false);
      }
    } else {
      const reader = new FileReader();
      reader.onload = () => {
        setBackgroundCropSrc(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const confirmBgCrop = async (blob: Blob) => {
    try {
      setUploadingBg(true);
      const url = await uploadPublicMedia(brandId, blob, "hero");
      updateBackground({ type: "image", url });
      setBackgroundCropSrc(null);
      toast.success(isAr ? "تم حفظ وتطبيق صورة الخلفية" : "Background image saved");
    } catch (err: any) {
      toast.error(err.message || (isAr ? "فشل حفظ الصورة" : "Failed to save image"));
    } finally {
      setUploadingBg(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Hero Title & About Visibility */}
      <div className="rounded-xl border border-border p-5 bg-card shadow-sm space-y-5">
        <div>
          <h3 className="text-base font-semibold text-foreground">
            {isAr ? "عنوان الواجهة والنبذة الترحيبية" : "Hero Title & Story"}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {isAr
              ? "تحكم في النصوص والنبذة الترويجية التي تظهر في الواجهة الأولى للزوار."
              : "Manage the hero headline and brand story displayed to first-time visitors."}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-3.5 bg-background">
            <div>
              <Label className="cursor-pointer text-xs font-semibold">
                {isAr ? "إظهار اسم العلامة في الواجهة" : "Show brand name in hero"}
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isAr ? "عرض عنوان الواجهة في الهيرو" : "Display hero title"}
              </p>
            </div>
            <Switch
              checked={bs.show_hero_title ?? true}
              onCheckedChange={(checked) => setBs({ show_hero_title: checked })}
            />
          </div>

          <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-3.5 bg-background">
            <div>
              <Label className="cursor-pointer text-xs font-semibold">
                {isAr ? "إظهار النبذة في الواجهة" : "Show about text in hero"}
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isAr ? "عرض نبذة البراند أسفل العنوان" : "Display brand story under headline"}
              </p>
            </div>
            <Switch
              checked={bs.show_hero_about ?? true}
              onCheckedChange={(checked) => setBs({ show_hero_about: checked })}
            />
          </div>
        </div>

        {/* Hero Title Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <div dir="rtl">
            <Label className="text-xs font-medium">
              {isAr ? "عنوان الواجهة (عربي)" : "Hero Title (Arabic)"}
            </Label>
            <Input
              className="mt-1.5 text-end text-xs h-9"
              value={bs.hero_title_ar ?? ""}
              placeholder={
                isAr ? "اترك فارغاً لاستخدام اسم المتجر بالعربية" : "Blank uses brand name"
              }
              onChange={(e) => setBs({ hero_title_ar: e.target.value || null })}
            />
          </div>

          <div dir="ltr">
            <Label className="text-xs font-medium">
              {isAr ? "عنوان الواجهة (إنجليزي)" : "Hero Title (English)"}
            </Label>
            <Input
              className="mt-1.5 text-start text-xs h-9"
              value={bs.hero_title_en ?? ""}
              placeholder={
                isAr ? "اترك فارغاً لاستخدام اسم المتجر بالإنجليزية" : "Blank uses brand name"
              }
              onChange={(e) => setBs({ hero_title_en: e.target.value || null })}
            />
          </div>
        </div>

        {/* About Story Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div dir="rtl">
            <Label className="text-xs font-medium">
              {isAr ? "نبذة عن المتجر بالواجهة (عربي)" : "About Story (Arabic)"}
            </Label>
            <Textarea
              className="mt-1.5 text-end text-xs min-h-[72px]"
              value={brand.about_ar ?? ""}
              placeholder={isAr ? "قصة علامتك التجارية ونبذة ترحيبية بالعملاء..." : "Story..."}
              onChange={(e) => setBrand({ about_ar: e.target.value || null })}
            />
          </div>

          <div dir="ltr">
            <Label className="text-xs font-medium">
              {isAr ? "نبذة عن المتجر بالواجهة (إنجليزي)" : "About Story (English)"}
            </Label>
            <Textarea
              className="mt-1.5 text-start text-xs min-h-[72px]"
              value={brand.about_en ?? ""}
              placeholder="Your boutique story and welcoming introduction..."
              onChange={(e) => setBrand({ about_en: e.target.value || null })}
            />
          </div>
        </div>

        {/* Advanced Title Tuning */}
        <AdvancedOnly
          fieldKey="hero_title_size"
          reason={
            isAr ? "تخصيص مقاس ومحاذاة ولون عنوان الواجهة" : "Customize hero title typography"
          }
        >
          <div className="rounded-xl border border-border p-4 bg-muted/5 space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              <h4 className="text-xs font-semibold">
                {isAr ? "تنسيقات عنوان الواجهة المتقدمة" : "Advanced Hero Title Styling"}
              </h4>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs font-medium">
                  {isAr ? "حجم الخط (px)" : "Font Size (px)"}
                </Label>
                <Input
                  type="number"
                  min={20}
                  max={96}
                  className="mt-1.5 text-xs h-9"
                  value={bs.hero_title_size ?? 40}
                  onChange={(e) =>
                    setBs({
                      hero_title_size: Math.max(20, Math.min(96, Number(e.target.value) || 40)),
                    })
                  }
                />
              </div>

              <div>
                <ColorField
                  label={isAr ? "لون العنوان" : "Title Color"}
                  value={bs.hero_title_color ?? null}
                  onChange={(val) => setBs({ hero_title_color: val })}
                />
              </div>

              <div>
                <Label className="text-xs font-medium">
                  {isAr ? "محاذاة العنوان" : "Title Alignment"}
                </Label>
                <div className="mt-1.5 flex gap-1.5">
                  {(["start", "center", "end"] as const).map((align) => (
                    <Button
                      key={align}
                      type="button"
                      size="sm"
                      variant={bs.hero_title_align === align ? "default" : "outline"}
                      className="flex-1 text-xs h-9"
                      onClick={() => setBs({ hero_title_align: align })}
                    >
                      {isAr
                        ? align === "start"
                          ? "البداية"
                          : align === "center"
                            ? "الوسط"
                            : "النهاية"
                        : align}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </AdvancedOnly>
      </div>

      {/* 2. Hero Background (Fixed Canvas) */}
      <div className="rounded-xl border border-border p-5 bg-card shadow-sm space-y-4">
        <div>
          <h3 className="text-base font-semibold text-foreground">
            {isAr ? "خلفية الواجهة الرئيسية (Hero Background)" : "Hero Background Media"}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {isAr
              ? "صورة أو فيديو ثابت بنسبة 16:9 يظهر كخلفية للواجهة الرئيسية في حال عدم تفعيل السلايدر المتعدد."
              : "Fixed 16:9 image or video used as canvas background when not cycling multiple slides."}
          </p>
        </div>

        {backgroundMedia ? (
          <div className="relative rounded-xl border border-border overflow-hidden bg-muted/20 aspect-[16/9] max-h-72 flex items-center justify-center">
            {backgroundMedia.type === "video" ? (
              <video
                src={backgroundMedia.url}
                className="w-full h-full object-cover"
                autoPlay
                loop
                muted
                playsInline
              />
            ) : (
              <img src={backgroundMedia.url} alt="" className="w-full h-full object-cover" />
            )}
            <div className="absolute top-3 end-3 flex gap-2 bg-background/80 backdrop-blur-sm p-1.5 rounded-lg border border-border shadow-sm">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-destructive hover:bg-destructive/10"
                onClick={() => updateBackground(null)}
              >
                <Trash2 className="size-3.5 me-1" />
                <span>{isAr ? "حذف" : "Remove"}</span>
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border p-8 text-center bg-muted/5 flex flex-col items-center justify-center gap-3">
            <div className="size-12 rounded-full bg-primary/10 text-primary flex items-center justify-center">
              <ImagePlus className="size-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-foreground">
                {isAr ? "لم يتم تعيين خلفية مخصصة للواجهة" : "No custom background media set"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isAr
                  ? "ارفع صورة عالية الدقة أو فيديو قصير (MP4/WebM) بنسبة 16:9"
                  : "Upload a high-res image or short video (MP4/WebM) in 16:9"}
              </p>
            </div>

            <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium cursor-pointer hover:bg-primary/90 transition-colors">
              {uploadingBg ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Video className="size-3.5" />
              )}
              <span>{isAr ? "رفع صورة أو فيديو خلفية" : "Upload Image / Video"}</span>
              <input
                type="file"
                accept="image/*,video/mp4,video/webm"
                className="hidden"
                disabled={uploadingBg}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) handleUploadBgFile(file);
                }}
              />
            </label>
          </div>
        )}

        <ImageCropperDialog
          open={Boolean(backgroundCropSrc)}
          imageSrc={backgroundCropSrc}
          preset="hero"
          busy={uploadingBg}
          heroPreview
          title={isAr ? "تأطير صورة خلفية الواجهة" : "Frame Hero Background"}
          description={
            isAr
              ? "اسحب وكبّر الصورة لتحديد الموضع المناسب بنسبة 16:9 لظهور مثالي على كافة الشاشات."
              : "Position and crop for a crisp 16:9 responsive presentation."
          }
          onCancel={() => setBackgroundCropSrc(null)}
          onConfirm={confirmBgCrop}
        />
      </div>

      {/* 3. Hero Slides Manager */}
      <div className="rounded-xl border border-border p-5 bg-card shadow-sm space-y-4">
        <div>
          <h3 className="text-base font-semibold text-foreground">
            {isAr ? "شرائح الواجهة التفاعلية (Hero Slides)" : "Interactive Hero Slides"}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {isAr
              ? "أضف ما يصل إلى 5 شرائح متحركة للواجهة تحتوي على صور أو فيديوهات وأزرار تحويل وإعلانات خاصة."
              : "Manage up to 5 rotating slides with background media, titles, and call-to-action buttons."}
          </p>
        </div>

        <HeroSlidesEditor brandId={brandId} slides={slides} onChange={updateSlides} />
      </div>
    </div>
  );
}
