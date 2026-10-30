import * as React from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ResponsiveImage, OptimizedVideo } from "@/components/responsive-media";
import { HeroSlideLivePreview, type HeroSlide } from "./HeroSlideLivePreview";
import { HeroHeadlineFields } from "./HeroHeadlineFields";
import { HeroLivePreview } from "./HeroLivePreview";
import { HeroSlideLookFields } from "./HeroLookFields";
import { HeroContrastNote } from "./HeroContrastNote";
import { HeroSlideRow } from "./HeroSlideRow";
import { moveSlide, openAfterDelete, openAfterMove, slideRowTitle } from "./hero-slide-list";
import type { HeroPreviewBrand } from "@/lib/hero-preview";
import { uploadPublicMedia } from "@/lib/r2-upload";
import { VIDEO_PRESETS, type OptimizedVideoResult } from "@/lib/video-optimizer";
import { VideoOptimizerDialog } from "@/components/admin/video/VideoOptimizerDialog";
import { aspectFromSize, prepareHeroImage, probeMediaAspect } from "@/lib/media-aspect";
import { resolveHeroSlideMedia, type HeroBackgroundInput } from "@/lib/hero-media";
import {
  HeroFocalPointPicker,
  HeroFramePreview,
  type HeroFramingSettings,
} from "./HeroFramingTools";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";
import { newSlideButton } from "@/lib/hero-link";

export type { HeroSlide };

type MediaVariant = "main" | "mobile";

/** Field patch for one uploaded file, keyed by language and main/phone variant. */
function slideMediaPatch(
  language: "en" | "ar",
  variant: MediaVariant,
  media: { url: string; aspect: number | null; posterUrl?: string | null },
): Partial<HeroSlide> {
  const aspect = media.aspect ?? undefined;
  if (variant === "mobile") {
    return language === "ar"
      ? {
          media_url_mobile_ar: media.url,
          media_aspect_mobile_ar: aspect,
          media_poster_url_mobile_ar: media.posterUrl ?? undefined,
        }
      : {
          media_url_mobile_en: media.url,
          media_aspect_mobile_en: aspect,
          media_poster_url_mobile_en: media.posterUrl ?? undefined,
        };
  }
  const shared = {
    media_url: media.url,
    ...(aspect ? { media_aspect: aspect } : {}),
    ...(media.posterUrl ? { media_poster_url: media.posterUrl } : {}),
  };
  return language === "ar"
    ? {
        ...shared,
        media_url_ar: media.url,
        media_aspect_ar: aspect,
        ...(media.posterUrl ? { media_poster_url_ar: media.posterUrl } : {}),
      }
    : {
        ...shared,
        media_url_en: media.url,
        media_aspect_en: aspect,
        ...(media.posterUrl ? { media_poster_url_en: media.posterUrl } : {}),
      };
}

export type MediaItem = { type: "image" | "video"; url: string };

export type HeroState = {
  background: MediaItem | null;
  slides: HeroSlide[];
  primary_color: string | null;
  about_ar: string | null;
  about_en: string | null;
};

export const emptyHeroSlide = (
  /** A services store's booking page: a new slide's button books (it once linked to #products). */
  bookingHref?: string | null,
): HeroSlide => ({
  id: crypto.randomUUID(),
  type: "text",
  title_en: "",
  title_ar: "",
  body_en: "",
  body_ar: "",
  media_url: "",
  ...newSlideButton(bookingHref),
});

export interface HeroSlidesEditorProps {
  brandId?: string;
  slides?: HeroSlide[];
  onChange?: (slides: HeroSlide[]) => void;
  state?: HeroState;
  setState?: (state: HeroState) => void;
  isAr?: boolean;
  uploading?: boolean;
  uploadSlideMedia?: (file: File, index: number, language?: "en" | "ar") => Promise<void>;
  primaryColor?: string;
  /** A services store's booking page, where a new slide's button goes. */
  bookingHref?: string | null;
  /** Storefront hero settings, so previews match what shoppers will see. */
  framing?: HeroFramingSettings;
  background?: HeroBackgroundInput;
  /**
   * The brand and settings being edited: every slide has its animated headline, line and button,
   * and the preview is the store's own hero.
   */
  livePreview?: {
    brand: HeroPreviewBrand;
    settings: Record<string, unknown>;
  };
}

export function HeroSlidesEditor({
  brandId,
  slides: propSlides,
  onChange,
  state: propState,
  setState: propSetState,
  isAr: propIsAr,
  uploading: propUploading,
  uploadSlideMedia: propUploadSlideMedia,
  primaryColor,
  bookingHref,
  framing = {},
  background,
  livePreview,
}: HeroSlidesEditorProps) {
  const { lang } = useI18n();
  const isAr = propIsAr ?? lang === "ar";
  const [internalUploading, setInternalUploading] = React.useState(false);
  const [optimizingKey, setOptimizingKey] = React.useState<string | null>(null);
  const [pendingOptimizeVideo, setPendingOptimizeVideo] = React.useState<{
    file: File;
    index: number;
    language?: "en" | "ar";
    variant: MediaVariant;
  } | null>(null);

  const slides = propSlides ?? propState?.slides ?? [];
  const uploading = propUploading ?? internalUploading;
  const slideAccentColor = primaryColor ?? propState?.primary_color ?? "#8C6D58";

  const handleUpdateSlides = (newSlides: HeroSlide[]) => {
    if (onChange) {
      onChange(newSlides);
    } else if (propSetState && propState) {
      propSetState({ ...propState, slides: newSlides });
    }
  };

  const update = (index: number, patch: Partial<HeroSlide>) => {
    const updated = slides.map((slide, i) => (i === index ? { ...slide, ...patch } : slide));
    handleUpdateSlides(updated);
  };

  // One slide open at a time; the rest fold to a row each. A lone slide starts open.
  const [openSlide, setOpenSlide] = React.useState<number | null>(slides.length === 1 ? 0 : null);
  const dragFrom = React.useRef<number | null>(null);
  const [dropTarget, setDropTarget] = React.useState<number | null>(null);
  const move = (from: number, to: number) => {
    if (to < 0 || to >= slides.length || from === to) return;
    handleUpdateSlides(moveSlide(slides, from, to));
    setOpenSlide((open) => openAfterMove(open, from, to));
  };
  const remove = (index: number) => {
    handleUpdateSlides(slides.filter((_, itemIndex) => itemIndex !== index));
    setOpenSlide((open) => openAfterDelete(open, index));
  };
  const dragProps = (index: number): React.HTMLAttributes<HTMLDivElement> => ({
    draggable: true,
    onDragStart: (event) => {
      dragFrom.current = index;
      event.dataTransfer.effectAllowed = "move";
    },
    onDragOver: (event) => {
      if (dragFrom.current === null) return;
      event.preventDefault();
      setDropTarget(index);
    },
    onDragLeave: () => setDropTarget((target) => (target === index ? null : target)),
    onDrop: (event) => {
      event.preventDefault();
      if (dragFrom.current !== null) move(dragFrom.current, index);
      dragFrom.current = null;
      setDropTarget(null);
    },
    onDragEnd: () => {
      dragFrom.current = null;
      setDropTarget(null);
    },
  });

  const uploadMedia = async (
    file: File,
    index: number,
    language?: "en" | "ar",
    variant: MediaVariant = "main",
  ) => {
    if (propUploadSlideMedia && variant === "main") {
      await propUploadSlideMedia(file, index, language);
      return;
    }
    if (!brandId) return;
    const isVideo = file.type.startsWith("video/") || /\.(mp4|webm|mov|m4v)$/i.test(file.name);
    if (isVideo) {
      setPendingOptimizeVideo({ file, index, language, variant });
      return;
    }

    try {
      setInternalUploading(true);
      // Keep the original shape; only oversized images are downscaled.
      const { blob, aspect } = await prepareHeroImage(file);
      const url = await uploadPublicMedia(brandId, blob, "hero");
      update(index, slideMediaPatch(language ?? "en", variant, { url, aspect }));
      toast.success(isAr ? "تم رفع الصورة بنجاح" : "Image uploaded successfully");
    } catch (e: any) {
      toast.error(e?.message || (isAr ? "فشل رفع الصورة" : "Image upload failed"));
    } finally {
      setInternalUploading(false);
    }
  };

  const handleConfirmSlideVideo = async (result: OptimizedVideoResult) => {
    if (!pendingOptimizeVideo || !brandId) return;
    const { index, language, variant } = pendingOptimizeVideo;
    try {
      setInternalUploading(true);
      const [url, posterUrl, aspect] = await Promise.all([
        uploadPublicMedia(brandId, result.file, "hero"),
        result.posterBlob && result.posterBlob.size > 0
          ? uploadPublicMedia(brandId, result.posterBlob, "hero")
          : Promise.resolve(null),
        aspectFromSize(result.width, result.height)
          ? Promise.resolve(aspectFromSize(result.width, result.height))
          : probeMediaAspect(result.file),
      ]);

      update(index, slideMediaPatch(language ?? "en", variant, { url, aspect, posterUrl }));
      const presetLabel = isAr
        ? VIDEO_PRESETS[result.preset].labelAr
        : VIDEO_PRESETS[result.preset].labelEn;
      if (result.wasCompressed) {
        toast.success(
          isAr
            ? `تم تحسين الفيديو وحفظه (${presetLabel} — وفّر ${result.savingsPercent}%)`
            : `Video optimized and saved (${presetLabel} — -${result.savingsPercent}%)`,
        );
      } else {
        toast.success(
          isAr
            ? `تم رفع الفيديو بنجاح (${presetLabel})`
            : `Video uploaded successfully (${presetLabel})`,
        );
      }
    } catch (e: any) {
      toast.error(e?.message || (isAr ? "فشل رفع الفيديو" : "Failed to upload video"));
    } finally {
      setInternalUploading(false);
      setPendingOptimizeVideo(null);
    }
  };

  const handleOptimizeExistingSlideVideo = async (
    index: number,
    language: "ar" | "en",
    videoUrl: string,
  ) => {
    if (!brandId || !videoUrl) return;
    const key = `${index}-${language}`;
    try {
      setOptimizingKey(key);
      toast.info(
        isAr
          ? "جارٍ جلب الفيديو الحالي لفتحه في معالج التحسين..."
          : "Downloading existing video for optimization...",
      );
      const response = await fetch(videoUrl);
      if (!response.ok) throw new Error(`Failed to fetch current video (${response.status})`);
      const blob = await response.blob();
      const file = new File([blob], `slide-${index}-${language}.mp4`, {
        type: blob.type || "video/mp4",
      });

      setPendingOptimizeVideo({ file, index, language, variant: "main" });
    } catch (e: any) {
      toast.error(
        e?.message || (isAr ? "فشل جلب الفيديو الحالي" : "Failed to fetch current video"),
      );
    } finally {
      setOptimizingKey(null);
    }
  };

  return (
    <div className="space-y-3 border-t border-border pt-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Label className="text-sm font-semibold">
            {isAr ? "شرائح محتوى الواجهة" : "Hero content slides"}
          </Label>
          <p className="text-xs text-muted-foreground">
            {isAr
              ? "حتى 5 شرائح قابلة للتمرير: نص أو صورة أو فيديو."
              : "Up to 5 swipeable text, image, or video slides."}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={slides.length >= 5}
          onClick={() => {
            handleUpdateSlides([...slides, emptyHeroSlide(bookingHref)]);
            setOpenSlide(slides.length);
          }}
        >
          {isAr ? "+ شريحة" : "+ Add slide"}
        </Button>
      </div>

      {slides.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
          {isAr
            ? "سيستمر عرض النص الحالي حتى تضيف أول شريحة."
            : "The current hero text remains until you add the first slide."}
        </div>
      )}

      {slides.length > 1 && (
        <p className="text-xs text-muted-foreground">
          {isAr
            ? "اضغط على شريحة لفتحها، واسحبها أو استخدم الأسهم لتغيير ترتيبها."
            : "Tap a slide to open it; drag it or use the arrows to change the order."}
        </p>
      )}

      {slides.map((slide, index) => {
        const open = openSlide === index;
        const panelId = `hero-slide-panel-${slide.id || index}`;
        return (
          <div
            key={slide.id}
            className={`space-y-3 rounded-xl border p-3 sm:p-4 bg-muted/10 ${
              dropTarget === index ? "border-primary" : "border-border"
            }`}
          >
            <HeroSlideRow
              index={index}
              count={slides.length}
              kind={slide.type}
              title={slideRowTitle(slide, isAr ? "ar" : "en")}
              thumbnail={
                slide.type === "text"
                  ? null
                  : (resolveHeroSlideMedia(slide, isAr ? "ar" : "en", background).main?.posterUrl ??
                    null)
              }
              open={open}
              isAr={isAr}
              panelId={panelId}
              onToggle={() => setOpenSlide(open ? null : index)}
              onMove={(to) => move(index, to)}
              onDelete={() => remove(index)}
              dragProps={dragProps(index)}
            />

            {open && (
              <div id={panelId} className="space-y-3 border-t border-border pt-3">
                <div>
                  <Label>{isAr ? "نوع المحتوى" : "Content type"}</Label>
                  <Select
                    value={slide.type}
                    onValueChange={(value: "text" | "image" | "video") =>
                      update(index, { type: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">{isAr ? "نص" : "Text"}</SelectItem>
                      <SelectItem value="image">{isAr ? "صورة" : "Image"}</SelectItem>
                      <SelectItem value="video">{isAr ? "فيديو" : "Video"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {slide.type !== "text" && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {(["en", "ar"] as const).map((language) => {
                      const mediaUrl =
                        (language === "ar" ? slide.media_url_ar : slide.media_url_en) ||
                        slide.media_url;
                      const streamIframeUrl =
                        language === "ar" ? slide.media_iframe_url_ar : slide.media_iframe_url_en;
                      const posterUrl =
                        (language === "ar"
                          ? slide.media_poster_url_ar
                          : slide.media_poster_url_en) || mediaUrl;
                      return (
                        <div
                          key={language}
                          className="space-y-2 rounded-lg border border-border bg-card p-3"
                          dir={language === "ar" ? "rtl" : "ltr"}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <Label>{language === "ar" ? "الوسائط العربية" : "English media"}</Label>
                            <div className="flex items-center gap-1.5">
                              {mediaUrl && slide.type === "video" && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs gap-1.5"
                                  disabled={uploading || optimizingKey === `${index}-${language}`}
                                  onClick={() =>
                                    handleOptimizeExistingSlideVideo(index, language, mediaUrl)
                                  }
                                >
                                  {optimizingKey === `${index}-${language}` ? (
                                    <Loader2 className="size-3.5 animate-spin" />
                                  ) : (
                                    <Sparkles className="size-3.5 text-primary" />
                                  )}
                                  <span>{isAr ? "ضغط وتحسين الفيديو" : "Compress"}</span>
                                </Button>
                              )}
                              {mediaUrl && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 text-xs text-destructive hover:bg-destructive/10"
                                  onClick={() =>
                                    update(
                                      index,
                                      language === "ar"
                                        ? { media_url_ar: "", media_aspect_ar: undefined }
                                        : { media_url_en: "", media_aspect_en: undefined },
                                    )
                                  }
                                >
                                  {language === "ar" ? "إزالة" : "Remove"}
                                </Button>
                              )}
                            </div>
                          </div>
                          {mediaUrl &&
                            (slide.type === "video" ? (
                              <OptimizedVideo
                                src={streamIframeUrl ? undefined : mediaUrl}
                                streamIframeUrl={streamIframeUrl}
                                poster={posterUrl}
                                className="aspect-video w-full rounded-lg bg-black object-cover"
                                wrapperClassName="aspect-video w-full overflow-hidden rounded-lg bg-black"
                              />
                            ) : (
                              <ResponsiveImage
                                src={mediaUrl}
                                preset="hero"
                                alt=""
                                className="aspect-video w-full rounded-lg object-cover"
                              />
                            ))}
                          <label className="flex h-12 cursor-pointer items-center justify-center rounded-lg border border-dashed border-border px-4 text-sm text-muted-foreground hover:bg-secondary">
                            {uploading
                              ? "…"
                              : language === "ar"
                                ? "رفع وسائط عربية"
                                : "Upload English media"}
                            <input
                              type="file"
                              accept={
                                slide.type === "video"
                                  ? "video/mp4,video/webm,video/quicktime"
                                  : "image/jpeg,image/png,image/webp"
                              }
                              className="hidden"
                              onChange={(event) => {
                                const file = event.target.files?.[0];
                                if (file) void uploadMedia(file, index, language);
                                event.target.value = "";
                              }}
                            />
                          </label>
                          <p className="text-xs leading-relaxed text-muted-foreground">
                            {slide.type === "video"
                              ? language === "ar"
                                ? "أي أبعاد — تُعرض كاملة. الأفضل للكمبيوتر أفقي 16:9 | 15 ثانية | 100MB | MP4"
                                : "Any shape — shown in full. Best for desktop: 16:9 | Max 15s | 100MB | MP4"
                              : language === "ar"
                                ? "أي أبعاد — تُحفظ كما هي. الأفضل للكمبيوتر 1920×1080 | JPG، PNG، WebP"
                                : "Any shape — kept as uploaded. Best for desktop: 1920×1080 | JPG, PNG, WebP"}
                          </p>
                          <MobileVariantField
                            slide={slide}
                            language={language}
                            isAr={isAr}
                            uploading={uploading}
                            onUpload={(file) => void uploadMedia(file, index, language, "mobile")}
                            onRemove={() =>
                              update(
                                index,
                                language === "ar"
                                  ? {
                                      media_url_mobile_ar: undefined,
                                      media_poster_url_mobile_ar: undefined,
                                      media_aspect_mobile_ar: undefined,
                                    }
                                  : {
                                      media_url_mobile_en: undefined,
                                      media_poster_url_mobile_en: undefined,
                                      media_aspect_mobile_en: undefined,
                                    },
                              )
                            }
                          />
                        </div>
                      );
                    })}
                  </div>
                )}

                <HeroHeadlineFields
                  idPrefix={`slide-${slide.id || index}`}
                  slide={slide}
                  isAr={isAr}
                  onChange={(patch) => update(index, patch)}
                  withText
                  storeNames={[livePreview?.brand.name_ar, livePreview?.brand.name_en]}
                />

                {livePreview && (
                  <HeroSlideLookFields
                    idPrefix={`slide-${slide.id || index}`}
                    slide={slide}
                    store={livePreview.settings}
                    isAr={isAr}
                    onChange={(patch) => update(index, patch)}
                  />
                )}
                {livePreview && (
                  <HeroContrastNote
                    slide={slide}
                    store={livePreview.settings}
                    framing={framing}
                    imageUrl={
                      resolveHeroSlideMedia(slide, isAr ? "ar" : "en", background).main
                        ?.posterUrl ?? null
                    }
                    mobileImageUrl={
                      resolveHeroSlideMedia(slide, isAr ? "ar" : "en", background).mobile
                        ?.posterUrl ?? null
                    }
                    isAr={isAr}
                    onChange={(patch) => update(index, patch)}
                  />
                )}

                <HeroFocalPointPicker
                  imageUrl={
                    resolveHeroSlideMedia(slide, isAr ? "ar" : "en", background).main?.posterUrl ??
                    null
                  }
                  slide={slide}
                  fitSetting={framing.fit}
                  isAr={isAr}
                  onChange={(patch) => update(index, patch)}
                />

                <HeroFramePreview
                  slides={slides}
                  index={index}
                  background={background}
                  framing={framing}
                  isAr={isAr}
                />

                {livePreview ? (
                  <HeroLivePreview
                    brand={livePreview.brand}
                    settings={livePreview.settings}
                    slide={slide as unknown as Record<string, unknown>}
                    background={(background as Record<string, unknown> | null | undefined) ?? null}
                    isAr={isAr}
                  />
                ) : (
                  <HeroSlideLivePreview slide={slide} isAr={isAr} color={slideAccentColor} />
                )}
              </div>
            )}
          </div>
        );
      })}

      <VideoOptimizerDialog
        open={!!pendingOptimizeVideo}
        file={pendingOptimizeVideo?.file ?? null}
        brandId={brandId}
        onOpenChange={(open) => {
          if (!open) setPendingOptimizeVideo(null);
        }}
        onConfirm={handleConfirmSlideVideo}
        onCancel={() => setPendingOptimizeVideo(null)}
      />
    </div>
  );
}

/** Optional phone-specific cut for one language, shown below 640px instead of the main file. */
function MobileVariantField({
  slide,
  language,
  isAr,
  uploading,
  onUpload,
  onRemove,
}: {
  slide: HeroSlide;
  language: "en" | "ar";
  isAr: boolean;
  uploading: boolean;
  onUpload: (file: File) => void;
  onRemove: () => void;
}) {
  const url = language === "ar" ? slide.media_url_mobile_ar : slide.media_url_mobile_en;
  const poster =
    (language === "ar" ? slide.media_poster_url_mobile_ar : slide.media_poster_url_mobile_en) ||
    (slide.type === "video" ? undefined : url);
  const isVideo = slide.type === "video";

  return (
    <div className="space-y-2 rounded-md border border-dashed border-border p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium">
          {isAr ? "نسخة الجوال (اختياري)" : "Phone version (optional)"}
        </span>
        {url && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 text-xs text-destructive hover:bg-destructive/10"
            onClick={onRemove}
          >
            {isAr ? "إزالة" : "Remove"}
          </Button>
        )}
      </div>
      {url && (
        <div className="flex justify-center rounded bg-neutral-950 p-1">
          {poster ? (
            <ResponsiveImage
              src={poster}
              preset="card"
              alt=""
              className="max-h-40 w-auto rounded object-contain"
            />
          ) : (
            <video src={url} muted playsInline preload="metadata" className="max-h-40 rounded" />
          )}
        </div>
      )}
      <label className="flex min-h-11 cursor-pointer items-center justify-center rounded-md border border-border px-3 text-xs text-muted-foreground hover:bg-secondary">
        {uploading
          ? "…"
          : url
            ? isAr
              ? "استبدال نسخة الجوال"
              : "Replace phone version"
            : isAr
              ? "رفع نسخة طولية للجوال"
              : "Upload a vertical phone version"}
        <input
          type="file"
          accept={
            isVideo ? "video/mp4,video/webm,video/quicktime" : "image/jpeg,image/png,image/webp"
          }
          className="hidden"
          disabled={uploading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onUpload(file);
            event.target.value = "";
          }}
        />
      </label>
      <p className="text-xs text-muted-foreground">
        {isAr
          ? "تظهر على الجوال بدلاً من الملف الرئيسي. الأفضل 4:5 أو 9:16."
          : "Shown on phones instead of the main file. 4:5 or 9:16 works best."}
      </p>
    </div>
  );
}
