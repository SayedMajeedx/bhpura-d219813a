import { useRef, useState } from "react";
import { Loader2, Type, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useBrand } from "@/lib/brand-context";
import { uploadPublicMedia } from "@/lib/r2-upload";
import type { CardFontRow } from "@/lib/data/gift-cards/designs";
import { GiftCardFace } from "@/features/gift-card-design/components/GiftCardFace";
import type { CardKit } from "@/features/gift-card-design/hooks/use-card-kit";
import { DEFAULT_DESIGN, type DesignId } from "@/features/gift-card-design/lib/design";

export type CardFonts = { ar: CardFontRow | null; en: CardFontRow | null };

/** The size range offered for the store's mark on its cards. */
export const LOGO_SCALE = { min: 0.5, max: 2, step: 0.05 } as const;

/** A font file's name without its extension, as the merchant named it. */
export const fontName = (file: string) =>
  file
    .replace(/\.(woff2?|ttf|otf)$/i, "")
    .replace(/[-_]+/g, " ")
    .trim()
    .slice(0, 60);

/**
 * The store's mark and lettering on its cards: how large the mark is drawn (the same on every
 * design, the mark's own edge kept on the card's margins and lines at any size), and a font of the
 * store's own for each language, used for the cards' large words only (the greeting, the store's
 * name, who the card is for and its value); the small labels, the note and the code stay in the
 * cards' clear face, which reads at their size. A front and a back show the result as it is set.
 */
export function CardBrandControls({
  kit,
  lang,
  sample,
  logoScale,
  onLogoScale,
  fonts,
  onFonts,
}: {
  /** The kit with the choices being made, for the preview. */
  kit: CardKit;
  lang: "ar" | "en";
  /** The design the preview shows (the signature card, else the first offered). */
  sample: DesignId;
  logoScale: number;
  onLogoScale: (scale: number) => void;
  fonts: CardFonts;
  onFonts: (fonts: CardFonts) => void;
}) {
  const isAr = lang === "ar";
  const details = {
    amount: 50,
    code: null,
    to: isAr ? "نورة" : "Noura",
    message: null,
    expiresOn: null,
  };
  const percent = Math.round(logoScale * 100);
  return (
    <div className="space-y-4 rounded-lg border border-border p-3">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="card-logo-size" className="text-sm font-medium">
                {isAr ? "حجم الشعار على البطاقات" : "Logo size on the cards"}
              </label>
              <span className="font-mono text-xs text-muted-foreground">{percent}%</span>
            </div>
            <input
              id="card-logo-size"
              type="range"
              min={LOGO_SCALE.min}
              max={LOGO_SCALE.max}
              step={LOGO_SCALE.step}
              value={logoScale}
              onChange={(event) => onLogoScale(Number(event.target.value))}
              aria-valuetext={`${percent}%`}
              className="h-1.5 w-full cursor-pointer rounded-lg bg-muted accent-primary"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{isAr ? "أصغر" : "Smaller"}</span>
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs"
                onClick={() => onLogoScale(1)}
                disabled={logoScale === 1}
              >
                {isAr ? "كما صُمّم" : "As designed"}
              </Button>
              <span>{isAr ? "أكبر" : "Larger"}</span>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">{isAr ? "خطوط البطاقات" : "Card fonts"}</p>
            <p className="text-xs text-muted-foreground">
              {isAr
                ? "للكلمات الكبيرة فقط: التهنئة واسم المتجر واسم المُهدى إليه والقيمة. تبقى العناوين الصغيرة والرسالة والرمز بخط البطاقة الواضح."
                : "For the large words only: the greeting, the store's name, who the card is for and its value. Small labels, the note and the code stay in the card's clear face."}
            </p>
            <FontRow
              lang={lang}
              which="ar"
              font={fonts.ar}
              onChange={(font) => onFonts({ ...fonts, ar: font })}
            />
            <FontRow
              lang={lang}
              which="en"
              font={fonts.en}
              onChange={(font) => onFonts({ ...fonts, en: font })}
            />
          </div>
        </div>
        <div className="flex gap-2 sm:w-64">
          <GiftCardFace
            kit={kit}
            design={{ ...DEFAULT_DESIGN, design: sample, language: lang }}
            details={details}
            primary={lang}
            face="front"
            label={isAr ? "معاينة الوجه" : "Front preview"}
            className="w-1/2 shadow-sm"
          />
          <GiftCardFace
            kit={kit}
            design={{ ...DEFAULT_DESIGN, design: sample, language: lang }}
            details={details}
            primary={lang}
            face="back"
            label={isAr ? "معاينة الظهر" : "Back preview"}
            className="w-1/2 shadow-sm"
          />
        </div>
      </div>
    </div>
  );
}

function FontRow({
  lang,
  which,
  font,
  onChange,
}: {
  lang: "ar" | "en";
  which: "ar" | "en";
  font: CardFontRow | null;
  onChange: (font: CardFontRow | null) => void;
}) {
  const isAr = lang === "ar";
  const brand = useBrand();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const title =
    which === "ar"
      ? isAr
        ? "الخط العربي"
        : "Arabic font"
      : isAr
        ? "الخط الإنجليزي"
        : "English font";

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const url = await uploadPublicMedia(brand.id, file, "font");
      onChange({ url, name: fontName(file.name) || null });
      toast.success(isAr ? "رُفع الخط، لا تنسَ الحفظ" : "Font uploaded, remember to save");
    } catch {
      toast.error(isAr ? "تعذّر رفع الخط" : "The font could not be uploaded");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Type className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0 flex-1 text-sm">
        <span className="block">{title}</span>
        <span className="block break-words text-xs text-muted-foreground">
          {font
            ? font.name || (isAr ? "خط مرفوع" : "Uploaded font")
            : isAr
              ? "خط البطاقات"
              : "The cards' own"}
        </span>
      </span>
      <input
        ref={input}
        type="file"
        accept=".woff,.woff2,.ttf,.otf"
        className="hidden"
        aria-label={isAr ? `رفع ${title}` : `Upload the ${title.toLowerCase()}`}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
          e.target.value = "";
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        disabled={uploading}
        onClick={() => input.current?.click()}
      >
        {uploading ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Upload className="size-4" aria-hidden="true" />
        )}
        {font ? (isAr ? "تغيير" : "Change") : isAr ? "رفع (woff/ttf/otf)" : "Upload (woff/ttf/otf)"}
      </Button>
      {font && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label={isAr ? `إزالة ${title}` : `Remove the ${title.toLowerCase()}`}
          onClick={() => onChange(null)}
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}
