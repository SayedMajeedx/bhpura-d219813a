import { AlertTriangle, Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FORMATS } from "@/features/content-studio/lib/studio-content";
import { TemplatePlayer } from "@/features/content-studio/components/TemplatePlayer";
import type { ContentStudio } from "@/features/content-studio/hooks/use-content-studio";
import { TemplateExportActions } from "@/features/content-studio/components/TemplateExportActions";

/**
 * The live preview (see TemplatePlayer), with the output size and length, what to check before
 * sharing, and on a phone the export and the caption right under it.
 */
export function TemplatePreview({ studio }: { studio: ContentStudio }) {
  const {
    isAr,
    format,
    activeTemplate,
    buildScene,
    photo,
    isCurrentVideo,
    setStillAt,
    checks,
    copiedCaption,
    handleCopyCaption,
  } = studio;
  const { width: outW, height: outH } = FORMATS[format];
  const duration = activeTemplate?.duration ?? 1;

  return (
    <div
      id="studio-preview"
      className="w-full min-w-0 max-w-full overflow-hidden rounded-2xl sm:rounded-[28px] border border-border-strong bg-muted/30 p-3 sm:p-7 xl:sticky xl:top-4 self-start shadow-xs"
    >
      <div className="mb-3 sm:mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p
            className={cn(
              "text-xs font-bold text-muted-foreground",
              !isAr && "uppercase tracking-[.15em]",
            )}
          >
            {isAr ? "معاينة متحركة" : "Animated preview"}
          </p>
          <p className="mt-0.5 sm:mt-1 text-xs sm:text-sm font-semibold text-foreground">
            <span dir="ltr" className="font-mono tabular-nums">
              {outW} × {outH} px · {duration} s
            </span>
          </p>
        </div>
      </div>

      {activeTemplate && (
        <TemplatePlayer
          template={activeTemplate}
          buildScene={buildScene}
          outW={outW}
          outH={outH}
          videoUrl={isCurrentVideo ? photo : null}
          isAr={isAr}
          label={`${isAr ? activeTemplate.name.ar : activeTemplate.name.en} — ${isAr ? "معاينة" : "preview"}`}
          className="max-w-[570px]"
          frameClassName="rounded-[22px] shadow-2xl"
          onPausedAt={setStillAt}
        />
      )}

      {checks.length > 0 && (
        <ul
          aria-label={isAr ? "قبل النشر" : "Before you post"}
          className="mx-auto mt-3 max-w-[570px] space-y-1.5"
        >
          {checks.map((check) => (
            <li
              key={check.key}
              className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground"
            >
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden="true" />
              <span className="min-w-0 break-words">{check.text}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Below a wide screen the post is saved or shared right under it, with its caption. */}
      {!studio.wide && (
        <div className="mx-auto mt-3 flex max-w-[570px] flex-wrap items-center justify-center gap-2">
          <TemplateExportActions studio={studio} />
          <Button
            type="button"
            variant="outline"
            onClick={handleCopyCaption}
            className="h-10 gap-2 rounded-xl text-xs font-semibold"
          >
            {copiedCaption ? (
              <Check className="size-4 text-success" aria-hidden="true" />
            ) : (
              <Copy className="size-4 text-primary" aria-hidden="true" />
            )}
            {isAr ? "نسخ كابشن انستقرام" : "Copy Instagram Caption"}
          </Button>
        </div>
      )}
    </div>
  );
}
