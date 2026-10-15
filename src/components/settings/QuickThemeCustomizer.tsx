import * as React from "react";
import { ArrowLeftRight, Sparkles, Tag, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { extractLogoPalette, type ExtractedPalette } from "@/lib/logo-palette";

export interface FontMoodPreset {
  id: string;
  labelEn: string;
  labelAr: string;
  fontAr: string;
  fontEn: string;
  displayFontAr?: string;
  bodyFontAr?: string;
  displayFontEn?: string;
  bodyFontEn?: string;
  descriptionEn: string;
  descriptionAr: string;
}

export const FONT_MOOD_PRESETS: FontMoodPreset[] = [
  {
    id: "editorial",
    labelEn: "Editorial / Luxury",
    labelAr: "تحريري وفاخر",
    fontAr: "Amiri",
    fontEn: "Playfair Display",
    displayFontAr: "Amiri",
    bodyFontAr: "Tajawal",
    displayFontEn: "Playfair Display",
    bodyFontEn: "Inter",
    descriptionEn: "High-end luxury & editorial feel",
    descriptionAr: "فخامة وأصالة تحريرية راقية",
  },
  {
    id: "minimal",
    labelEn: "Minimal Modern",
    labelAr: "عصري وبسيط",
    fontAr: "Readex Pro",
    fontEn: "Plus Jakarta Sans",
    displayFontAr: "Readex Pro",
    bodyFontAr: "Readex Pro",
    displayFontEn: "Plus Jakarta Sans",
    bodyFontEn: "Plus Jakarta Sans",
    descriptionEn: "Clean, geometric & contemporary",
    descriptionAr: "وضوح وبساطة هندسية حديثة",
  },
  {
    id: "boutique",
    labelEn: "Elegant Boutique",
    labelAr: "بوتيك أنيق",
    fontAr: "Aref Ruqaa",
    fontEn: "Cormorant Garamond",
    displayFontAr: "Aref Ruqaa",
    bodyFontAr: "Almarai",
    displayFontEn: "Cormorant Garamond",
    bodyFontEn: "Montserrat",
    descriptionEn: "Exclusive boutique elegance",
    descriptionAr: "طابع بوتيك حصري وساحر",
  },
  {
    id: "artisan",
    labelEn: "Warm Artisan",
    labelAr: "حرفي دافئ",
    fontAr: "Changa",
    fontEn: "Playfair Display",
    displayFontAr: "Changa",
    bodyFontAr: "Tajawal",
    displayFontEn: "Playfair Display",
    bodyFontEn: "Plus Jakarta Sans",
    descriptionEn: "Handcrafted, warm & welcoming",
    descriptionAr: "دفء الحِرفة واللمسة اليدوية",
  },
  {
    id: "contemporary",
    labelEn: "Contemporary Clean",
    labelAr: "معاصر وواضح",
    fontAr: "Cairo",
    fontEn: "Inter",
    displayFontAr: "Cairo",
    bodyFontAr: "Cairo",
    displayFontEn: "Inter",
    bodyFontEn: "Inter",
    descriptionEn: "High legibility & digital first",
    descriptionAr: "مقروئية عالية وتصميم رقمي",
  },
  {
    id: "signature",
    labelEn: "Signature Boutique",
    labelAr: "توقيع راقٍ",
    fontAr: "Tajawal",
    fontEn: "Cormorant Garamond",
    displayFontAr: "Tajawal",
    bodyFontAr: "Readex Pro",
    displayFontEn: "Cormorant Garamond",
    bodyFontEn: "Inter",
    descriptionEn: "Signature boutique presentation",
    descriptionAr: "توقيع خاص بالمتاجر الراقية",
  },
  {
    id: "bold",
    labelEn: "Bold & Dynamic",
    labelAr: "جريء وديناميكي",
    fontAr: "Almarai",
    fontEn: "Montserrat",
    displayFontAr: "Almarai",
    bodyFontAr: "Cairo",
    displayFontEn: "Montserrat",
    bodyFontEn: "Inter",
    descriptionEn: "Confident, striking & powerful",
    descriptionAr: "حضور واثق ومباشر وعصري",
  },
  {
    id: "youthful",
    labelEn: "Youthful Vibe",
    labelAr: "شبابي وحيوي",
    fontAr: "Changa",
    fontEn: "Poppins",
    displayFontAr: "Changa",
    bodyFontAr: "Readex Pro",
    displayFontEn: "Poppins",
    bodyFontEn: "Plus Jakarta Sans",
    descriptionEn: "Playful, friendly & youthful",
    descriptionAr: "عفوي ومرح وجذاب للشباب",
  },
  // Legacy aliases for backward compatibility
  {
    id: "classic",
    labelEn: "Classic",
    labelAr: "كلاسيكي",
    fontAr: "Tajawal",
    fontEn: "Inter",
    descriptionEn: "Classic balance",
    descriptionAr: "توازن كلاسيكي",
  },
  {
    id: "modern",
    labelEn: "Modern",
    labelAr: "عصري",
    fontAr: "Readex Pro",
    fontEn: "Plus Jakarta Sans",
    descriptionEn: "Modern geometric",
    descriptionAr: "هندسي عصري",
  },
  {
    id: "strong",
    labelEn: "Strong",
    labelAr: "قوي وجريء",
    fontAr: "Almarai",
    fontEn: "Montserrat",
    descriptionEn: "Strong presence",
    descriptionAr: "حضور قوي",
  },
  {
    id: "bubble",
    labelEn: "Bubble / Friendly",
    labelAr: "مرح وودود",
    fontAr: "Changa",
    fontEn: "Poppins",
    descriptionEn: "Friendly and rounded",
    descriptionAr: "ودود ومستدير",
  },
];

export interface QuickThemeCustomizerProps {
  primaryColor: string;
  secondaryColor: string;
  radius: string;
  badgeAccent?: string;
  logoUrl?: string | null;
  isAr: boolean;
  onPrimaryChange: (val: string) => void;
  onSecondaryChange: (val: string) => void;
  onRadiusChange: (val: string) => void;
  onSwapColors: () => void;
  onBadgeAccentChange?: (val: string) => void;
  onExtractPalette?: (palette: ExtractedPalette) => void;
}

export function QuickThemeCustomizer({
  primaryColor,
  secondaryColor,
  radius,
  badgeAccent = "maroon",
  logoUrl,
  isAr,
  onPrimaryChange,
  onSecondaryChange,
  onRadiusChange,
  onSwapColors,
  onBadgeAccentChange,
  onExtractPalette,
}: QuickThemeCustomizerProps) {
  const [extracting, setExtracting] = React.useState(false);
  const logoFileInputRef = React.useRef<HTMLInputElement>(null);

  const handleExtractFromSource = async (source: File | string) => {
    setExtracting(true);
    try {
      const palette = await extractLogoPalette(source);
      onPrimaryChange(palette.primary);
      onSecondaryChange(palette.secondary);
      onExtractPalette?.(palette);
    } catch (e) {
      console.error("Failed to extract palette from logo:", e);
    } finally {
      setExtracting(false);
    }
  };
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
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">
            {isAr ? "1. ألوان الهوية الرئيسية" : "1. Brand Colors"}
          </Label>

          <div>
            <input
              ref={logoFileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleExtractFromSource(file);
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={extracting}
              onClick={() => {
                if (logoUrl) {
                  handleExtractFromSource(logoUrl);
                } else {
                  logoFileInputRef.current?.click();
                }
              }}
              className="h-7 text-xs gap-1.5 border-dashed"
            >
              <Palette className="size-3.5 text-primary" />
              {extracting
                ? isAr
                  ? "جاري الاستخراج..."
                  : "Extracting..."
                : isAr
                  ? "استخراج الألوان من الشعار"
                  : "Extract from logo"}
            </Button>
          </div>
        </div>
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
              <span className="block text-xs font-medium text-foreground">
                {isAr ? "اللون الأساسي" : "Primary"}
              </span>
              <span className="block font-mono text-xs text-muted-foreground uppercase">
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
              <span className="block text-xs font-medium text-foreground">
                {isAr ? "اللون الثانوي" : "Secondary"}
              </span>
              <span className="block font-mono text-xs text-muted-foreground uppercase">
                {secondaryColor || "#1f1f1f"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Corner Radius */}
      <div className="space-y-3 border-t border-border-subtle pt-4">
        <div>
          <Label className="text-sm font-medium">
            {isAr ? "2. انحناء وتدوير الحواف" : "2. Corner Radius"}
          </Label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {isAr
              ? "يحدد مظهر البطاقات والأزرار في المتجر بالكامل."
              : "Defines overall shape for buttons, cards, and storefront panels."}
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {cornerPresets.map((preset) => {
            const isSelected = activeRadiusPreset === preset.id;

            return (
              <Button
                key={preset.id}
                type="button"
                variant={isSelected ? "default" : "outline"}
                onClick={() => onRadiusChange(preset.value)}
                className={cn(
                  "h-12 flex-col gap-1 items-center justify-center transition-all",
                  isSelected
                    ? "bg-primary text-primary-foreground shadow-sm ring-2 ring-primary/20"
                    : "border-border hover:bg-muted/40",
                )}
              >
                <div
                  className={cn(
                    "size-4 border-2 border-current transition-all",
                    preset.previewClass,
                  )}
                />
                <span className="text-xs font-medium">
                  {isAr ? preset.labelAr : preset.labelEn}
                </span>
              </Button>
            );
          })}
        </div>
      </div>

      {/* 3. Badges (the header's look is in the Header & footer group; fonts are in Typography) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-border-subtle pt-4">
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
                        ? "border-primary bg-primary/10 font-medium text-primary"
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
