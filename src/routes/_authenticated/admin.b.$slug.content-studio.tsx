import { createFileRoute } from "@tanstack/react-router";
import { Eye, Sliders } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useContentStudio } from "@/features/content-studio/hooks/use-content-studio";
import { StudioHero } from "@/features/content-studio/components/StudioHero";
import { ProductMediaPicker } from "@/features/content-studio/components/ProductMediaPicker";
import { FormatStylePicker } from "@/features/content-studio/components/FormatStylePicker";
import { HeaderBrandingPanel } from "@/features/content-studio/components/HeaderBrandingPanel";
import { CopyPanel } from "@/features/content-studio/components/CopyPanel";
import { StudioPreview } from "@/features/content-studio/components/StudioPreview";
import { TemplatePicker } from "@/features/content-studio/components/TemplatePicker";
import { TemplatePreview } from "@/features/content-studio/components/TemplatePreview";
export const Route = createFileRoute("/_authenticated/admin/b/$slug/content-studio")({
  component: ContentStudioPage,
});

/**
 * The content studio: pick a product and a look, edit the copy, and export a
 * post or story. State lives in useContentStudio; each section is a component.
 */
function ContentStudioPage() {
  const { slug } = Route.useParams();
  const studio = useContentStudio(slug);
  const { isAr } = studio;
  return (
    <div
      className="mx-auto w-full min-w-0 max-w-[1500px] space-y-4 sm:space-y-6 p-2 sm:p-4 pb-32 sm:pb-16 overflow-x-hidden"
      dir={isAr ? "rtl" : "ltr"}
    >
      <StudioHero studio={studio} />

      <div className="grid w-full min-w-0 max-w-full items-start gap-4 sm:gap-6 lg:gap-8 xl:grid-cols-[minmax(460px,520px)_1fr]">
        <Card
          id="studio-controls"
          className="w-full min-w-0 max-w-full overflow-hidden rounded-2xl sm:rounded-[24px] border border-border-strong bg-card shadow-xs"
        >
          <div className="border-b border-border-subtle p-4 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-display text-base sm:text-lg font-bold text-foreground">
                  {isAr ? "اتجاه التصميم" : "Creative direction"}
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {isAr
                    ? "كل تعديل يظهر مباشرة في المعاينة."
                    : "Every change appears instantly in the preview."}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    document
                      .getElementById("studio-preview")
                      ?.scrollIntoView({ behavior: "smooth" });
                  }}
                  className="xl:hidden h-8 px-2.5 gap-1.5 text-xs font-semibold rounded-xl text-primary border-primary/30 bg-primary/5 hover:bg-primary/10 cursor-pointer"
                >
                  <Eye className="size-3.5" />
                  <span>{isAr ? "المعاينة" : "Preview"}</span>
                </Button>
                <span className="grid size-8 place-items-center rounded-xl bg-primary/10 text-primary shrink-0">
                  <Sliders className="size-4" />
                </span>
              </div>
            </div>
          </div>
          <div className="space-y-5 p-4 sm:space-y-6 sm:p-6 min-w-0">
            <TemplatePicker studio={studio} />
            <ProductMediaPicker studio={studio} />

            <FormatStylePicker studio={studio} />

            {/* Visual Separation Divider */}
            <div className="pt-2">
              <Separator className="bg-border/60" />
            </div>

            {/* Header & Branding Bar Customization Card */}
            <HeaderBrandingPanel studio={studio} />
            <CopyPanel studio={studio} />
          </div>
        </Card>

        {/* Live Preview Stage */}
        {studio.activeTemplate ? (
          <TemplatePreview studio={studio} />
        ) : (
          <StudioPreview studio={studio} />
        )}
      </div>
    </div>
  );
}
