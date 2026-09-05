import * as React from "react";
import { ArrowLeftRight, Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface FontMoodPreset {
  id: string;
  labelEn: string;
  labelAr: string;
  fontAr: string;
  fontEn: string;
  descriptionEn: string;
  descriptionAr: string;
}

export const FONT_MOOD_PRESETS: FontMoodPreset[] = [
  {
    id: "classic",
    labelEn: "Classic",
    labelAr: "كلاسيكي",
    fontAr: "Amiri",
    fontEn: "Playfair Display",
    descriptionEn: "Heritage & luxury vibe",
    descriptionAr: "فخامة وأصالة راقية",
  },
  {
    id: "modern",
    labelEn: "Modern",
    labelAr: "عصري",
    fontAr: "Cairo",
    fontEn: "Inter",
    descriptionEn: "Clean & contemporary",
    descriptionAr: "وضوح وبساطة حديثة",
  },
  {
    id: "signature",
    labelEn: "Signature",
    labelAr: "توقيع مميز",
    fontAr: "Tajawal",
    fontEn: "Cormorant Garamond",
    descriptionEn: "Boutique & editorial",
    descriptionAr: "طابع بوتيك حصري",
  },
  {
    id: "strong",
    labelEn: "Strong",
    labelAr: "جريء وقوي",
    fontAr: "Almarai",
    fontEn: "Montserrat",
    descriptionEn: "Bold & confident",
    descriptionAr: "حضور واثق ومباشر",
  },
  {
    id: "bubble",
    labelEn: "Bubble",
    labelAr: "مرح وحيوي",
    fontAr: "Changa",
    fontEn: "Poppins",
    descriptionEn: "Playful & youthful",
    descriptionAr: "عفوي وجذاب للشباب",
  },
];

export interface QuickThemeCustomizerProps {
  primaryColor: string;
  secondaryColor: string;
  radius: string;
  currentFontAr: string;
  currentFontEn: string;
  isAr: boolean;
  onPrimaryChange: (val: string) => void;
  onSecondaryChange: (val: string) => void;
  onRadiusChange: (val: string) => void;
  onSelectFontPreset: (preset: FontMoodPreset) => void;
  onSwapColors: () => void;
}

export function QuickThemeCustomizer({
  primaryColor,
  secondaryColor,
  radius,
  currentFontAr,
  currentFontEn,
  isAr,
  onPrimaryChange,
  onSecondaryChange,
  onRadiusChange,
  onSelectFontPreset,
  onSwapColors,
}: QuickThemeCustomizerProps) {
  // Normalize radius to sharp / smooth / round
  const activeRadiusPreset = React.useMemo(() => {
    if (radius === "0" || radius === "0px" || radius === "0rem") return "sharp";
    if (radius === "1.25rem" || radius === "1.5rem" || radius === "2rem") return "round";
    return "smooth"; // 0.5rem, 0.75rem, 1rem default
  }, [radius]);

  const cornerPresets = [
    {
      id: "sharp",
      value: "0px",
      labelEn: "Sharp",
      labelAr: "حاد (Sharp)",
      previewClass: "rounded-none",
    },
    {
      id: "smooth",
      value: "0.5rem",
      labelEn: "Smooth",
      labelAr: "ناعم (Smooth)",
      previewClass: "rounded-lg",
    },
    {
      id: "round",
      value: "1.25rem",
      labelEn: "Round",
      labelAr: "دائري (Round)",
      previewClass: "rounded-2xl",
    },
  ];

  return (
    <div className="space-y-6 rounded-xl border border-border bg-card p-4 sm:p-6 shadow-sm">
      {/* Header Info */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <h3 className="font-semibold text-base text-foreground">
              {isAr ? "المظهر السريع لمتجرك" : "Your Store, Your Style"}
            </h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {isAr
              ? "اختر لونين أساسيين، نمط الحواف، ونبرة الخط — ويتحدث متجرك فورياً ليطابق هويتك بكل مكان."
              : "Pick brand colors, corner style, and typography mood — your storefront updates to match everywhere."}
          </p>
        </div>
      </div>

      {/* 1. Brand Colors */}
      <div className="space-y-3 pt-2">
        <Label className="text-sm font-medium">
          {isAr ? "1. ألوان الهوية (Brand Colors)" : "1. Brand Colors"}
        </Label>
        <div className="flex flex-wrap items-center gap-4">
          {/* Primary Swatch */}
          <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-2 min-w-[160px]">
            <label
              className="relative size-10 shrink-0 cursor-pointer overflow-hidden rounded-md border border-border shadow-sm ring-1 ring-border/50 transition-transform active:scale-95"
              style={{ backgroundColor: primaryColor || "#000000" }}
              title={isAr ? "تغيير اللون الأساسي" : "Change primary color"}
            >
              <input
                type="color"
                value={primaryColor || "#000000"}
                onChange={(e) => onPrimaryChange(e.target.value)}
                className="absolute inset-0 size-full cursor-pointer opacity-0"
              />
            </label>
            <div className="min-w-0">
              <span className="block text-xs font-semibold text-foreground">
                {isAr ? "اللون الأساسي" : "Primary"}
              </span>
              <span className="block font-mono text-[11px] text-muted-foreground uppercase">
                {primaryColor || "#000000"}
              </span>
            </div>
          </div>

          {/* Swap Button */}
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={onSwapColors}
            title={isAr ? "تبديل اللونين" : "Swap colors"}
            className="size-9 rounded-full shrink-0"
          >
            <ArrowLeftRight className="size-4 text-muted-foreground" />
          </Button>

          {/* Secondary Swatch */}
          <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-2 min-w-[160px]">
            <label
              className="relative size-10 shrink-0 cursor-pointer overflow-hidden rounded-md border border-border shadow-sm ring-1 ring-border/50 transition-transform active:scale-95"
              style={{ backgroundColor: secondaryColor || "#1f1f1f" }}
              title={isAr ? "تغيير اللون الثانوي" : "Change secondary color"}
            >
              <input
                type="color"
                value={secondaryColor || "#1f1f1f"}
                onChange={(e) => onSecondaryChange(e.target.value)}
                className="absolute inset-0 size-full cursor-pointer opacity-0"
              />
            </label>
            <div className="min-w-0">
              <span className="block text-xs font-semibold text-foreground">
                {isAr ? "اللون الثانوي" : "Secondary"}
              </span>
              <span className="block font-mono text-[11px] text-muted-foreground uppercase">
                {secondaryColor || "#1f1f1f"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Corner Radius Style */}
      <div className="space-y-3 border-t border-border/60 pt-4">
        <Label className="text-sm font-medium">
          {isAr ? "2. انحناء الحواف والبطاقات (Corner Style)" : "2. Corner Style"}
        </Label>
        <div className="grid grid-cols-3 gap-3">
          {cornerPresets.map((preset) => {
            const isSelected = activeRadiusPreset === preset.id;
            return (
              <Button
                key={preset.id}
                type="button"
                variant={isSelected ? "default" : "outline"}
                onClick={() => onRadiusChange(preset.value)}
                className={cn(
                  "h-14 flex-col justify-center gap-1 border-2 transition-all",
                  isSelected
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                    : "border-border hover:bg-muted/50",
                )}
              >
                <div
                  className={cn(
                    "size-4 border-2 border-current transition-all",
                    preset.previewClass,
                  )}
                />
                <span className="text-xs font-semibold">
                  {isAr ? preset.labelAr : preset.labelEn}
                </span>
              </Button>
            );
          })}
        </div>
      </div>

      {/* 3. Typography Mood Presets */}
      <div className="space-y-3 border-t border-border/60 pt-4">
        <Label className="text-sm font-medium">
          {isAr ? "3. نبرة وطابع الخط (Typography Vibe)" : "3. Typography Vibe"}
        </Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {FONT_MOOD_PRESETS.map((preset) => {
            const isSelected =
              currentFontAr.toLowerCase().includes(preset.fontAr.toLowerCase()) ||
              currentFontEn.toLowerCase().includes(preset.fontEn.toLowerCase());

            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onSelectFontPreset(preset)}
                className={cn(
                  "relative flex flex-col items-start gap-1 p-3.5 rounded-xl border-2 text-start transition-all",
                  isSelected
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-border hover:border-muted-foreground/30 bg-card",
                )}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="font-bold text-sm text-foreground">
                    {isAr ? preset.labelAr : preset.labelEn}
                  </span>
                  {isSelected && (
                    <span className="size-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0">
                      <Check className="size-3 stroke-[2.5]" />
                    </span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {isAr ? preset.descriptionAr : preset.descriptionEn}
                </span>
                <div className="mt-2 text-[11px] font-mono text-muted-foreground/80 flex items-center gap-2">
                  <span className="px-1.5 py-0.5 rounded bg-muted">
                    {isAr ? preset.fontAr : preset.fontEn}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
