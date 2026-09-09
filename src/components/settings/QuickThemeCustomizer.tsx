import * as React from "react";
import { ArrowLeftRight, Check, Sparkles, Layers, Tag } from "lucide-react";
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
    labelAr: "كلاسيكي فاخر",
    fontAr: "Amiri",
    fontEn: "Playfair Display",
    descriptionEn: "Heritage & luxury vibe",
    descriptionAr: "فخامة وأصالة راقية",
  },
  {
    id: "modern",
    labelEn: "Modern",
    labelAr: "عصري وبسيط",
    fontAr: "Cairo",
    fontEn: "Inter",
    descriptionEn: "Clean & contemporary",
    descriptionAr: "وضوح وبساطة حديثة",
  },
  {
    id: "signature",
    labelEn: "Signature",
    labelAr: "توقيع بوتيك",
    fontAr: "Tajawal",
    fontEn: "Cormorant Garamond",
    descriptionEn: "Boutique & editorial",
    descriptionAr: "طابع بوتيك حصري وأنيق",
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
  headerGlass?: boolean;
  badgeAccent?: string;
  isAr: boolean;
  onPrimaryChange: (val: string) => void;
  onSecondaryChange: (val: string) => void;
  onRadiusChange: (val: string) => void;
  onSelectFontPreset: (preset: FontMoodPreset) => void;
  onSwapColors: () => void;
  onHeaderGlassChange?: (val: boolean) => void;
  onBadgeAccentChange?: (val: string) => void;
}

export function QuickThemeCustomizer({
  primaryColor,
  secondaryColor,
  radius,
  currentFontAr,
  currentFontEn,
  headerGlass = true,
  badgeAccent = "maroon",
  isAr,
  onPrimaryChange,
  onSecondaryChange,
  onRadiusChange,
  onSelectFontPreset,
  onSwapColors,
  onHeaderGlassChange,
  onBadgeAccentChange,
}: QuickThemeCustomizerProps) {
  // Normalize radius to sharp / smooth / round matching storefront route
  const activeRadiusPreset = React.useMemo(() => {
    if (radius === "0" || radius === "0px" || radius === "0rem") return "sharp";
    if (radius === "1rem" || radius === "1.25rem" || radius === "1.5rem" || radius === "2rem")
      return "round";
    return "smooth"; // 0.375rem, 0.5rem default
  }, [radius]);

  const cornerPresets = [
    {
      id: "sharp",
      value: "0px",
      labelEn: "Sharp (0px)",
      labelAr: "مستقيم حاد (0px)",
      previewClass: "rounded-none",
    },
    {
      id: "smooth",
      value: "0.375rem",
      labelEn: "Smooth (6px)",
      labelAr: "انسيابي ناعم (6px)",
      previewClass: "rounded-lg",
    },
    {
      id: "round",
      value: "1rem",
      labelEn: "Curved (16px)",
      labelAr: "دائري عصري (16px)",
      previewClass: "rounded-2xl",
    },
  ];

  // Guarantee single active font preset at all times
  const activePresetId = React.useMemo(() => {
    const exact = FONT_MOOD_PRESETS.find(
      (p) =>
        p.fontAr.toLowerCase() === (currentFontAr || "").toLowerCase() &&
        p.fontEn.toLowerCase() === (currentFontEn || "").toLowerCase(),
    );
    if (exact) return exact.id;
    const matchAr = FONT_MOOD_PRESETS.find(
      (p) => p.fontAr.toLowerCase() === (currentFontAr || "").toLowerCase(),
    );
    if (matchAr) return matchAr.id;
    const matchEn = FONT_MOOD_PRESETS.find(
      (p) => p.fontEn.toLowerCase() === (currentFontEn || "").toLowerCase(),
    );
    if (matchEn) return matchEn.id;
    return "modern";
  }, [currentFontAr, currentFontEn]);

  const badgePresets = [
    { id: "maroon", color: "#8C6D58", labelAr: "عنابي كلاسيكي", labelEn: "Classic Maroon" },
    { id: "crimson", color: "#dc2626", labelAr: "أحمر قرمزي", labelEn: "Crimson Red" },
    { id: "slate", color: "#334155", labelAr: "رمادي داكن", labelEn: "Dark Slate" },
    { id: "emerald", color: "#059669", labelAr: "أخضر زمردي", labelEn: "Emerald Green" },
  ];

  return (
    <div className="space-y-6 rounded-xl border border-border bg-card p-4 sm:p-6 shadow-sm">
      {/* Header Info */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <h3 className="font-semibold text-base text-foreground">
              {isAr ? "مظهر وهوية المتجر" : "Storefront Look & Feel"}
            </h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {isAr
              ? "تحكم بالألوان الأساسية، انحناء الحواف، ونبرة الخطوط — تتحدث واجهة متجرك فورياً لتعكس هويتك."
              : "Pick brand colors, corner radius, and typography vibe — updates your public storefront instantly."}
          </p>
        </div>
      </div>

      {/* 1. Brand Colors */}
      <div className="space-y-3 pt-2">
        <Label className="text-sm font-medium">
          {isAr ? "1. ألوان الهوية الرئيسية" : "1. Brand Colors"}
        </Label>
        <div className="flex flex-wrap items-center gap-4">
          {/* Primary Swatch */}
          <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-2 min-w-[170px]">
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
          <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-2 min-w-[170px]">
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
          {isAr ? "2. انحناء الحواف والبطاقات" : "2. Corner Style"}
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
          {isAr ? "3. نبرة وطابع الخطوط" : "3. Typography Mood"}
        </Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {FONT_MOOD_PRESETS.map((preset) => {
            const isSelected = activePresetId === preset.id;

            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onSelectFontPreset(preset)}
                className={cn(
                  "relative flex flex-col items-start gap-1 p-3.5 rounded-xl border-2 text-start transition-all cursor-pointer",
                  isSelected
                    ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20"
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
                    {preset.fontAr} / {preset.fontEn}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. Navigation & Badges */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-border/60 pt-4">
        {/* Navigation Bar Style */}
        {onHeaderGlassChange && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Layers className="size-4 text-muted-foreground" />
              <Label className="text-sm font-medium">
                {isAr ? "نمط شريط التنقل العلوي" : "Navigation Bar Style"}
              </Label>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={headerGlass ? "default" : "outline"}
                onClick={() => onHeaderGlassChange(true)}
                className="flex-1 text-xs"
              >
                {isAr ? "زجاجي مضبب" : "Glassmorphic"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={!headerGlass ? "default" : "outline"}
                onClick={() => onHeaderGlassChange(false)}
                className="flex-1 text-xs"
              >
                {isAr ? "خلفية صلبة" : "Solid"}
              </Button>
            </div>
          </div>
        )}

        {/* Sale & Badge Accent */}
        {onBadgeAccentChange && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Tag className="size-4 text-muted-foreground" />
              <Label className="text-sm font-medium">
                {isAr ? "لون شارة الخصومات" : "Sale Badge Accent"}
              </Label>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {badgePresets.map((b) => {
                const isBadgeSelected = (badgeAccent || "maroon") === b.id;
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => onBadgeAccentChange(b.id)}
                    className={cn(
                      "flex items-center gap-1.5 p-2 rounded-lg border text-xs font-medium transition-all",
                      isBadgeSelected
                        ? "border-primary bg-primary/10 font-bold"
                        : "border-border hover:bg-muted/40",
                    )}
                  >
                    <span
                      className="size-3 rounded-full shrink-0"
                      style={{ backgroundColor: b.color }}
                    />
                    <span className="truncate">{isAr ? b.labelAr : b.labelEn}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
