import { ChevronDown, GalleryHorizontal, Image as ImageIcon, Layers, Video, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ContentStudio } from "@/features/content-studio/hooks/use-content-studio";
import { BatchExportDialog } from "@/features/content-studio/components/BatchExportDialog";

/**
 * Export buttons for an animated template: the MP4 (with progress and a
 * cancel) and a still PNG. Where the browser cannot encode video, the PNG.
 */
export function TemplateExportActions({ studio }: { studio: ContentStudio }) {
  const {
    isAr,
    productsQ,
    templateExporting,
    templateProgress,
    mp4Supported,
    exportTemplateVideo,
    exportTemplateStill,
    exportTemplateSlides,
    cancelTemplateExport,
    activeTemplate,
    batchable,
    setBatchOpen,
  } = studio;
  const disabled = templateExporting || productsQ.isLoading;
  const hasSlides = Boolean(activeTemplate?.slideTimes);
  const slidesLabel = isAr ? "شرائح كاروسيل إنستغرام" : "Instagram carousel";
  const batchLabel = isAr ? "عدة منتجات دفعة واحدة" : "Several products at once";

  if (mp4Supported === false) {
    return (
      <div className="flex items-center gap-2">
        {batchable && (
          <Button
            variant="outline"
            onClick={() => setBatchOpen(true)}
            disabled={disabled}
            className="h-10 gap-2 rounded-xl text-xs font-semibold px-3.5 sm:px-4"
          >
            <Layers className="size-4" />
            {batchLabel}
          </Button>
        )}
        <BatchExportDialog studio={studio} />
        {hasSlides && (
          <Button
            variant="outline"
            onClick={() => void exportTemplateSlides()}
            disabled={disabled}
            className="h-10 gap-2 rounded-xl text-xs font-semibold px-3.5 sm:px-4"
          >
            <GalleryHorizontal className="size-4" />
            {slidesLabel}
          </Button>
        )}
        <Button
          onClick={() => void exportTemplateStill()}
          disabled={disabled}
          className="h-10 gap-2 rounded-xl text-xs font-semibold px-3.5 sm:px-4"
        >
          <ImageIcon className="size-4" />
          {isAr ? "تنزيل PNG" : "Download PNG"}
        </Button>
      </div>
    );
  }

  if (templateExporting && templateProgress > 0) {
    return (
      <div className="flex items-center gap-2">
        <div
          role="progressbar"
          aria-label={isAr ? "تقدم التصدير" : "Export progress"}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={templateProgress}
          className="h-10 min-w-40 overflow-hidden rounded-xl border border-border bg-muted"
        >
          <div
            className="flex h-full items-center bg-primary px-3 text-xs font-semibold text-primary-foreground transition-[width] duration-200"
            style={{ width: `${Math.max(templateProgress, 18)}%` }}
          >
            <span dir="ltr" className="tabular-nums">
              {templateProgress}%
            </span>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={cancelTemplateExport}
          aria-label={isAr ? "إلغاء التصدير" : "Cancel export"}
          className="size-10 rounded-xl"
        >
          <X />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center shadow-2xs">
      <Button
        onClick={() => void exportTemplateVideo()}
        disabled={disabled || mp4Supported === null}
        className="h-10 gap-2 rounded-s-xl rounded-e-none text-xs font-semibold px-3.5 sm:px-4"
      >
        <Video className="size-4" />
        {templateExporting
          ? isAr
            ? "جارٍ التجهيز…"
            : "Preparing…"
          : isAr
            ? "تنزيل فيديو MP4"
            : "Download Video (MP4)"}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            disabled={disabled}
            className="h-10 px-2.5 rounded-s-none rounded-e-xl border-s border-primary-foreground/20 text-xs"
            aria-label={isAr ? "خيارات التنزيل" : "Download options"}
          >
            <ChevronDown className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={isAr ? "start" : "end"} className="w-60">
          <DropdownMenuItem
            onClick={() => void exportTemplateStill()}
            className="gap-2.5 cursor-pointer py-2"
          >
            <ImageIcon className="size-4 text-muted-foreground shrink-0" />
            <div className="flex flex-col">
              <span className="font-semibold text-xs">
                {isAr ? "تنزيل لقطة كصورة (PNG)" : "Still image (PNG)"}
              </span>
              <span className="text-xs text-muted-foreground">
                {isAr ? "التصميم مكتملاً" : "The finished frame"}
              </span>
            </div>
          </DropdownMenuItem>
          {hasSlides && (
            <DropdownMenuItem
              onClick={() => void exportTemplateSlides()}
              className="gap-2.5 cursor-pointer py-2"
            >
              <GalleryHorizontal className="size-4 text-muted-foreground shrink-0" />
              <div className="flex flex-col">
                <span className="font-semibold text-xs">{slidesLabel}</span>
                <span className="text-xs text-muted-foreground">
                  {isAr ? "صورة 4:5 لكل منتج" : "One 4:5 image per product"}
                </span>
              </div>
            </DropdownMenuItem>
          )}
          {batchable && (
            <DropdownMenuItem
              onClick={() => setBatchOpen(true)}
              className="gap-2.5 cursor-pointer py-2"
            >
              <Layers className="size-4 text-muted-foreground shrink-0" />
              <div className="flex flex-col">
                <span className="font-semibold text-xs">{batchLabel}</span>
                <span className="text-xs text-muted-foreground">
                  {isAr ? "حتى ١٢ منتجاً في ملف واحد" : "Up to 12, all in one go"}
                </span>
              </div>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <BatchExportDialog studio={studio} />
    </div>
  );
}
