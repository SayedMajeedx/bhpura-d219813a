import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { type SizeGuide, type SizeGuideUnit, formatCell } from "../../../lib/size-guide";
import { SizeRecommender } from "./SizeRecommender";
import { Ruler, HelpCircle, Video } from "lucide-react";

export interface SizeGuidePanelProps {
  guide: SizeGuide;
  selectedSize?: string | null;
  onSelectSize?: (size: string) => void;
  initialUnit?: SizeGuideUnit;
  showRecommender?: boolean;
}

export function SizeGuidePanel({
  guide,
  selectedSize,
  onSelectSize,
  initialUnit,
  showRecommender = true,
}: SizeGuidePanelProps) {
  const { lang } = useI18n();
  const isAr = lang === "ar";

  const [currentUnit, setCurrentUnit] = useState<SizeGuideUnit>(() => {
    if (initialUnit) return initialUnit;
    return guide.base_unit === "in" ? "in" : "cm";
  });

  const showUnitToggle = guide.base_unit !== "none";
  const guideName = isAr ? guide.name_ar : guide.name_en;
  const guideNotes = isAr ? guide.notes_ar : guide.notes_en;

  return (
    <div className="space-y-6">
      {/* Header Bar: Title + Unit Toggles */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
            <Ruler className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">{guideName}</h3>
            {showUnitToggle && (
              <p className="text-xs text-muted-foreground">
                {isAr
                  ? `القياسات معروضة حالياً بـ (${currentUnit === "in" ? "الإنش" : "السنتيمتر"})`
                  : `Measurements currently displayed in (${currentUnit === "in" ? "Inches" : "Centimeters"})`}
              </p>
            )}
          </div>
        </div>

        {showUnitToggle && (
          <div className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5">
            <Button
              type="button"
              variant={currentUnit === "cm" ? "default" : "ghost"}
              size="sm"
              className="h-7 text-xs px-2.5 rounded-md"
              onClick={() => setCurrentUnit("cm")}
            >
              {isAr ? "سم" : "cm"}
            </Button>
            <Button
              type="button"
              variant={currentUnit === "in" ? "default" : "ghost"}
              size="sm"
              className="h-7 text-xs px-2.5 rounded-md"
              onClick={() => setCurrentUnit("in")}
            >
              {isAr ? "إنش" : "in"}
            </Button>
          </div>
        )}
      </div>

      {/* Sizing Chart Table */}
      <div className="rounded-xl border border-border overflow-hidden bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left rtl:text-right border-collapse">
            <thead>
              <tr className="bg-muted/60 border-b border-border text-foreground font-semibold">
                <th className="sticky start-0 z-10 bg-muted/90 backdrop-blur px-3 py-2.5 min-w-[70px]">
                  {isAr ? "المقاس" : "Size"}
                </th>
                {guide.columns.map((col) => (
                  <th key={col.key} className="px-3 py-2.5 min-w-[90px] whitespace-nowrap">
                    {isAr ? col.label_ar : col.label_en}
                    {col.kind === "measurement" && showUnitToggle && (
                      <span className="ms-1 text-muted-foreground font-normal text-xs">
                        ({currentUnit === "in" ? (isAr ? "إنش" : "in") : isAr ? "سم" : "cm"})
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {guide.rows.map((row, idx) => {
                const isSelected = selectedSize && selectedSize.trim() === row.label.trim();
                return (
                  <tr
                    key={`${row.label}-${idx}`}
                    onClick={() => onSelectSize && onSelectSize(row.label)}
                    className={`transition-colors ${
                      isSelected
                        ? "bg-primary/10 font-semibold"
                        : onSelectSize
                          ? "hover:bg-muted/40 cursor-pointer"
                          : "hover:bg-muted/20"
                    }`}
                  >
                    <td
                      className={`sticky start-0 z-10 px-3 py-2.5 font-bold ${
                        isSelected
                          ? "bg-primary/15 text-primary border-s-2 border-primary"
                          : "bg-card text-foreground"
                      }`}
                    >
                      {row.label}
                    </td>
                    {guide.columns.map((col) => {
                      const formatted = formatCell(
                        row.values[col.key],
                        col,
                        guide.base_unit,
                        currentUnit,
                      );
                      return (
                        <td
                          key={col.key}
                          className="px-3 py-2.5 whitespace-nowrap text-muted-foreground"
                        >
                          {formatted}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Row Notes or General Notes */}
      {guideNotes && (
        <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground border border-border">
          {guideNotes}
        </div>
      )}

      {/* Recommender Widget */}
      {guide.recommender_enabled && showRecommender && (
        <SizeRecommender guide={guide} currentUnit={currentUnit} onRecommendSize={onSelectSize} />
      )}

      {/* How to Measure & Diagram Section */}
      {(guide.diagram_url || guide.how_to_measure.length > 0 || guide.video_url) && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-4">
          <div className="flex items-center gap-2">
            <HelpCircle className="h-4 w-4 text-primary" />
            <h4 className="text-sm font-semibold text-foreground">
              {isAr ? "طريقة أخذ القياسات الصحيحة" : "How to Take Your Measurements"}
            </h4>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
            {/* Steps */}
            {guide.how_to_measure.length > 0 && (
              <div className="space-y-3">
                {guide.how_to_measure.map((step, idx) => {
                  const title = isAr ? step.title_ar : step.title_en;
                  const body = isAr ? step.body_ar : step.body_en;
                  return (
                    <div key={idx} className="flex gap-3 items-start text-xs">
                      <div className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/10 text-primary font-bold text-xs">
                        {idx + 1}
                      </div>
                      <div className="space-y-0.5">
                        <p className="font-semibold text-foreground">{title}</p>
                        <p className="text-muted-foreground leading-relaxed">{body}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Diagram / Video */}
            <div className="space-y-3">
              {guide.diagram_url && (
                <div className="overflow-hidden rounded-lg border border-border bg-muted/20">
                  <img
                    src={guide.diagram_url}
                    alt={guideName}
                    className="w-full object-contain max-h-72"
                  />
                </div>
              )}
              {guide.video_url && (
                <a
                  href={guide.video_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                >
                  <Video className="h-3.5 w-3.5" />
                  {isAr ? "شاهد فيديو توضيحي لطريقة القياس" : "Watch measurement video guide"}
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
