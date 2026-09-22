import { useState, useEffect } from "react";
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
  isAbayaSizeGuide,
} from "../../../lib/size-guide";

interface SizeRecommenderProps {
  guide: SizeGuide;
  currentUnit: SizeGuideUnit;
  onRecommendSize?: (size: string) => void;
}

export function SizeRecommender({ guide, currentUnit, onRecommendSize }: SizeRecommenderProps) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const isAbaya = isAbayaSizeGuide(guide);

  // Local unit state (syncs with parent but can be toggled locally directly inside the recommender)
  const [selectedUnit, setSelectedUnit] = useState<SizeGuideUnit>(() => {
    return currentUnit === "none" ? guide.base_unit : currentUnit;
  });

  useEffect(() => {
    if (currentUnit !== "none") {
      setSelectedUnit(currentUnit);
    }
  }, [currentUnit]);

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
      userMeasurements: numericMeasurements,
      inputUnit: selectedUnit === "none" ? guide.base_unit : selectedUnit,
    });
    setRecommendation(rec);
    setHasCalculated(true);
  };

  const unitLabel = selectedUnit === "in" ? (isAr ? "إنش" : "in") : isAr ? "سم" : "cm";
  const showUnitToggle = guide.base_unit !== "none";

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4 shadow-sm">
      {/* Header with Title and Unit Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-2">
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
                ? `أدخل قياساتك بالـ (${unitLabel}) وسنقترح المقاس الأنسب لك بدقة`
                : `Enter your measurements in (${unitLabel}) for an instant transparent recommendation`}
            </p>
          </div>
        </div>

        {showUnitToggle && (
          <div className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5">
            <Button
              type="button"
              variant={selectedUnit === "cm" ? "default" : "ghost"}
              size="sm"
              className="h-6 text-xs px-2.5 rounded-md"
              onClick={() => {
                setSelectedUnit("cm");
                setHasCalculated(false);
              }}
            >
              {isAr ? "سم" : "cm"}
            </Button>
            <Button
              type="button"
              variant={selectedUnit === "in" ? "default" : "ghost"}
              size="sm"
              className="h-6 text-xs px-2.5 rounded-md"
              onClick={() => {
                setSelectedUnit("in");
                setHasCalculated(false);
              }}
            >
              {isAr ? "إنش" : "in"}
            </Button>
          </div>
        )}
      </div>

      {/* Input Fields */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {measurementCols.map((col) => {
          const key = col.measurement_key!;
          const label = isAr ? col.label_ar : col.label_en;
          const isLengthCol = key === "length" || key === "height";

          let placeholder = "0";
          if (isLengthCol && isAbaya) {
            placeholder = selectedUnit === "in" ? (isAr ? "54 أو 160 سم" : "54 or 160 cm") : "160";
          }

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
                placeholder={placeholder}
                value={inputs[key] ?? ""}
                onChange={(e) => handleInputChange(key, e.target.value)}
                className="h-9 text-xs bg-background"
              />
              {isLengthCol && isAbaya && selectedUnit === "in" && (
                <p className="text-xs text-muted-foreground leading-tight">
                  {isAr ? "طول العباية أو طول القامة بالسم" : "Abaya length or height in cm"}
                </p>
              )}
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
          {/* Smart Auto-detected Height Notification */}
          {recommendation.autoDetectedHeight && (
            <div className="flex items-start gap-2 text-xs text-primary bg-primary/10 p-2.5 rounded-lg border border-primary/20">
              <Sparkles className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">
                  {isAr ? "تم التعرف على طول القامة تلقائياً:" : "Auto-detected Body Height:"}
                </span>{" "}
                <span>
                  {isAr
                    ? `أدخلتِ (${recommendation.autoDetectedHeight.heightCm} سم)، وتم احتساب مقاس العباية المقابل له (${recommendation.autoDetectedHeight.suggestedAbayaSize}) بدقة.`
                    : `Entered (${recommendation.autoDetectedHeight.heightCm} cm), mapped to abaya size (${recommendation.autoDetectedHeight.suggestedAbayaSize}).`}
                </span>
              </div>
            </div>
          )}

          {/* Valid Size Recommendation */}
          {recommendation.size ? (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {isAr ? "المقاس المقترح:" : "Recommended Size:"}
                  </span>
                  <span className="text-base font-bold text-primary px-2.5 py-0.5 rounded bg-primary/10 border border-primary/20">
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

              {/* Dimension Conflict Advice */}
              {recommendation.dimensionConflict && (
                <div className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300 bg-amber-500/10 p-2.5 rounded-lg border border-amber-500/20">
                  <Info className="h-4 w-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                  <div className="leading-relaxed">
                    {isAr
                      ? recommendation.dimensionConflictNote_ar
                      : recommendation.dimensionConflictNote_en}
                  </div>
                </div>
              )}

              {/* Between Sizes Advice */}
              {recommendation.between && !recommendation.dimensionConflict && (
                <div className="flex items-start gap-1.5 text-xs text-muted-foreground bg-secondary/50 p-2 rounded">
                  <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-primary" />
                  <span>
                    {isAr
                      ? `قياساتك تقع بين مقاسين (${recommendation.between[0]} و ${recommendation.between[1]}). نقترح اختيار المقاس الأكبر (${recommendation.size}) لراحة أكبر.`
                      : `You fall between sizes (${recommendation.between[0]} and ${recommendation.between[1]}). We recommend the larger size (${recommendation.size}) for comfort.`}
                  </span>
                </div>
              )}

              {/* Direct Select Button - ONLY rendered when size is valid and not out-of-bounds */}
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
          ) : recommendation.oversize ? (
            /* True Oversize Safe Advisory - NO direct select button */
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3.5 space-y-2">
              <div className="flex items-start gap-2 text-xs text-destructive font-medium">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-destructive">
                    {isAr
                      ? `القياسات المدخلة أكبر من المقاسات الجاهزة المتوفرة (أكبر من مقاس ${recommendation.maxAvailableSize || "60"})`
                      : `Entered measurements exceed standard available sizes (larger than size ${recommendation.maxAvailableSize || "60"})`}
                  </p>
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    {isAr
                      ? "لا يتوفر مقاس جاهز يطابق قياساتك، وننصح بطلب تفصيل خاص أو التواصل مباشرة مع المتجر لتفصيل المقاس الأنسب."
                      : "No standard ready-to-wear size matches your measurements. Custom tailoring or contacting the store directly is recommended."}
                  </p>
                </div>
              </div>
            </div>
          ) : recommendation.undersize ? (
            /* True Undersize Safe Advisory - NO direct select button */
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3.5 space-y-2">
              <div className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300 font-medium">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold">
                    {isAr
                      ? `القياسات المدخلة أصغر من المقاسات الجاهزة المتوفرة (أصغر من مقاس ${recommendation.minAvailableSize || "50"})`
                      : `Entered measurements are smaller than available sizes (smaller than size ${recommendation.minAvailableSize || "50"})`}
                  </p>
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    {isAr
                      ? "القياسات المدخلة أصغر من المقاسات الجاهزة في الجدول. ننصح بطلب تفصيل خاص أو التواصل مع المتجر."
                      : "Measurements are below the smallest ready size. Custom tailoring is recommended."}
                  </p>
                </div>
              </div>
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
