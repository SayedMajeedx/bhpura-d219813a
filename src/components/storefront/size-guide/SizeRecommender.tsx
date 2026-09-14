import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Check, AlertCircle, Info } from "lucide-react";
import {
  type SizeGuide,
  type SizeGuideUnit,
  recommendSize,
  type SizeRecommendation,
} from "@/lib/size-guide";

interface SizeRecommenderProps {
  guide: SizeGuide;
  currentUnit: SizeGuideUnit;
  onRecommendSize?: (size: string) => void;
}

export function SizeRecommender({ guide, currentUnit, onRecommendSize }: SizeRecommenderProps) {
  const { lang } = useI18n();
  const isAr = lang === "ar";

  // Find columns that support measurement input
  const measurementCols = guide.columns.filter(
    (c) => c.kind === "measurement" && Boolean(c.measurement_key),
  );

  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [recommendation, setRecommendation] = useState<SizeRecommendation | null>(null);
  const [hasCalculated, setHasCalculated] = useState(false);

  if (measurementCols.length === 0) {
    return null;
  }

  const handleInputChange = (key: string, val: string) => {
    setInputs((prev) => ({ ...prev, [key]: val }));
    setHasCalculated(false);
  };

  const handleCalculate = () => {
    const numericMeasurements: Record<string, number> = {};
    for (const col of measurementCols) {
      const raw = inputs[col.measurement_key!];
      if (raw) {
        const parsed = parseFloat(raw);
        if (!isNaN(parsed) && parsed > 0) {
          numericMeasurements[col.measurement_key!] = parsed;
        }
      }
    }

    if (Object.keys(numericMeasurements).length === 0) {
      setRecommendation(null);
      setHasCalculated(true);
      return;
    }

    const rec = recommendSize({
      guide,
      measurements: numericMeasurements,
      unit: currentUnit === "none" ? guide.base_unit : currentUnit,
    });
    setRecommendation(rec);
    setHasCalculated(true);
  };

  const unitLabel = currentUnit === "in" ? (isAr ? "إنش" : "in") : isAr ? "سم" : "cm";

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4 shadow-sm">
      <div className="flex items-center gap-2">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
          <Sparkles className="h-4 w-4" />
        </div>
        <div>
          <h4 className="text-sm font-semibold text-foreground">
            {isAr ? "مُرشِّح المقاس الذكي" : "Smart Size Recommender"}
          </h4>
          <p className="text-xs text-muted-foreground">
            {isAr
              ? `أدخلي قياساتك بالـ (${unitLabel}) وسنقترح المقاس الأنسب لك بدقة`
              : `Enter your measurements in (${unitLabel}) for an instant transparent recommendation`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {measurementCols.map((col) => {
          const key = col.measurement_key!;
          const label = isAr ? col.label_ar : col.label_en;
          return (
            <div key={key} className="space-y-1">
              <Label className="text-xs text-foreground font-medium flex items-center justify-between">
                <span>{label}</span>
                <span className="text-muted-foreground text-xs">{unitLabel}</span>
              </Label>
              <Input
                type="number"
                step="0.5"
                min="0"
                placeholder="0"
                value={inputs[key] ?? ""}
                onChange={(e) => handleInputChange(key, e.target.value)}
                className="h-9 text-xs bg-background"
              />
            </div>
          );
        })}
      </div>

      <div className="flex justify-end">
        <Button type="button" size="sm" onClick={handleCalculate} className="gap-2 text-xs">
          <Sparkles className="h-3.5 w-3.5" />
          {isAr ? "احسب المقاس الأنسب" : "Find My Size"}
        </Button>
      </div>

      {hasCalculated && recommendation && (
        <div className="rounded-lg border border-border bg-muted/30 p-3.5 space-y-3 animate-in fade-in duration-200">
          {recommendation.size ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {isAr ? "المقاس المقترح:" : "Recommended Size:"}
                  </span>
                  <span className="text-base font-bold text-primary px-2 py-0.5 rounded bg-primary/10">
                    {recommendation.size}
                  </span>
                </div>
                <Badge
                  variant={
                    recommendation.confidence === "high"
                      ? "default"
                      : recommendation.confidence === "medium"
                        ? "secondary"
                        : "outline"
                  }
                  className="text-xs capitalize"
                >
                  {isAr
                    ? recommendation.confidence === "high"
                      ? "تطابق عالي"
                      : recommendation.confidence === "medium"
                        ? "تطابق متوسط"
                        : "تطابق تقريبي"
                    : `${recommendation.confidence} match`}
                </Badge>
              </div>

              {recommendation.between && (
                <div className="flex items-start gap-1.5 text-xs text-muted-foreground bg-secondary/50 p-2 rounded">
                  <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-primary" />
                  <span>
                    {isAr
                      ? `قياساتك تقع بين مقاسين (${recommendation.between[0]} و ${recommendation.between[1]}). نقترح اختيار المقاس الأكبر (${recommendation.size}) لراحة أكبر.`
                      : `You fall between sizes (${recommendation.between[0]} and ${recommendation.between[1]}). We recommend the larger size (${recommendation.size}) for comfort.`}
                  </span>
                </div>
              )}

              {recommendation.oversize && (
                <div className="flex items-start gap-1.5 text-xs text-destructive bg-destructive/10 p-2 rounded">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>
                    {isAr
                      ? "القياسات المدخلة أكبر من المقاسات الجاهزة المتوفرة. ننصح بطلب تفصيل خاص أو التواصل مع المتجر."
                      : "Measurements exceed standard ready-to-wear sizes. Custom tailoring is recommended."}
                  </span>
                </div>
              )}

              {onRecommendSize && (
                <div className="pt-1">
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    className="w-full text-xs gap-1.5"
                    onClick={() => onRecommendSize(recommendation.size!)}
                  >
                    <Check className="h-3.5 w-3.5" />
                    {isAr
                      ? `اختيار المقاس (${recommendation.size}) مباشرة`
                      : `Select Size (${recommendation.size})`}
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
              <span>
                {isAr
                  ? "يرجى إدخال قياس واحد على الأقل لحساب المقاس المناسب."
                  : "Please enter at least one measurement to calculate your size."}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
