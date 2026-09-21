import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n";
import { uploadPublicMedia } from "@/lib/r2-upload";
import { optimizeVideo } from "@/lib/video-optimizer";
import { toast } from "sonner";
import {
  Video,
  Film,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  ExternalLink,
} from "lucide-react";

interface VideoEntry {
  id: string;
  brandId: string;
  brandName: string;
  brandSlug: string;
  sourceType: "hero_background" | "hero_slide" | "product";
  title: string;
  videoUrl: string;
  posterUrl?: string;
  meta: {
    slideIndex?: number;
    slideLang?: "ar" | "en";
    productId?: string;
    mediaIndex?: number;
  };
}

export function SuperVideoReoptimizer() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const qc = useQueryClient();

  const [processingId, setProcessingId] = useState<string | null>(null);
  const [progressMap, setProgressMap] = useState<Record<string, number>>({});
  const [statusMap, setStatusMap] = useState<
    Record<string, { status: "success" | "skipped" | "error"; message: string }>
  >({});
  const [isBatchRunning, setIsBatchRunning] = useState(false);

  // 1. Fetch videos across brands (hero backgrounds & slides) and products
  const {
    data: videoEntries = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["super-admin-video-reoptimizer-list"],
    queryFn: async () => {
      const entries: VideoEntry[] = [];

      // Query brands
      const { data: brands, error: brandsError } = await (supabase.from("brands") as any)
        .select("id, name, slug, hero_media")
        .order("name", { ascending: true });

      if (brandsError) throw brandsError;

      for (const brand of brands ?? []) {
        const heroMedia =
          brand.hero_media && typeof brand.hero_media === "object" ? brand.hero_media : null;
        if (heroMedia) {
          // Check background video
          if (heroMedia.background?.type === "video" && heroMedia.background.url) {
            entries.push({
              id: `brand-${brand.id}-bg`,
              brandId: brand.id,
              brandName: brand.name,
              brandSlug: brand.slug,
              sourceType: "hero_background",
              title: isAr ? "فيديو خلفية الواجهة" : "Hero Background Video",
              videoUrl: heroMedia.background.url,
              posterUrl: heroMedia.background.posterUrl,
              meta: {},
            });
          }

          // Check slides
          if (Array.isArray(heroMedia.slides)) {
            heroMedia.slides.forEach((slide: any, idx: number) => {
              if (
                slide.media_url &&
                (slide.type === "video" || /\.(mp4|webm|mov|m4v)$/i.test(slide.media_url))
              ) {
                entries.push({
                  id: `brand-${brand.id}-slide-${idx}-def`,
                  brandId: brand.id,
                  brandName: brand.name,
                  brandSlug: brand.slug,
                  sourceType: "hero_slide",
                  title: `${isAr ? "شريحة واجهة" : "Hero Slide"} #${idx + 1} (${slide.title_ar || slide.title_en || "Slide"})`,
                  videoUrl: slide.media_url,
                  posterUrl: slide.media_poster_url,
                  meta: { slideIndex: idx },
                });
              } else {
                if (slide.media_url_ar && /\.(mp4|webm|mov|m4v)$/i.test(slide.media_url_ar)) {
                  entries.push({
                    id: `brand-${brand.id}-slide-${idx}-ar`,
                    brandId: brand.id,
                    brandName: brand.name,
                    brandSlug: brand.slug,
                    sourceType: "hero_slide",
                    title: `${isAr ? "شريحة واجهة (عربي)" : "Hero Slide (AR)"} #${idx + 1}`,
                    videoUrl: slide.media_url_ar,
                    posterUrl: slide.media_poster_url_ar,
                    meta: { slideIndex: idx, slideLang: "ar" },
                  });
                }
                if (slide.media_url_en && /\.(mp4|webm|mov|m4v)$/i.test(slide.media_url_en)) {
                  entries.push({
                    id: `brand-${brand.id}-slide-${idx}-en`,
                    brandId: brand.id,
                    brandName: brand.name,
                    brandSlug: brand.slug,
                    sourceType: "hero_slide",
                    title: `${isAr ? "شريحة واجهة (إنجليزي)" : "Hero Slide (EN)"} #${idx + 1}`,
                    videoUrl: slide.media_url_en,
                    posterUrl: slide.media_poster_url_en,
                    meta: { slideIndex: idx, slideLang: "en" },
                  });
                }
              }
            });
          }
        }
      }

      // Query products with video media
      const { data: products, error: productsError } = await (supabase.from("products") as any)
        .select("id, brand_id, name, name_ar, name_en, media")
        .order("created_at", { ascending: false });

      if (productsError) throw productsError;

      // Map brand id to brand details
      const brandMap = new Map<string, any>((brands ?? []).map((b: any) => [b.id, b]));

      for (const prod of products ?? []) {
        if (Array.isArray(prod.media)) {
          prod.media.forEach((item: any, mIdx: number) => {
            if (item.type === "video" && item.url) {
              const b = brandMap.get(prod.brand_id) as any;
              entries.push({
                id: `prod-${prod.id}-media-${mIdx}`,
                brandId: prod.brand_id,
                brandName: b?.name || "Unknown Brand",
                brandSlug: b?.slug || "",
                sourceType: "product",
                title: `${isAr ? "منتج:" : "Product:"} ${prod.name_ar || prod.name_en || prod.name || "Untitled"} (#${mIdx + 1})`,
                videoUrl: item.url,
                posterUrl: item.poster_url,
                meta: { productId: prod.id, mediaIndex: mIdx },
              });
            }
          });
        }
      }

      return entries;
    },
    staleTime: 60_000,
  });

  const optimizeSingleEntry = async (entry: VideoEntry) => {
    try {
      setProcessingId(entry.id);
      setProgressMap((prev) => ({ ...prev, [entry.id]: 0 }));

      // 1. Fetch current video blob
      const response = await fetch(entry.videoUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status} fetching video`);
      const blob = await response.blob();
      const file = new File([blob], "video.mp4", { type: blob.type || "video/mp4" });

      // 2. Run WebCodecs optimization with high (1080p) preset
      const result = await optimizeVideo(file, {
        preset: "high",
        onProgress: (pct) => setProgressMap((prev) => ({ ...prev, [entry.id]: pct })),
      });

      if (!result.wasCompressed) {
        setStatusMap((prev) => ({
          ...prev,
          [entry.id]: {
            status: "skipped",
            message: isAr ? "الفيديو مُحسّن بالفعل" : "Already optimized",
          },
        }));
        return;
      }

      // 3. Upload optimized video & poster to R2
      const [newVideoUrl, newPosterUrl] = await Promise.all([
        uploadPublicMedia(
          entry.brandId,
          result.file,
          entry.sourceType === "product" ? "product" : "hero",
        ),
        result.posterBlob && result.posterBlob.size > 0
          ? uploadPublicMedia(
              entry.brandId,
              result.posterBlob,
              entry.sourceType === "product" ? "product" : "hero",
            )
          : Promise.resolve(null),
      ]);

      // 4. Update Database
      if (entry.sourceType === "hero_background") {
        const { data: bData } = await (supabase.from("brands") as any)
          .select("hero_media")
          .eq("id", entry.brandId)
          .single();
        const currentHero = bData?.hero_media || {};
        await (supabase.from("brands") as any)
          .update({
            hero_media: {
              ...currentHero,
              background: {
                type: "video",
                url: newVideoUrl,
                ...(newPosterUrl ? { posterUrl: newPosterUrl } : {}),
              },
            },
          })
          .eq("id", entry.brandId);
      } else if (entry.sourceType === "hero_slide" && entry.meta.slideIndex !== undefined) {
        const { data: bData } = await (supabase.from("brands") as any)
          .select("hero_media")
          .eq("id", entry.brandId)
          .single();
        const currentHero = bData?.hero_media || {};
        const slides = Array.isArray(currentHero.slides) ? [...currentHero.slides] : [];
        const idx = entry.meta.slideIndex;
        if (slides[idx]) {
          if (entry.meta.slideLang === "ar") {
            slides[idx] = {
              ...slides[idx],
              media_url_ar: newVideoUrl,
              media_url: newVideoUrl,
              ...(newPosterUrl
                ? { media_poster_url_ar: newPosterUrl, media_poster_url: newPosterUrl }
                : {}),
            };
          } else if (entry.meta.slideLang === "en") {
            slides[idx] = {
              ...slides[idx],
              media_url_en: newVideoUrl,
              media_url: newVideoUrl,
              ...(newPosterUrl
                ? { media_poster_url_en: newPosterUrl, media_poster_url: newPosterUrl }
                : {}),
            };
          } else {
            slides[idx] = {
              ...slides[idx],
              media_url: newVideoUrl,
              ...(newPosterUrl ? { media_poster_url: newPosterUrl } : {}),
            };
          }
          await (supabase.from("brands") as any)
            .update({
              hero_media: {
                ...currentHero,
                slides,
              },
            })
            .eq("id", entry.brandId);
        }
      } else if (
        entry.sourceType === "product" &&
        entry.meta.productId &&
        entry.meta.mediaIndex !== undefined
      ) {
        const { data: pData } = await (supabase.from("products") as any)
          .select("media")
          .eq("id", entry.meta.productId)
          .single();
        const media = Array.isArray(pData?.media) ? [...pData.media] : [];
        const mIdx = entry.meta.mediaIndex;
        if (media[mIdx]) {
          media[mIdx] = {
            ...media[mIdx],
            url: newVideoUrl,
            ...(newPosterUrl ? { poster_url: newPosterUrl } : {}),
          };
          await (supabase.from("products") as any).update({ media }).eq("id", entry.meta.productId);
        }
      }

      setStatusMap((prev) => ({
        ...prev,
        [entry.id]: {
          status: "success",
          message: isAr
            ? `وفّر ${result.savingsPercent}% (1080p FastStart)`
            : `-${result.savingsPercent}% (1080p FastStart)`,
        },
      }));
    } catch (err: any) {
      setStatusMap((prev) => ({
        ...prev,
        [entry.id]: {
          status: "error",
          message: err?.message || (isAr ? "فشل التحسين" : "Optimization failed"),
        },
      }));
    } finally {
      setProcessingId(null);
    }
  };

  const handleBatchReoptimize = async () => {
    setIsBatchRunning(true);
    let successCount = 0;
    for (const entry of videoEntries) {
      if (statusMap[entry.id]?.status === "success") continue;
      await optimizeSingleEntry(entry);
      successCount++;
    }
    setIsBatchRunning(false);
    qc.invalidateQueries({ queryKey: ["super-admin-video-reoptimizer-list"] });
    toast.success(
      isAr
        ? `اكتملت معالجة الفيديوهات (${successCount})`
        : `Completed video batch optimization (${successCount})`,
    );
  };

  return (
    <Card className="rounded-xl border border-border bg-card shadow-sm">
      <CardHeader className="pb-3 border-b border-border-subtle">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
              <Film className="h-4 w-4 text-primary" />
              {isAr
                ? "أداة إعادة تحسين فيديوهات المنصة (WebCodecs FastStart)"
                : "Platform Video Optimizer Utility"}
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              {isAr
                ? "فحص وتحويل جميع مقاطع الفيديو المخزنة في R2 إلى صيغة MP4 FastStart بدقة 1080p مباشرة في المتصفح لضمان التشغيل الفوري بأقل استهلاك للباقة."
                : "Scan and re-transcode all brand R2 videos into FastStart MP4 at 1080p in the browser for instant range playback."}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isLoading || isBatchRunning || !!processingId}
              className="h-9 px-3 text-xs gap-1.5"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
              {isAr ? "تحديث القائمة" : "Refresh"}
            </Button>
            {videoEntries.length > 0 && (
              <Button
                type="button"
                size="sm"
                onClick={handleBatchReoptimize}
                disabled={isBatchRunning || !!processingId}
                className="h-9 px-4 text-xs gap-1.5 bg-primary text-primary-foreground font-semibold"
              >
                {isBatchRunning ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                {isAr ? "تحسين كافة الفيديوهات" : "Optimize All Videos"}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-xs">
              {isAr ? "جارٍ مسح فيديوهات المتاجر..." : "Scanning store videos..."}
            </p>
          </div>
        ) : videoEntries.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <Video className="h-8 w-8 mx-auto opacity-30 mb-2" />
            <p className="text-xs font-medium text-foreground">
              {isAr ? "لا توجد فيديوهات بحاجة إلى تحسين" : "No videos found across stores"}
            </p>
            <p className="text-xs opacity-75 mt-0.5">
              {isAr
                ? "جميع الفيديوهات مُحسّنة أو لم يتم رفع أي فيديو بعد."
                : "All videos are up to date or none have been uploaded."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground flex items-center justify-between">
              <span>
                {isAr
                  ? `إجمالي المقاطع المكتشفة: ${videoEntries.length}`
                  : `Total detected video clips: ${videoEntries.length}`}
              </span>
              <Badge variant="outline" className="text-[10px] font-mono">
                WebCodecs FastStart H.264
              </Badge>
            </div>
            <div className="divide-y divide-border border border-border rounded-lg overflow-hidden bg-background">
              {videoEntries.map((entry) => {
                const isCurrent = processingId === entry.id;
                const progress = progressMap[entry.id] ?? 0;
                const status = statusMap[entry.id];

                return (
                  <div
                    key={entry.id}
                    className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs hover:bg-muted/30 transition-colors"
                  >
                    <div className="space-y-1 min-w-0 max-w-xl">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary" className="text-[10px] font-semibold">
                          {entry.brandName} ({entry.brandSlug})
                        </Badge>
                        <span className="font-semibold text-foreground truncate">
                          {entry.title}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground text-[11px]">
                        <a
                          href={entry.videoUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:underline flex items-center gap-1 font-mono text-[10px] truncate max-w-xs"
                          title={entry.videoUrl}
                        >
                          <ExternalLink className="h-3 w-3 shrink-0" />
                          {entry.videoUrl.split("/").pop()}
                        </a>
                      </div>
                      {isCurrent && (
                        <div className="space-y-1 pt-1 max-w-xs">
                          <div className="flex justify-between text-[10px] text-muted-foreground">
                            <span>
                              {isAr ? "جاري المعالجة والرفع..." : "Processing & uploading..."}
                            </span>
                            <span>{progress}%</span>
                          </div>
                          <Progress value={progress} className="h-1.5" />
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {status && (
                        <div className="flex items-center gap-1">
                          {status.status === "success" && (
                            <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[10px] gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              {status.message}
                            </Badge>
                          )}
                          {status.status === "skipped" && (
                            <Badge variant="outline" className="text-[10px] text-muted-foreground">
                              {status.message}
                            </Badge>
                          )}
                          {status.status === "error" && (
                            <Badge variant="destructive" className="text-[10px] gap-1">
                              <AlertCircle className="h-3 w-3" />
                              {status.message}
                            </Badge>
                          )}
                        </div>
                      )}

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isCurrent || isBatchRunning}
                        onClick={() => optimizeSingleEntry(entry)}
                        className="h-8 px-3 text-xs gap-1"
                      >
                        {isCurrent ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Sparkles className="h-3 w-3 text-primary" />
                        )}
                        {isAr ? "تحسين" : "Optimize"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
