import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useContentStudio } from "@/features/content-studio/hooks/use-content-studio";
import { StudioHero } from "@/features/content-studio/components/StudioHero";
import { ProductMediaPicker } from "@/features/content-studio/components/ProductMediaPicker";
import { FormatStylePicker } from "@/features/content-studio/components/FormatStylePicker";
import { TemplateBrandPanel } from "@/features/content-studio/components/TemplateBrandPanel";
import { CopyPanel } from "@/features/content-studio/components/CopyPanel";
import { TemplatePicker } from "@/features/content-studio/components/TemplatePicker";
import { TemplatePreview } from "@/features/content-studio/components/TemplatePreview";
import { LookbookPicker } from "@/features/content-studio/components/LookbookPicker";
import { DetailPointPicker } from "@/features/content-studio/components/DetailPointPicker";
import { OccasionPanel } from "@/features/content-studio/components/OccasionPanel";
import { MomentPanel } from "@/features/content-studio/components/MomentPanel";
import { LaunchPanel } from "@/features/content-studio/components/LaunchPanel";
import { HowToOrderPanel } from "@/features/content-studio/components/HowToOrderPanel";
import { MadeForYouPanel } from "@/features/content-studio/components/MadeForYouPanel";
import { isCollectionTemplate } from "@/features/content-studio/lib/lookbook";
import { TodayStrip } from "@/features/content-studio/components/TodayStrip";
import { BatchExportDialog } from "@/features/content-studio/components/BatchExportDialog";
export const Route = createFileRoute("/_authenticated/admin/b/$slug/content-studio")({
  component: ContentStudioRoute,
});

/** The studio, or on an address below it (a private add-on's page) that page. */
function ContentStudioRoute() {
  const { slug } = Route.useParams();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const studioPath = `/admin/b/${encodeURIComponent(slug)}/content-studio`;
  if (pathname.replace(/\/+$/, "") !== studioPath) return <Outlet />;
  return <ContentStudioPage slug={slug} />;
}

/**
 * The content studio: pick a product and a look, edit the copy, and export a
 * post or story. State lives in useContentStudio; each section is a component.
 */
function ContentStudioPage({ slug }: { slug: string }) {
  const studio = useContentStudio(slug);
  const { isAr } = studio;
  return (
    <div
      className="mx-auto w-full min-w-0 max-w-[1500px] space-y-4 sm:space-y-6 p-2 sm:p-4 pb-32 sm:pb-16 overflow-x-hidden"
      dir={isAr ? "rtl" : "ltr"}
    >
      <StudioHero studio={studio} />

      {/* A phone reads it top to bottom: what to post, the post, then the details to change.
          A wide screen keeps the post beside both. */}
      <div className="grid w-full min-w-0 max-w-full items-start gap-4 sm:gap-6 lg:gap-8 xl:grid-cols-[minmax(460px,520px)_minmax(0,1fr)]">
        <Card
          id="studio-controls"
          className="w-full min-w-0 max-w-full overflow-hidden rounded-2xl sm:rounded-[24px] border border-border-strong bg-card shadow-xs xl:col-start-1 xl:row-start-1"
        >
          <div className="space-y-5 p-4 sm:space-y-6 sm:p-6 min-w-0">
            <TodayStrip studio={studio} />
            <TemplatePicker studio={studio} />
            {/* The Lookbook, a Menu and a Bundle show several products, a greeting none; the rest one. */}
            {isCollectionTemplate(studio.templateId) ? (
              <LookbookPicker studio={studio} />
            ) : studio.templateId === "occasion-pack" ? (
              <OccasionPanel studio={studio} />
            ) : (
              <ProductMediaPicker studio={studio} />
            )}
          </div>
        </Card>

        <div className="min-w-0 xl:col-start-2 xl:row-span-2 xl:row-start-1 xl:self-start">
          <TemplatePreview studio={studio} />
        </div>

        <StudioDetails studio={studio} />
      </div>
      <BatchExportDialog studio={studio} />
    </div>
  );
}

/**
 * Everything else a post can change: the template's own panel, the size and look, the logo and
 * the words. Folded on a phone (the post is made from the three choices above), open on a wide
 * screen.
 */
function StudioDetails({ studio }: { studio: ReturnType<typeof useContentStudio> }) {
  const { isAr, wide } = studio;
  const [opened, setOpen] = useState(false);
  const open = wide || opened;
  return (
    <Card className="w-full min-w-0 max-w-full overflow-hidden rounded-2xl sm:rounded-[24px] border border-border-strong bg-card shadow-xs xl:col-start-1 xl:row-start-2">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={wide}
        aria-expanded={open}
        aria-controls="studio-details"
        className="flex w-full items-center justify-between gap-3 p-4 text-start sm:p-6 disabled:cursor-default"
      >
        <span className="min-w-0">
          <span className="block font-display text-base sm:text-lg font-bold text-foreground">
            {isAr ? "تعديل التصميم والكلام" : "Design and words"}
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {isAr
              ? "المقاس والألوان والشعار والعنوان والكابشن."
              : "Size, colours, logo, headline and caption."}
          </span>
        </span>
        {!wide && (
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
            aria-hidden="true"
          />
        )}
      </button>
      <div
        id="studio-details"
        className={cn(
          "space-y-5 px-4 pb-4 sm:space-y-6 sm:px-6 sm:pb-6 min-w-0",
          !open && "hidden",
        )}
      >
        {studio.templateId === "detail-zoom" && <DetailPointPicker studio={studio} />}
        {/* Last Chance's day and code, Back in Stock's shelf, Customer Favourite's reviews. */}
        <MomentPanel studio={studio} />
        {/* Coming Soon's launch day and secret. */}
        <LaunchPanel studio={studio} />
        {/* How to Order's steps, from the store's settings. */}
        <HowToOrderPanel studio={studio} />
        {/* Made for You's made-to-order pieces and making time. */}
        <MadeForYouPanel studio={studio} />
        <FormatStylePicker studio={studio} />
        <Separator className="bg-border/60" />
        {/* The logo's size and colour, for every template. */}
        <TemplateBrandPanel studio={studio} />
        {/* A greeting has its own words (in the occasion panel), not the product's copy. */}
        {studio.templateId !== "occasion-pack" && <CopyPanel studio={studio} />}
      </div>
    </Card>
  );
}
