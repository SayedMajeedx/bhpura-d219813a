"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Check,
  CheckCircle2,
  Film,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  UploadCloud,
  Video,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  getStoredVideoPreset,
  setStoredVideoPreset,
  VIDEO_PRESETS,
  type VideoPresetKey,
  optimizeVideo,
  type OptimizedVideoResult,
} from "@/lib/video-optimizer";
import { toast } from "sonner";

export interface VideoOptimizerDialogProps {
  open: boolean;
  file: File | null;
  brandId?: string;
  title?: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: (result: OptimizedVideoResult) => Promise<void> | void;
  onCancel?: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export function VideoOptimizerDialog({
  open,
  file,
  brandId,
  title,
  onOpenChange,
  onConfirm,
  onCancel,
}: VideoOptimizerDialogProps) {
  const { lang, dir } = useI18n();
  const isAr = lang === "ar";
  const isRTL = dir === "rtl";
  const dialogTitleId = useId();

  const [selectedPreset, setSelectedPreset] = useState<VideoPresetKey>(() =>
    getStoredVideoPreset(brandId),
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressStatus, setProgressStatus] = useState("");
  const [optimizedResult, setOptimizedResult] = useState<OptimizedVideoResult | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);

  // Sync stored preset when brandId changes
  useEffect(() => {
    setSelectedPreset(getStoredVideoPreset(brandId));
  }, [brandId]);

  // Clean up preview object URL on unmount or file reset
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  // Reset dialog state when new file arrives or dialog opens
  useEffect(() => {
    if (open) {
      setIsProcessing(false);
      setProgress(0);
      setProgressStatus("");
      setOptimizedResult(null);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    }
  }, [open, file]);

  const handleSelectPreset = (presetKey: VideoPresetKey) => {
    if (isProcessing) return;
    setSelectedPreset(presetKey);
    setStoredVideoPreset(brandId, presetKey);

    // If already optimized, invalidate previous result so merchant re-optimizes with new preset
    if (optimizedResult && optimizedResult.preset !== presetKey) {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
      setOptimizedResult(null);
    }
  };

  const runOptimization = async (): Promise<OptimizedVideoResult | null> => {
    if (!file) return null;

    try {
      setIsProcessing(true);
      setProgress(0);

      const statusMap: Record<VideoPresetKey, { ar: string; en: string }> = {
        high: {
          ar: "جارٍ تحويل الفيديو (1080p عالي الجودة)…",
          en: "Converting video (1080p high quality)…",
        },
        balanced: {
          ar: "جارٍ تحويل الفيديو (720p متوازن)…",
          en: "Converting video (720p balanced)…",
        },
        original: {
          ar: "جارٍ تجهيز الملف الأصلي (FastStart)…",
          en: "Preparing original video (FastStart)…",
        },
      };

      setProgressStatus(isAr ? statusMap[selectedPreset].ar : statusMap[selectedPreset].en);

      const result = await optimizeVideo(file, {
        preset: selectedPreset,
        onProgress: (percent) => {
          setProgress(percent);
        },
      });

      setOptimizedResult(result);

      // Create preview object URL for the 5-second preview
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      const newPreviewUrl = URL.createObjectURL(result.file);
      setPreviewUrl(newPreviewUrl);

      return result;
    } catch (err: any) {
      toast.error(
        err?.message ||
          (isAr ? "فشل تحسين الفيديو، يُرجى المحاولة مرة أخرى" : "Video optimization failed"),
      );
      return null;
    } finally {
      setIsProcessing(false);
    }
  };

  const handleOptimizeAndPreview = async () => {
    await runOptimization();
  };

  const handleConfirmUpload = async () => {
    if (!file) return;

    let resultToCommit = optimizedResult;
    if (!resultToCommit) {
      resultToCommit = await runOptimization();
    }

    if (!resultToCommit) return;

    try {
      setIsUploading(true);
      await onConfirm(resultToCommit);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message || (isAr ? "فشل رفع الفيديو" : "Failed to upload video"));
    } finally {
      setIsUploading(false);
    }
  };

  const togglePreviewPlay = () => {
    if (!videoPreviewRef.current) return;
    if (isPlayingPreview) {
      videoPreviewRef.current.pause();
      setIsPlayingPreview(false);
    } else {
      videoPreviewRef.current.currentTime = 0;
      videoPreviewRef.current
        .play()
        .then(() => setIsPlayingPreview(true))
        .catch(() => setIsPlayingPreview(false));
    }
  };

  // Limit preview playback to 5 seconds
  const handleTimeUpdate = () => {
    if (!videoPreviewRef.current) return;
    if (videoPreviewRef.current.currentTime >= 5.0) {
      videoPreviewRef.current.pause();
      videoPreviewRef.current.currentTime = 0;
      setIsPlayingPreview(false);
    }
  };

  const originalSizeText = useMemo(() => {
    return file ? formatBytes(file.size) : "0 B";
  }, [file]);

  const optimizedSizeText = useMemo(() => {
    return optimizedResult ? formatBytes(optimizedResult.optimizedSizeBytes) : null;
  }, [optimizedResult]);

  return (
    <Dialog open={open} onOpenChange={(val) => !isProcessing && !isUploading && onOpenChange(val)}>
      <DialogContent
        className="sm:max-w-xl max-h-[90vh] overflow-y-auto"
        dir={isRTL ? "rtl" : "ltr"}
      >
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Film className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle id={dialogTitleId} className="text-lg font-semibold">
                {title || (isAr ? "تحسين وتجهيز الفيديو للرفع" : "Optimize Video for Web Delivery")}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                {isAr
                  ? "ترميز عالي الدقة (WebCodecs H.264) وبدء تشغيل فوري FastStart بأقل استهلاك للبيانات"
                  : "WebCodecs H.264 encoding with FastStart for instant playback and minimal data usage"}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {file && (
          <div className="space-y-4 py-2">
            {/* File Info Bar */}
            <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 p-3 text-sm">
              <div className="flex items-center gap-2 min-w-0 pe-2">
                <Video className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate font-medium text-foreground text-xs sm:text-sm">
                  {file.name}
                </span>
              </div>
              <div className="shrink-0 text-xs font-semibold text-muted-foreground">
                <span className="text-foreground">{originalSizeText}</span>
              </div>
            </div>

            {/* Preset Selector */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground">
                {isAr ? "اختر دقة وضغط الفيديو:" : "Select Video Quality & Preset:"}
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {(["high", "balanced", "original"] as VideoPresetKey[]).map((key) => {
                  const preset = VIDEO_PRESETS[key];
                  const isSelected = selectedPreset === key;
                  const isRecommended = key === "high";

                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={isProcessing || isUploading}
                      onClick={() => handleSelectPreset(key)}
                      className={cn(
                        "relative flex flex-col justify-between rounded-md border p-3 text-start transition-all cursor-pointer min-h-[92px]",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                        isSelected
                          ? "border-primary bg-primary/5 shadow-sm"
                          : "border-border hover:bg-muted/50 text-muted-foreground",
                      )}
                    >
                      {isRecommended && (
                        <span className="absolute top-2 end-2 inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary">
                          <Sparkles className="h-2.5 w-2.5" />
                          {isAr ? "موصى به" : "Recommended"}
                        </span>
                      )}

                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 font-semibold text-xs sm:text-sm text-foreground">
                          {isSelected && <Check className="h-3.5 w-3.5 text-primary" />}
                          <span>{isAr ? preset.labelAr : preset.labelEn}</span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-snug line-clamp-2">
                          {isAr ? preset.descriptionAr : preset.descriptionEn}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Real-time Progress Bar */}
            {isProcessing && (
              <div className="rounded-md border border-border bg-muted/20 p-4 space-y-2.5">
                <div className="flex items-center justify-between text-xs font-medium">
                  <span className="flex items-center gap-2 text-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                    {progressStatus}
                  </span>
                  <span className="font-mono text-primary font-semibold">{progress}%</span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>
            )}

            {/* Transcode Result & 5-Second Preview */}
            {optimizedResult && previewUrl && (
              <div className="space-y-3 rounded-md border border-primary/30 bg-primary/5 p-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    <span>
                      {isAr
                        ? `تم تحسين الفيديو بنجاح (${VIDEO_PRESETS[optimizedResult.preset].labelAr})`
                        : `Video optimized (${VIDEO_PRESETS[optimizedResult.preset].labelEn})`}
                    </span>
                  </div>

                  {optimizedResult.wasCompressed && optimizedResult.savingsPercent > 0 && (
                    <span className="inline-flex items-center rounded-full bg-success-subtle px-2 py-0.5 text-xs font-bold text-success">
                      {isAr
                        ? `وفّر ${optimizedResult.savingsPercent}%`
                        : `-${optimizedResult.savingsPercent}%`}
                    </span>
                  )}
                </div>

                {/* Size stats comparison */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded bg-background/80 p-2 border border-border-subtle">
                    <span className="text-muted-foreground block text-xs">
                      {isAr ? "الحجم الأصلي" : "Original size"}
                    </span>
                    <span className="font-semibold text-foreground">{originalSizeText}</span>
                  </div>
                  <div className="rounded bg-background/80 p-2 border border-border-subtle">
                    <span className="text-muted-foreground block text-xs">
                      {isAr ? "الحجم بعد التحسين" : "Optimized size"}
                    </span>
                    <span className="font-semibold text-success">{optimizedSizeText}</span>
                  </div>
                </div>

                {/* 5-second video preview */}
                <div className="relative overflow-hidden rounded-md border border-border bg-black aspect-video max-h-56 flex items-center justify-center">
                  <video
                    ref={videoPreviewRef}
                    src={previewUrl}
                    className="h-full w-full object-contain"
                    playsInline
                    muted
                    onTimeUpdate={handleTimeUpdate}
                    onEnded={() => setIsPlayingPreview(false)}
                  />

                  <button
                    type="button"
                    onClick={togglePreviewPlay}
                    aria-label={
                      isPlayingPreview
                        ? isAr
                          ? "إيقاف مؤقت"
                          : "Pause"
                        : isAr
                          ? "تشغيل المعاينة"
                          : "Play Preview"
                    }
                    className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/40 transition-colors group cursor-pointer"
                  >
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-background/90 text-foreground shadow-md transition-transform group-hover:scale-105">
                      {isPlayingPreview ? (
                        <Pause className="h-5 w-5" />
                      ) : (
                        <Play className="h-5 w-5 fill-current translate-x-0.5" />
                      )}
                    </div>
                  </button>

                  <div className="absolute bottom-2 end-2 rounded bg-black/70 px-1.5 py-0.5 text-xs text-white font-mono">
                    {isAr ? "معاينة 5 ثوانٍ" : "5s Preview"}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0 pt-2">
          <Button
            type="button"
            variant="outline"
            disabled={isProcessing || isUploading}
            onClick={() => {
              onCancel?.();
              onOpenChange(false);
            }}
          >
            {isAr ? "إلغاء" : "Cancel"}
          </Button>

          {!optimizedResult ? (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={isProcessing || isUploading || !file}
                onClick={handleOptimizeAndPreview}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="me-2 h-4 w-4 animate-spin" />
                    {isAr ? "جارٍ التحسين…" : "Optimizing…"}
                  </>
                ) : (
                  <>
                    <Film className="me-2 h-4 w-4" />
                    {isAr ? "معاينة الضغط" : "Preview Quality"}
                  </>
                )}
              </Button>

              <Button
                type="button"
                variant="default"
                disabled={isProcessing || isUploading || !file}
                onClick={handleConfirmUpload}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="me-2 h-4 w-4 animate-spin" />
                    {isAr ? "جارٍ الرفع…" : "Uploading…"}
                  </>
                ) : (
                  <>
                    <UploadCloud className="me-2 h-4 w-4" />
                    {isAr ? "تحسين ورفع مباشر" : "Optimize & Upload"}
                  </>
                )}
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isProcessing || isUploading}
                onClick={() => {
                  setOptimizedResult(null);
                  if (previewUrl) {
                    URL.revokeObjectURL(previewUrl);
                    setPreviewUrl(null);
                  }
                }}
              >
                <RotateCcw className="me-1.5 h-3.5 w-3.5" />
                {isAr ? "إعادة الضبط" : "Re-configure"}
              </Button>

              <Button
                type="button"
                variant="default"
                disabled={isUploading}
                onClick={handleConfirmUpload}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="me-2 h-4 w-4 animate-spin" />
                    {isAr ? "جارٍ الرفع…" : "Uploading…"}
                  </>
                ) : (
                  <>
                    <UploadCloud className="me-2 h-4 w-4" />
                    {isAr ? "تأكيد ورفع الفيديو" : "Confirm & Upload"}
                  </>
                )}
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
