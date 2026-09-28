import { Sliders } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FORMATS } from "@/features/content-studio/lib/studio-content";
import { TemplatePlayer } from "@/features/content-studio/components/TemplatePlayer";
import type { ContentStudio } from "@/features/content-studio/hooks/use-content-studio";

/**
 * The live preview of an animated template (see TemplatePlayer), with the
 * output size and length, and a way back to the controls on small screens.
 */
export function TemplatePreview({ studio }: { studio: ContentStudio }) {
  const { isAr, format, activeTemplate, buildScene, photo, isCurrentVideo, setStillAt } = studio;
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
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            document.getElementById("studio-controls")?.scrollIntoView({ behavior: "smooth" })
          }
          className="xl:hidden h-8 px-2.5 gap-1.5 text-xs font-semibold rounded-xl"
        >
          <Sliders className="size-3.5" />
          <span>{isAr ? "التعديل" : "Edit"}</span>
        </Button>
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
    </div>
  );
}
