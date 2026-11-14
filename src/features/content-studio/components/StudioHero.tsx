import { Check, Copy, Palette, Sparkles, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ContentStudio } from "@/features/content-studio/hooks/use-content-studio";
import { TemplateExportActions } from "@/features/content-studio/components/TemplateExportActions";
import { DraftsDialog } from "@/features/content-studio/components/DraftsDialog";
import { AddonSlot } from "@/components/addons/AddonSlot";

/** The page header: what the studio does, the caption copy and the export actions. */
export function StudioHero({ studio }: { studio: ContentStudio }) {
  const { isAr, brandNameEn, copiedCaption, handleCopyCaption, setDraftsOpen, draftsQ, openDraft } =
    studio;
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
          <AddonSlot placement="admin.contentStudio.action" />
          <Button
            type="button"
            variant="outline"
            onClick={() => setDraftsOpen(true)}
            className="h-10 gap-2 rounded-xl border-border bg-background/80 text-xs font-semibold px-3.5 sm:px-4 shadow-2xs hover:bg-muted/50"
          >
            <FolderOpen className="size-4 text-primary" />
            <span className="max-w-40 truncate">
              {openDraft ? openDraft.name : isAr ? "المسودات" : "Drafts"}
            </span>
            {!openDraft && (draftsQ.data?.length ?? 0) > 0 && (
              <span className="rounded-full bg-primary/10 px-1.5 text-xs tabular-nums text-primary">
                {draftsQ.data?.length}
              </span>
            )}
          </Button>
          <DraftsDialog studio={studio} />
          {studio.wide && (
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
          )}
          {/* Narrower screens have them under the post instead. */}
          {studio.wide && <TemplateExportActions studio={studio} />}
        </div>
      </div>
    </section>
  );
}
