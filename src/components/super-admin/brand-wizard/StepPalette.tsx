import * as React from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  FONT_MOOD_PRESETS,
  type FontMoodPreset,
} from "@/components/settings/QuickThemeCustomizer";
import {
  extractLogoPalette,
  derivePalette,
  ensureContrast,
  getContrastRatio,
  type PaletteMood,
} from "@/lib/logo-palette";
import type { BrandWizardData } from "./types";
import { Upload, Sparkles, Check, AlertCircle, RefreshCw } from "lucide-react";

interface StepPaletteProps {
  data: BrandWizardData;
  onChange: (patch: Partial<BrandWizardData>) => void;
  isAr: boolean;
}

export function StepPalette({ data, onChange, isAr }: StepPaletteProps) {
  const [extracting, setExtracting] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleLogoUpload = async (file: File) => {
    const previewUrl = URL.createObjectURL(file);
    setExtracting(true);

    try {
      const palette = await extractLogoPalette(file, data.mood);
      onChange({
        logoFile: file,
        logoPreviewUrl: previewUrl,
        palette,
        accentColor: palette.primary,
        secondaryColor: palette.secondary,
        textColor: palette.text,
        backgroundColor: palette.background,
      });
    } catch (err) {
      console.error("Error extracting palette:", err);
      onChange({
        logoFile: file,
        logoPreviewUrl: previewUrl,
      });
    } finally {
      setExtracting(false);
    }
  };

  const handleMoodChange = (newMood: PaletteMood) => {
    const derived = derivePalette(data.accentColor, data.secondaryColor, newMood);
    onChange({
      mood: newMood,
      accentColor: derived.primary,
      secondaryColor: derived.secondary,
      textColor: derived.text,
      palette: derived,
    });
  };

  const contrast = getContrastRatio(data.textColor, data.backgroundColor || "#ffffff");
  const isContrastPass = contrast >= 4.5;

  const handleFixContrast = () => {
    const fixedText = ensureContrast(data.textColor, data.backgroundColor || "#ffffff", 4.5);
    onChange({ textColor: fixedText });
  };

  return (
    <div className="space-y-6">
      {/* Logo Upload Section */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">
          {isAr ? "شعار البراند (Logo)" : "Brand Logo"}
        </Label>
        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-border hover:border-primary/60 rounded-xl p-5 text-center cursor-pointer transition-colors bg-muted/20 hover:bg-muted/40"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleLogoUpload(file);
            }}
          />

          {data.logoPreviewUrl ? (
            <div className="flex items-center justify-center gap-4">
              <img
                src={data.logoPreviewUrl}
                alt="Logo preview"
                className="h-16 w-16 object-contain rounded-lg border border-border bg-white p-1 shadow-sm"
              />
              <div className="text-start">
                <p className="text-sm font-medium text-foreground">
                  {data.logoFile?.name || (isAr ? "تم اختيار الشعار" : "Logo selected")}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {extracting
                    ? isAr
                      ? "جاري استخراج لوحة الألوان..."
                      : "Extracting color palette..."
                    : isAr
                    ? "انقر لاستبدال الشعار واستخراج الألوان مجدداً"
                    : "Click to change logo and re-extract colors"}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-2">
              <div className="p-3 bg-primary/10 text-primary rounded-full mb-2">
                <Upload className="h-5 w-5" />
              </div>
              <p className="text-sm font-medium text-foreground">
                {isAr ? "اسحب وأفلت الشعار هنا أو انقر للاختيار" : "Drop logo here or click to browse"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {isAr
                  ? "سيتم استخراج درجات الألوان المتناسقة تلقائياً من الشعار عبر خوارزمية ذكية"
                  : "Harmonic brand colors will be intelligently extracted from your logo"}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Color Palette Controls */}
      <div className="space-y-4 p-4 border border-border rounded-xl bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label className="text-sm font-semibold flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-primary" />
            {isAr ? "ألوان الهوية والواجهة" : "Brand Identity & Palette"}
          </Label>

          {/* Mood Selector */}
          <div className="flex items-center gap-1 bg-muted p-0.5 rounded-lg border border-border/60">
            {(["dominant", "muted", "bold"] as PaletteMood[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => handleMoodChange(m)}
                className={`text-xs px-2.5 py-1 rounded-md transition-all capitalize font-medium ${
                  data.mood === m
                    ? "bg-background text-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {isAr ? (m === "dominant" ? "أساسي" : m === "muted" ? "هادئ" : "جريء") : m}
              </button>
            ))}
          </div>
        </div>

        {/* Swatches & Color Pickers */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Primary / Accent */}
          <div className="space-y-1.5">
            <span className="text-xs text-muted-foreground block">
              {isAr ? "اللون الأساسي" : "Primary Accent"}
            </span>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={data.accentColor}
                onChange={(e) => {
                  const val = e.target.value;
                  const derived = derivePalette(val, data.secondaryColor, data.mood);
                  onChange({
                    accentColor: val,
                    textColor: derived.text,
                    palette: derived,
                  });
                }}
                className="h-8 w-10 rounded border border-border cursor-pointer p-0.5 bg-background"
              />
              <span className="text-xs font-mono text-foreground font-medium">
                {data.accentColor}
              </span>
            </div>
          </div>

          {/* Secondary */}
          <div className="space-y-1.5">
            <span className="text-xs text-muted-foreground block">
              {isAr ? "اللون الثانوي" : "Secondary Accent"}
            </span>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={data.secondaryColor}
                onChange={(e) => onChange({ secondaryColor: e.target.value })}
                className="h-8 w-10 rounded border border-border cursor-pointer p-0.5 bg-background"
              />
              <span className="text-xs font-mono text-foreground font-medium">
                {data.secondaryColor}
              </span>
            </div>
          </div>

          {/* Text Color */}
          <div className="space-y-1.5">
            <span className="text-xs text-muted-foreground block">
              {isAr ? "لون النصوص" : "Text Color"}
            </span>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={data.textColor}
                onChange={(e) => onChange({ textColor: e.target.value })}
                className="h-8 w-10 rounded border border-border cursor-pointer p-0.5 bg-background"
              />
              <span className="text-xs font-mono text-foreground font-medium">
                {data.textColor}
              </span>
            </div>
          </div>

          {/* Background */}
          <div className="space-y-1.5">
            <span className="text-xs text-muted-foreground block">
              {isAr ? "الخلفية" : "Background"}
            </span>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={data.backgroundColor}
                onChange={(e) => onChange({ backgroundColor: e.target.value })}
                className="h-8 w-10 rounded border border-border cursor-pointer p-0.5 bg-background"
              />
              <span className="text-xs font-mono text-foreground font-medium">
                {data.backgroundColor}
              </span>
            </div>
          </div>
        </div>

        {/* Contrast Checker Alert */}
        <div
          className={`flex items-center justify-between p-2.5 rounded-lg border text-xs ${
            isContrastPass
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
              : "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400"
          }`}
        >
          <div className="flex items-center gap-1.5">
            {isContrastPass ? (
              <Check className="h-4 w-4 shrink-0 text-emerald-600" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
            )}
            <span>
              {isContrastPass
                ? isAr
                  ? `نسبة تباين ممتازة (${contrast}:1) متوافقة مع معايير القراءة WCAG AA`
                  : `Passes WCAG AA readability (${contrast}:1)`
                : isAr
                ? `نسبة التباين منخفضة (${contrast}:1) قد تصعّب قراءة النصوص`
                : `Low contrast (${contrast}:1) may affect readability`}
            </span>
          </div>

          {!isContrastPass && (
            <button
              type="button"
              onClick={handleFixContrast}
              className="text-xs underline font-semibold hover:opacity-80 shrink-0"
            >
              {isAr ? "تصحيح تلقائي" : "Auto-fix"}
            </button>
          )}
        </div>
      </div>

      {/* Typography Presets */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">
          {isAr ? "طابع الخطوط (Typography Mood)" : "Typography Mood"}
        </Label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {FONT_MOOD_PRESETS.map((preset) => {
            const isSelected = data.fontPreset.id === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onChange({ fontPreset: preset })}
                className={`p-2.5 rounded-xl border text-start transition-all ${
                  isSelected
                    ? "border-primary bg-primary/10 ring-1 ring-primary shadow-xs"
                    : "border-border bg-card hover:bg-muted/40"
                }`}
              >
                <div className="font-semibold text-xs text-foreground">
                  {isAr ? preset.labelAr : preset.labelEn}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {preset.fontAr} / {preset.fontEn}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Radius Selector */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">
          {isAr ? "استدارة الحواف (Corner Radius)" : "Corner Radius"}
        </Label>
        <div className="grid grid-cols-4 gap-2">
          {[
            { id: "0.25rem", labelAr: "حادة", labelEn: "Sharp (4px)" },
            { id: "0.375rem", labelAr: "ناعمة", labelEn: "Soft (6px)" },
            { id: "0.5rem", labelAr: "قياسية", labelEn: "Standard (8px)" },
            { id: "0.75rem", labelAr: "دائرية", labelEn: "Curved (12px)" },
          ].map((r) => {
            const isSelected = data.radius === r.id;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => onChange({ radius: r.id })}
                className={`p-2 rounded-xl border text-center transition-all ${
                  isSelected
                    ? "border-primary bg-primary/10 ring-1 ring-primary font-medium"
                    : "border-border bg-card hover:bg-muted/40"
                }`}
              >
                <div className="text-xs text-foreground font-medium">
                  {isAr ? r.labelAr : r.labelEn}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
