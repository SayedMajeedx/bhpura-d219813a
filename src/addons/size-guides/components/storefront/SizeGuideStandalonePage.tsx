import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Ruler, ArrowLeft, ArrowRight } from "lucide-react";
import { useStorefront } from "@/lib/storefront-context";
import { type SizeGuide } from "../../lib/size-guide";
import { ABAYA_GULF_TEMPLATE } from "../../lib/size-guide-templates";
import { SizeGuidePanel } from "./size-guide/SizeGuidePanel";
import { Button } from "@/components/ui/button";

export function SizeGuideStandalonePage() {
  const { brand, lang, t, sizeGuides } = useStorefront();
  const isAr = lang === "ar";

  const fallbackGuide: SizeGuide = {
    id: "fallback-default",
    brand_id: brand.id,
    name_ar: ABAYA_GULF_TEMPLATE.name_ar,
    name_en: ABAYA_GULF_TEMPLATE.name_en,
    template_key: ABAYA_GULF_TEMPLATE.key,
    base_unit: ABAYA_GULF_TEMPLATE.base_unit,
    columns: ABAYA_GULF_TEMPLATE.columns,
    rows: ABAYA_GULF_TEMPLATE.rows,
    how_to_measure: ABAYA_GULF_TEMPLATE.how_to_measure,
    diagram_url: null,
    video_url: null,
    recommender_enabled: true,
    placement: "both",
    notes_ar: ABAYA_GULF_TEMPLATE.notes_ar ?? null,
    notes_en: ABAYA_GULF_TEMPLATE.notes_en ?? null,
    is_default: true,
    is_active: true,
    sort_order: 0,
    created_at: "",
    updated_at: "",
  };

  const activeGuides = (sizeGuides || []).filter((g) => g.is_active);
  const displayGuides = activeGuides.length > 0 ? activeGuides : [fallbackGuide];
  const [selectedGuideId, setSelectedGuideId] = useState<string>(
    displayGuides[0]?.id || fallbackGuide.id,
  );

  const currentGuide = displayGuides.find((g) => g.id === selectedGuideId) || displayGuides[0];

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="mb-6">
        <Link
          to="/$slug"
          params={{ slug: brand.slug }}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          {isAr ? <ArrowRight className="h-3.5 w-3.5" /> : <ArrowLeft className="h-3.5 w-3.5" />}
          <span>{isAr ? "العودة للمتجر" : "Back to store"}</span>
        </Link>

        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Ruler className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold">
              {t("دليل المقاسات", "Size Guide")}
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              {t(
                "جداول المقاسات وإرشادات القياس الدقيقة لاختيار المقاس المثالي",
                "Size charts and measurement guides to help you pick the perfect fit",
              )}
            </p>
          </div>
        </div>
      </div>

      {displayGuides.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-6 border-b border-border">
          {displayGuides.map((guide) => {
            const isSelected = guide.id === currentGuide.id;
            const name = isAr ? guide.name_ar : guide.name_en;
            return (
              <Button
                key={guide.id}
                type="button"
                variant={isSelected ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedGuideId(guide.id)}
                className="shrink-0 h-9 rounded-full text-xs"
              >
                {name}
              </Button>
            );
          })}
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card p-4 sm:p-8 shadow-xs">
        <div className="mb-4">
          <h2 className="text-lg font-bold text-foreground">
            {isAr ? currentGuide.name_ar : currentGuide.name_en}
          </h2>
        </div>

        <SizeGuidePanel guide={currentGuide} />
      </div>
    </main>
  );
}

export default SizeGuideStandalonePage;
