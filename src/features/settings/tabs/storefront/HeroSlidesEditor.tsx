import * as React from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ResponsiveImage, OptimizedVideo } from "@/components/responsive-media";
import { HeroSlideLivePreview, type HeroSlide } from "./HeroSlideLivePreview";
import { uploadPublicMedia } from "@/lib/r2-upload";
import { optimizeVideo } from "@/lib/video-optimizer";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";

export type { HeroSlide };

export type MediaItem = { type: "image" | "video"; url: string };

export type HeroState = {
  background: MediaItem | null;
  slides: HeroSlide[];
  primary_color: string | null;
  about_ar: string | null;
  about_en: string | null;
};

export const emptyHeroSlide = (): HeroSlide => ({
  id: crypto.randomUUID(),
  type: "text",
  title_en: "",
  title_ar: "",
  body_en: "",
  body_ar: "",
  media_url: "",
  button_en: "Shop now",
  button_ar: "تسوّق الآن",
  button_href: "#products",
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
}: HeroSlidesEditorProps) {
  const { lang } = useI18n();
  const isAr = propIsAr ?? lang === "ar";
  const [internalUploading, setInternalUploading] = React.useState(false);

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

  const uploadMedia = async (file: File, index: number, language?: "en" | "ar") => {
    if (propUploadSlideMedia) {
      await propUploadSlideMedia(file, index, language);
      return;
    }
    if (!brandId) return;
    const isVideo = file.type.startsWith("video/") || /\.(mp4|webm|mov|m4v)$/i.test(file.name);
    try {
      setInternalUploading(true);

      let uploadFile: File | Blob = file;
      let posterBlob: Blob | null = null;
      let wasCompressed = false;
      let savingsPercent = 0;

      if (isVideo) {
        toast.info(isAr ? "جارٍ ضغط وتحسين الفيديو..." : "Optimizing video...");
        const result = await optimizeVideo(file);
        uploadFile = result.file;
        posterBlob = result.posterBlob && result.posterBlob.size > 0 ? result.posterBlob : null;
        wasCompressed = result.wasCompressed;
        savingsPercent = result.savingsPercent;
      }

      const [url, posterUrl] = await Promise.all([
        uploadPublicMedia(brandId, uploadFile, "hero"),
        posterBlob ? uploadPublicMedia(brandId, posterBlob, "hero") : Promise.resolve(null),
      ]);

      const patch: Partial<HeroSlide> =
        language === "ar"
          ? {
              media_url_ar: url,
              media_url: url,
              ...(posterUrl ? { media_poster_url_ar: posterUrl, media_poster_url: posterUrl } : {}),
            }
          : {
              media_url_en: url,
              media_url: url,
              ...(posterUrl ? { media_poster_url_en: posterUrl, media_poster_url: posterUrl } : {}),
            };

      update(index, patch);
      if (wasCompressed) {
        toast.success(
          isAr
            ? `تم ضغط ورفع الفيديو بنجاح (وفّر ${savingsPercent}% من الحجم)`
            : `Video compressed & uploaded (-${savingsPercent}%)`,
        );
      } else {
        toast.success(isAr ? "تم رفع الوسائط بنجاح" : "Media uploaded successfully");
      }
    } catch (e: any) {
      toast.error(e?.message || (isAr ? "فشل رفع الوسائط" : "Media upload failed"));
    } finally {
      setInternalUploading(false);
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
          onClick={() => handleUpdateSlides([...slides, emptyHeroSlide()])}
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

      {slides.map((slide, index) => (
        <div key={slide.id} className="space-y-3 rounded-xl border border-border p-4 bg-muted/10">
          <div className="flex items-center justify-between gap-3">
            <strong className="text-sm">
              {isAr ? `الشريحة ${index + 1}` : `Slide ${index + 1}`}
            </strong>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() =>
                handleUpdateSlides(slides.filter((_, itemIndex) => itemIndex !== index))
              }
              aria-label={isAr ? "حذف" : "Delete"}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>

          <div>
            <Label>{isAr ? "نوع المحتوى" : "Content type"}</Label>
            <Select
              value={slide.type}
              onValueChange={(value: "text" | "image" | "video") => update(index, { type: value })}
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
                  (language === "ar" ? slide.media_url_ar : slide.media_url_en) || slide.media_url;
                const streamIframeUrl =
                  language === "ar" ? slide.media_iframe_url_ar : slide.media_iframe_url_en;
                const posterUrl =
                  (language === "ar" ? slide.media_poster_url_ar : slide.media_poster_url_en) ||
                  mediaUrl;
                return (
                  <div
                    key={language}
                    className="space-y-2 rounded-lg border border-border bg-card p-3"
                    dir={language === "ar" ? "rtl" : "ltr"}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Label>{language === "ar" ? "الوسائط العربية" : "English media"}</Label>
                      {mediaUrl && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            update(
                              index,
                              language === "ar" ? { media_url_ar: "" } : { media_url_en: "" },
                            )
                          }
                        >
                          {language === "ar" ? "إزالة" : "Remove"}
                        </Button>
                      )}
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
                          slide.type === "video" ? "video/mp4" : "image/jpeg,image/png,image/webp"
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
                          ? "الموصى به: أفقي 16:9 | 15 ثانية كحد أقصى | 100MB | MP4"
                          : "Recommended: 16:9 Horizontal | Max 15s | Max 100MB | MP4"
                        : language === "ar"
                          ? "الموصى به: 1920×1080 بكسل (16:9) | JPG، PNG، WebP"
                          : "Recommended: 1920x1080px (16:9) | JPG, PNG, WebP"}
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          {slide.type !== "text" && (
            <div>
              <Label>{isAr ? "رابط الشريحة عند الضغط" : "Slide click link"}</Label>
              <Input
                dir="ltr"
                value={slide.button_href}
                onChange={(event) => update(index, { button_href: event.target.value })}
                placeholder="#products"
              />
            </div>
          )}

          {slide.type === "text" && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>العنوان — عربي</Label>
                  <Input
                    dir="rtl"
                    value={slide.title_ar}
                    onChange={(event) => update(index, { title_ar: event.target.value })}
                  />
                </div>
                <div>
                  <Label>العنوان — English</Label>
                  <Input
                    dir="ltr"
                    value={slide.title_en}
                    onChange={(event) => update(index, { title_en: event.target.value })}
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>الوصف — عربي</Label>
                  <Textarea
                    dir="rtl"
                    value={slide.body_ar}
                    onChange={(event) => update(index, { body_ar: event.target.value })}
                    rows={2}
                  />
                </div>
                <div>
                  <Label>الوصف — English</Label>
                  <Textarea
                    dir="ltr"
                    value={slide.body_en}
                    onChange={(event) => update(index, { body_en: event.target.value })}
                    rows={2}
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label>الزر — English</Label>
                  <Input
                    dir="ltr"
                    value={slide.button_en}
                    onChange={(event) => update(index, { button_en: event.target.value })}
                  />
                </div>
                <div>
                  <Label>الزر — عربي</Label>
                  <Input
                    dir="rtl"
                    value={slide.button_ar}
                    onChange={(event) => update(index, { button_ar: event.target.value })}
                  />
                </div>
                <div>
                  <Label>{isAr ? "رابط الزر" : "Button link"}</Label>
                  <Input
                    value={slide.button_href}
                    onChange={(event) => update(index, { button_href: event.target.value })}
                    placeholder="#products"
                  />
                </div>
              </div>
            </>
          )}

          <HeroSlideLivePreview slide={slide} isAr={isAr} color={slideAccentColor} />
        </div>
      ))}
    </div>
  );
}
