import { useState } from "react";
import { isStorefrontV2 } from "@/lib/storefront-engine";
import { aspectFromSize, prepareHeroImage, probeMediaAspect } from "@/lib/media-aspect";
import { useI18n } from "@/lib/i18n";
import { useBrandSettingsFormContext } from "@/features/settings/use-brand-settings-form";
import { AdvancedOnly } from "@/features/settings/FieldVisibility";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ColorField } from "@/features/settings/shared/ColorField";
import { HeroSlidesEditor, type HeroSlide } from "./HeroSlidesEditor";
import { uploadPublicMedia } from "@/lib/r2-upload";
import { VIDEO_PRESETS, type OptimizedVideoResult } from "@/lib/video-optimizer";
import { VideoOptimizerDialog } from "@/components/admin/video/VideoOptimizerDialog";
import { toast } from "sonner";
import { ImagePlus, Loader2, Sparkles, Trash2, Video } from "lucide-react";

interface MediaItem {
  type: "image" | "video";
  url: string;
  posterUrl?: string;
  aspect?: number;
  /** Optional phone-specific cut of the same type, shown below 640px. */
  mobileUrl?: string;
  mobilePosterUrl?: string;
  mobileAspect?: number;
}

type BgVariant = "main" | "mobile";

export function HomeHeroGroup() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const { form, setBrand, setBs, brandId } = useBrandSettingsFormContext();
  const brand = form.brand;
  const bs = form.bs;
  // Classic-hero typography and visibility toggles are read only by the V1
  // carousel; HeroV2 uses per-slide fields instead.
  const isV2 = isStorefrontV2(bs);

  const [uploadingBg, setUploadingBg] = useState(false);
  const [pendingOptimizeBgVideo, setPendingOptimizeBgVideo] = useState<{
    file: File;
    variant: BgVariant;
  } | null>(null);

  // Parse hero_media
  const heroMedia = (
    brand.hero_media && typeof brand.hero_media === "object" && !Array.isArray(brand.hero_media)
      ? brand.hero_media
      : {}
  ) as { background?: MediaItem | null; slides?: HeroSlide[] };

  const backgroundMedia = heroMedia.background ?? null;
  const slides = heroMedia.slides ?? [];

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

  /** Stores one uploaded file as the background or as its phone version. */
  const applyBgUpload = (
    variant: BgVariant,
    media: {
      type: "image" | "video";
      url: string;
      posterUrl?: string | null;
      aspect: number | null;
    },
  ) => {
    if (variant === "mobile") {
      if (!backgroundMedia) return;
      updateBackground({
        ...backgroundMedia,
        mobileUrl: media.url,
        mobilePosterUrl: media.posterUrl ?? undefined,
        mobileAspect: media.aspect ?? undefined,
      });
      return;
    }
    // Replacing the main file keeps an existing phone version of the same type.
    const keepMobile =
      backgroundMedia?.mobileUrl && backgroundMedia.type === media.type
        ? {
            mobileUrl: backgroundMedia.mobileUrl,
            mobilePosterUrl: backgroundMedia.mobilePosterUrl,
            mobileAspect: backgroundMedia.mobileAspect,
          }
        : {};
    updateBackground({
      type: media.type,
      url: media.url,
      ...(media.posterUrl ? { posterUrl: media.posterUrl } : {}),
      ...(media.aspect ? { aspect: media.aspect } : {}),
      ...keepMobile,
    });
  };

  const handleUploadBgFile = async (file: File, variant: BgVariant = "main") => {
    const isVid = file.type.startsWith("video") || /\.(mp4|webm|mov|m4v|mkv)$/i.test(file.name);
    if (isVid) {
      setPendingOptimizeBgVideo({ file, variant });
      return;
    }
    try {
      setUploadingBg(true);
      // Keep the original shape: Smart Fit adapts the frame, so no forced 16:9 crop.
      const { blob, aspect } = await prepareHeroImage(file);
      const url = await uploadPublicMedia(brandId, blob, "hero");
      applyBgUpload(variant, { type: "image", url, aspect });
      toast.success(isAr ? "تم حفظ وتطبيق صورة الخلفية" : "Background image saved");
    } catch (err: any) {
      toast.error(err?.message || (isAr ? "فشل حفظ الصورة" : "Failed to save image"));
    } finally {
      setUploadingBg(false);
    }
  };

  const handleConfirmBgVideo = async (result: OptimizedVideoResult) => {
    if (!brandId || !pendingOptimizeBgVideo) return;
    const { variant } = pendingOptimizeBgVideo;
    try {
      setUploadingBg(true);
      const [url, posterUrl, aspect] = await Promise.all([
        uploadPublicMedia(brandId, result.file, "hero"),
        result.posterBlob && result.posterBlob.size > 0
          ? uploadPublicMedia(brandId, result.posterBlob, "hero")
          : Promise.resolve(null),
        aspectFromSize(result.width, result.height)
          ? Promise.resolve(aspectFromSize(result.width, result.height))
          : probeMediaAspect(result.file),
      ]);
      applyBgUpload(variant, { type: "video", url, posterUrl, aspect });
      const presetLabel = isAr
        ? VIDEO_PRESETS[result.preset].labelAr
        : VIDEO_PRESETS[result.preset].labelEn;
      if (result.wasCompressed) {
        toast.success(
          isAr
            ? `تم تحسين فيديو الخلفية وحفظه (${presetLabel} — وفّر ${result.savingsPercent}%)`
            : `Background video optimized & saved (${presetLabel} — -${result.savingsPercent}%)`,
        );
      } else {
        toast.success(
          isAr
            ? `تم رفع فيديو الخلفية (${presetLabel})`
            : `Background video uploaded (${presetLabel})`,
        );
      }
    } catch (err: any) {
      toast.error(err?.message || (isAr ? "فشل رفع الفيديو" : "Failed to upload video"));
    } finally {
      setUploadingBg(false);
      setPendingOptimizeBgVideo(null);
    }
  };

  const handleOptimizeExistingBgVideo = async () => {
    if (!backgroundMedia?.url || backgroundMedia.type !== "video") return;
    try {
      setUploadingBg(true);
      toast.info(
        isAr
          ? "جارٍ جلب الفيديو الحالي لفتحه في معالج التحسين..."
          : "Downloading existing video for optimization...",
      );
      const response = await fetch(backgroundMedia.url);
      if (!response.ok) throw new Error(`Failed to fetch current video (${response.status})`);
      const blob = await response.blob();
      const file = new File([blob], "current-hero-video.mp4", { type: blob.type || "video/mp4" });

      setPendingOptimizeBgVideo({ file, variant: "main" });
    } catch (err: any) {
      toast.error(
        err?.message || (isAr ? "فشل جلب الفيديو الحالي" : "Failed to fetch current video"),
      );
    } finally {
      setUploadingBg(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Hero Presentation & Responsive Layout */}
      <div className="rounded-xl border border-border p-5 bg-card shadow-sm space-y-4">
        <div>
          <h3 className="text-base font-semibold text-foreground">
            {isAr ? "خيارات عرض ومظهر الواجهة (Hero Layout)" : "Hero Layout & Presentation"}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {isAr
              ? "تحكم بنمط عرض الهيرو، أبعاد الفيديو على الجوال، وارتفاعه على أجهزة الكمبيوتر لمنع المساحات البيضاء وتطابق العرض الفاخر."
              : "Configure hero canvas width, mobile video aspect ratio, and desktop height bounds to eliminate white borders."}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Hero Layout: Full-bleed vs Contained */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">
              {isAr ? "نمط عرض الهيرو" : "Hero Display Layout"}
            </Label>
            <Select
              value={bs.hero_layout || "full_bleed"}
              onValueChange={(val) => setBs({ hero_layout: val })}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="full_bleed">
                  {isAr
                    ? "ملء الشاشة الفاخر (Full-Bleed — موصى به)"
                    : "Full-Bleed (Edge-to-Edge — Recommended)"}
                </SelectItem>
                <SelectItem value="contained">
                  {isAr ? "بطاقة مؤطرة بزوايا منحنية (Contained)" : "Contained (Boxed Card)"}
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {isAr
                ? "ملء الشاشة يمتد بعرض الشاشة بالكامل بدون إطار أبيض ومندمج مع الترويسة."
                : "Full-bleed spans edge-to-edge seamlessly under the header with zero white frame."}
            </p>
          </div>

          {/* Mobile Aspect Ratio */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">
              {isAr ? "تناسب الفيديو والصور على الجوال" : "Mobile Hero Media Ratio"}
            </Label>
            <Select
              value={bs.hero_aspect_mobile || "portrait_4_5"}
              onValueChange={(val) => setBs({ hero_aspect_mobile: val })}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="portrait_4_5">
                  {isAr
                    ? "طولي 4:5 (موصى به للفيديوهات والريلز)"
                    : "Portrait 4:5 (Optimal for Reels & Videos)"}
                </SelectItem>
                <SelectItem value="story_9_16">
                  {isAr ? "ستوري كامل 9:16 (Story 9:16)" : "Story 9:16 (Full Vertical)"}
                </SelectItem>
                <SelectItem value="square_1_1">
                  {isAr ? "مربع 1:1 (Square 1:1)" : "Square 1:1"}
                </SelectItem>
                <SelectItem value="landscape_4_3">
                  {isAr ? "عريض كلاسيكي 4:3 (Landscape 4:3)" : "Landscape 4:3"}
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {isAr
                ? "يُستخدم مع أوضاع الملء والاقتصاص. الملاءمة الذكية تتبع أبعاد كل ملف مرفوع تلقائياً."
                : "Used by the Fill & Crop modes. Smart Fit follows each upload's own shape automatically."}
            </p>
          </div>

          {/* Hero Video Fit / Framing */}
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs font-medium">
              {isAr ? "تأطير وعرض فيديو الهيرو" : "Hero Video Presentation & Framing"}
            </Label>
            <Select
              value={bs.hero_video_fit || "contain_ambient"}
              onValueChange={(val) => setBs({ hero_video_fit: val })}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="contain_ambient">
                  {isAr
                    ? "ملاءمة ذكية بعرض الشاشة — بدون أي قص (موصى به)"
                    : "Smart Fit — Edge-to-Edge, No Cropping (Recommended)"}
                </SelectItem>
                <SelectItem value="cover">
                  {isAr ? "ملء كامل مع اقتصاص ذكي (Fill & Smart Crop)" : "Fill & Smart Crop"}
                </SelectItem>
                <SelectItem value="top">
                  {isAr
                    ? "محاذاة للأعلى (Top-aligned Crop — تركيز على الوجه والملابس العلوية)"
                    : "Top-aligned Crop (Focus on Upper Frame)"}
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {isAr
                ? "الملاءمة الذكية تجعل إطار الواجهة بعرض الشاشة يأخذ شكل الشريحة الأولى، فيظهر الفيديو أو الصورة كاملاً مع النصوص المدمجة على الجوال والكمبيوتر. الشرائح بأبعاد مختلفة تُعرض كاملة فوق خلفية ضبابية من نفس الوسائط."
                : "Smart Fit shapes the full-width hero frame to your first slide, so the whole video or image — including burned-in text — shows on phones and desktops. Slides with a different shape are shown whole over a blurred fill of the same media."}
            </p>
          </div>
        </div>

        {/* Desktop Height & Navigation Arrows (Advanced) */}
        <AdvancedOnly
          fieldKey="hero_height_desktop"
          reason={
            isAr ? "تخصيص ارتفاع الهيرو وأسهم التنقل" : "Customize desktop hero height and arrows"
          }
        >
          <div className="rounded-xl border border-border p-4 bg-muted/5 space-y-4 pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">
                  {isAr ? "ارتفاع الهيرو على الكمبيوتر" : "Desktop Hero Height"}
                </Label>
                <Select
                  value={bs.hero_height_desktop || "standard"}
                  onValueChange={(val) => setBs({ hero_height_desktop: val })}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="compact">
                      {isAr ? "مدمج (Compact ~400px)" : "Compact (~400px)"}
                    </SelectItem>
                    <SelectItem value="standard">
                      {isAr ? "قياسي متوازن (Standard ~500px)" : "Standard (~500px)"}
                    </SelectItem>
                    <SelectItem value="cinematic">
                      {isAr ? "سينمائي عريض (Cinematic ~620px)" : "Cinematic (~620px)"}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border p-3 bg-card">
                <div className="space-y-0.5">
                  <Label className="text-xs font-medium cursor-pointer">
                    {isAr ? "أسهم التنقل بين الشرائح" : "Slide Navigation Arrows"}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {isAr
                      ? "إظهار أزرار عائمة للتنقل السريع بين الشرائح على الشاشات الكبيرة"
                      : "Floating chevron buttons to cycle slides on desktop"}
                  </p>
                </div>
                <Switch
                  checked={bs.hero_show_arrows ?? true}
                  onCheckedChange={(checked) => setBs({ hero_show_arrows: checked })}
                />
              </div>
            </div>
          </div>
        </AdvancedOnly>
      </div>

      {/* 2. Hero Title & About Visibility */}
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

        {!isV2 && (
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
        )}

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

        {/* Advanced Title Tuning — classic hero only */}
        {!isV2 && (
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
        )}
      </div>

      {/* 2. Hero Background (Fixed Canvas) */}
      <div className="rounded-xl border border-border p-5 bg-card shadow-sm space-y-4">
        <div>
          <h3 className="text-base font-semibold text-foreground">
            {isAr ? "خلفية الواجهة الرئيسية (Hero Background)" : "Hero Background Media"}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {isAr
              ? "صورة أو فيديو يظهر كخلفية للواجهة وللشرائح النصية. مع الملاءمة الذكية يتكيف الإطار مع أبعاده."
              : "Image or video used as the hero canvas and behind text-only slides. Smart Fit adapts the frame to its shape."}
          </p>
        </div>

        {backgroundMedia ? (
          <div className="relative rounded-xl border border-border overflow-hidden bg-neutral-950 aspect-[16/9] max-h-72 flex items-center justify-center">
            {backgroundMedia.type === "video" ? (
              <video
                src={backgroundMedia.url}
                className="w-full h-full object-contain"
                autoPlay
                loop
                muted
                playsInline
              />
            ) : (
              <img src={backgroundMedia.url} alt="" className="w-full h-full object-contain" />
            )}
            <div className="absolute top-3 end-3 flex items-center gap-2 bg-background/90 backdrop-blur-sm p-1.5 rounded-lg border border-border shadow-sm">
              {backgroundMedia.type === "video" && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1.5 bg-background hover:bg-muted"
                  disabled={uploadingBg}
                  onClick={handleOptimizeExistingBgVideo}
                >
                  {uploadingBg ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="size-3.5 text-primary" />
                  )}
                  <span>{isAr ? "ضغط وتحسين الفيديو" : "Compress Video"}</span>
                </Button>
              )}
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
                  ? "ارفع صورة عالية الدقة أو فيديو قصير (MP4/WebM) بأي أبعاد — يُحفظ كما هو"
                  : "Upload a high-res image or short video (MP4/WebM) in any shape — kept as uploaded"}
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

        {backgroundMedia && (
          <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs font-medium">
                {isAr ? "نسخة الجوال (اختياري)" : "Phone version (optional)"}
              </Label>
              {backgroundMedia.mobileUrl && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs text-destructive hover:bg-destructive/10"
                  onClick={() =>
                    updateBackground({
                      ...backgroundMedia,
                      mobileUrl: undefined,
                      mobilePosterUrl: undefined,
                      mobileAspect: undefined,
                    })
                  }
                >
                  <Trash2 className="size-3.5 me-1" />
                  <span>{isAr ? "حذف" : "Remove"}</span>
                </Button>
              )}
            </div>
            {backgroundMedia.mobileUrl && (
              <div className="flex justify-center rounded bg-neutral-950 p-1">
                {backgroundMedia.type === "video" ? (
                  <video
                    src={backgroundMedia.mobileUrl}
                    poster={backgroundMedia.mobilePosterUrl}
                    muted
                    playsInline
                    preload="metadata"
                    className="max-h-48 rounded"
                  />
                ) : (
                  <img
                    src={backgroundMedia.mobileUrl}
                    alt=""
                    className="max-h-48 w-auto rounded object-contain"
                  />
                )}
              </div>
            )}
            <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md border border-border px-3 text-xs text-muted-foreground hover:bg-secondary">
              {uploadingBg ? <Loader2 className="size-3.5 animate-spin" /> : null}
              <span>
                {backgroundMedia.mobileUrl
                  ? isAr
                    ? "استبدال نسخة الجوال"
                    : "Replace phone version"
                  : isAr
                    ? "رفع نسخة طولية للجوال"
                    : "Upload a vertical phone version"}
              </span>
              <input
                type="file"
                accept={
                  backgroundMedia.type === "video"
                    ? "video/mp4,video/webm,video/quicktime"
                    : "image/jpeg,image/png,image/webp"
                }
                className="hidden"
                disabled={uploadingBg}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void handleUploadBgFile(file, "mobile");
                }}
              />
            </label>
            <p className="text-xs text-muted-foreground">
              {isAr
                ? "تظهر على الجوال بدلاً من الخلفية الرئيسية. الأفضل 4:5 أو 9:16 وبنفس نوع الملف."
                : "Shown on phones instead of the main background. 4:5 or 9:16 of the same type works best."}
            </p>
          </div>
        )}
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

        <HeroSlidesEditor
          brandId={brandId}
          slides={slides}
          onChange={updateSlides}
          background={backgroundMedia}
          framing={{
            fit: bs.hero_video_fit || "contain_ambient",
            mobileRatio: bs.hero_aspect_mobile || "portrait_4_5",
            desktopHeight: bs.hero_height_desktop || "standard",
          }}
        />
      </div>

      <VideoOptimizerDialog
        open={!!pendingOptimizeBgVideo}
        file={pendingOptimizeBgVideo?.file ?? null}
        brandId={brandId}
        onOpenChange={(open) => {
          if (!open) setPendingOptimizeBgVideo(null);
        }}
        onConfirm={handleConfirmBgVideo}
        onCancel={() => setPendingOptimizeBgVideo(null)}
      />
    </div>
  );
}
