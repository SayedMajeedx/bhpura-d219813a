import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n";
import { uploadPublicMedia } from "@/lib/r2-upload";
import { optimizeVideo } from "@/lib/video-optimizer";
import { toast } from "sonner";
import {
  invalidateVideoSources,
  listVideoEntries,
  mediaOptimizerQueries,
  replaceHeroVideo,
  replaceProductVideo,
  type VideoEntry,
} from "@/lib/data/media-optimizer";
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
  const { data: sources, isLoading, refetch } = useQuery(mediaOptimizerQueries.sources());
  const videoEntries = useMemo(
    () => (sources ? listVideoEntries(sources, isAr ? "ar" : "en") : []),
    [sources, isAr],
  );

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

      // 4. Update Database (a failed read or write marks the entry failed)
      const optimized = { videoUrl: newVideoUrl, posterUrl: newPosterUrl };
      if (entry.sourceType === "product") await replaceProductVideo(entry, optimized);
      else await replaceHeroVideo(entry, optimized);

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
    invalidateVideoSources(qc);
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
              <Badge variant="outline" className="text-xs font-mono">
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
                        <Badge variant="secondary" className="text-xs font-semibold">
                          {entry.brandName} ({entry.brandSlug})
                        </Badge>
                        <span className="font-semibold text-foreground truncate">
                          {entry.title}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground text-xs">
                        <a
                          href={entry.videoUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:underline flex items-center gap-1 font-mono text-xs truncate max-w-xs"
                          title={entry.videoUrl}
                        >
                          <ExternalLink className="h-3 w-3 shrink-0" />
                          {entry.videoUrl.split("/").pop()}
                        </a>
                      </div>
                      {isCurrent && (
                        <div className="space-y-1 pt-1 max-w-xs">
                          <div className="flex justify-between text-xs text-muted-foreground">
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
                            <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-xs gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              {status.message}
                            </Badge>
                          )}
                          {status.status === "skipped" && (
                            <Badge variant="outline" className="text-xs text-muted-foreground">
                              {status.message}
                            </Badge>
                          )}
                          {status.status === "error" && (
                            <Badge variant="destructive" className="text-xs gap-1">
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
