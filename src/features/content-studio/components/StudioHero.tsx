import {
  Check,
  Copy,
  Download,
  Palette,
  Sparkles,
  Video,
  Image as LucideImage,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ContentStudio } from "@/features/content-studio/hooks/use-content-studio";

/** The page header: what the studio does, the caption copy and the export actions. */
export function StudioHero({ studio }: { studio: ContentStudio }) {
  const {
    isAr,
    brandNameEn,
    productsQ,
    isCurrentVideo,
    exporting,
    exportProgress,
    downloadOriginalVideo,
    exportImageCreative,
    exportVideoCreative,
    exportCreative,
    copiedCaption,
    handleCopyCaption,
  } = studio;
  return (
    <section className="relative overflow-hidden rounded-2xl sm:rounded-[24px] border border-border-strong bg-card p-4 sm:p-6 lg:p-8 shadow-xs">
      <div className="absolute inset-y-0 end-0 w-72 bg-[radial-gradient(circle_at_center,hsl(var(--primary)/.12),transparent_70%)] pointer-events-none" />
      <div className="relative flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <span className="grid size-11 sm:size-12 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
            <Palette className="size-5" />
          </span>
          <div className="min-w-0">
            <div className="mb-0.5 sm:mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-[.18em] text-primary">
              <Sparkles className="size-3.5 shrink-0" />
              <span className="truncate">{brandNameEn} Content Studio</span>
            </div>
            <h1 className="font-display text-xl sm:text-2xl lg:text-3xl font-black text-foreground">
              {isAr ? "من المنتج إلى محتوى جاهز للنشر" : "From product to publish-ready creative"}
            </h1>
            <p className="mt-0.5 sm:mt-1 max-w-2xl text-xs sm:text-sm text-muted-foreground line-clamp-2 sm:line-clamp-none">
              {isAr
                ? "استديو بصري يحافظ على هوية البراند ويصدّر المقاس الصحيح لكل منصة."
                : "A focused visual studio that protects your brand language and exports the right social size."}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={handleCopyCaption}
            size="default"
            className="h-10 gap-2 rounded-xl border-border bg-background/80 text-xs font-semibold px-3.5 sm:px-4 shadow-2xs hover:bg-muted/50"
          >
            {copiedCaption ? (
              <Check className="size-4 text-emerald-600" />
            ) : (
              <Copy className="size-4 text-primary" />
            )}
            <span>{isAr ? "نسخ كابشن انستقرام" : "Copy Instagram Caption"}</span>
          </Button>
          {isCurrentVideo ? (
            <div className="flex items-center shadow-2xs">
              <Button
                onClick={exportCreative}
                disabled={exporting || productsQ.isLoading}
                size="default"
                className="h-10 gap-2 rounded-s-xl rounded-e-none text-xs font-semibold px-3.5 sm:px-4"
              >
                <Video className="size-4" />
                <span>
                  {exporting
                    ? exportProgress > 0
                      ? isAr
                        ? `جارٍ التصدير (${exportProgress}%)…`
                        : `Exporting (${exportProgress}%)…`
                      : isAr
                        ? "جارٍ التجهيز…"
                        : "Preparing…"
                    : isAr
                      ? "تنزيل فيديو MP4"
                      : "Download Video (MP4)"}
                </span>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    disabled={exporting || productsQ.isLoading}
                    size="default"
                    className="h-10 px-2.5 rounded-s-none rounded-e-xl border-s border-primary-foreground/20 text-xs"
                    aria-label={isAr ? "خيارات التنزيل" : "Download options"}
                  >
                    <ChevronDown className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align={isAr ? "start" : "end"} className="w-60">
                  <DropdownMenuItem
                    onClick={exportVideoCreative}
                    disabled={exporting}
                    className="gap-2.5 cursor-pointer py-2"
                  >
                    <Video className="size-4 text-primary shrink-0" />
                    <div className="flex flex-col">
                      <span className="font-semibold text-xs">
                        {isAr ? "تنزيل فيديو مصمم (MP4)" : "Branded Video (MP4)"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {isAr
                          ? "فيديو مع القالب والشعار والأسعار"
                          : "Video with layout, branding & price"}
                      </span>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={downloadOriginalVideo}
                    disabled={exporting}
                    className="gap-2.5 cursor-pointer py-2"
                  >
                    <Download className="size-4 text-muted-foreground shrink-0" />
                    <div className="flex flex-col">
                      <span className="font-semibold text-xs">
                        {isAr ? "تنزيل الفيديو الأصلي الخام" : "Original Raw Video"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {isAr
                          ? "ملف الفيديو الأصلي بدون إضافات"
                          : "Source MP4 file without overlays"}
                      </span>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={exportImageCreative}
                    disabled={exporting}
                    className="gap-2.5 cursor-pointer py-2"
                  >
                    <LucideImage className="size-4 text-muted-foreground shrink-0" />
                    <div className="flex flex-col">
                      <span className="font-semibold text-xs">
                        {isAr ? "تنزيل لقطة كصورة (PNG)" : "Snapshot Frame (PNG)"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {isAr ? "صورة ثابتة للتصميم الحالي" : "Still image of current frame"}
                      </span>
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : (
            <Button
              onClick={exportCreative}
              disabled={exporting || productsQ.isLoading}
              size="default"
              className="h-10 gap-2 rounded-xl text-xs font-semibold px-3.5 sm:px-4 shadow-2xs"
            >
              <Download className="size-4" />
              <span>
                {exporting
                  ? isAr
                    ? "جارٍ التصدير…"
                    : "Exporting…"
                  : isAr
                    ? "تنزيل PNG"
                    : "Download PNG"}
              </span>
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
