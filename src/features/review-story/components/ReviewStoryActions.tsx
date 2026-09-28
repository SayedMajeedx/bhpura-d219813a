import { Download, Film, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ReviewStoryState } from "@/features/review-story/hooks/use-review-story";

/**
 * The review story's downloads: the animated story as an MP4 (with progress
 * and a cancel) and a still PNG. Where the browser cannot encode video, the PNG.
 */
export function ReviewStoryActions({ story, isAr }: { story: ReviewStoryState; isAr: boolean }) {
  const {
    exporting,
    exportProgress,
    mp4Supported,
    exportVideo,
    exportStill,
    cancelExport,
    stillAt,
  } = story;

  if (exporting && exportProgress > 0) {
    return (
      <div className="flex items-center gap-2">
        <div
          role="progressbar"
          aria-label={isAr ? "تقدم التصدير" : "Export progress"}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={exportProgress}
          className="h-12 min-w-0 flex-1 overflow-hidden rounded-xl border border-border bg-muted"
        >
          <div
            className="flex h-full items-center bg-primary px-3 text-xs font-semibold text-primary-foreground transition-[width] duration-200"
            style={{ width: `${Math.max(exportProgress, 12)}%` }}
          >
            <span dir="ltr" className="tabular-nums">
              {exportProgress}%
            </span>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={cancelExport}
          aria-label={isAr ? "إلغاء التصدير" : "Cancel export"}
          className="size-12 rounded-xl"
        >
          <X />
        </Button>
      </div>
    );
  }

  const still = (primary: boolean) => (
    <Button
      variant={primary ? "default" : "outline"}
      className={primary ? "min-h-12 w-full gap-2 font-semibold" : "min-h-11 w-full gap-2 text-xs"}
      onClick={() => void exportStill()}
      disabled={exporting}
    >
      {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
      {primary
        ? isAr
          ? "تنزيل PNG للستوري (1080 × 1920)"
          : "Download story PNG (1080 × 1920)"
        : stillAt !== null
          ? isAr
            ? `أو تنزيل اللقطة عند ${stillAt.toFixed(1)} ث (PNG)`
            : `Or download the frame at ${stillAt.toFixed(1)} s (PNG)`
          : isAr
            ? "أو تنزيل كصورة ثابتة (PNG)"
            : "Or download static story (PNG)"}
    </Button>
  );

  if (mp4Supported === false) return <div className="space-y-2">{still(true)}</div>;

  return (
    <div className="space-y-2">
      <Button
        className="min-h-12 w-full gap-2 font-semibold"
        onClick={() => void exportVideo()}
        disabled={exporting || mp4Supported === null}
      >
        {exporting ? <Loader2 className="size-4 animate-spin" /> : <Film className="size-4" />}
        {exporting
          ? isAr
            ? "جارٍ التجهيز…"
            : "Preparing…"
          : isAr
            ? "تنزيل فيديو الستوري (MP4)"
            : "Download story video (MP4)"}
      </Button>
      {still(false)}
    </div>
  );
}
