import { Button } from "@/components/ui/button";
import type {
  CardFontChoice,
  CardFontChoices,
  CardFontUpload,
} from "@/lib/data/gift-cards/designs";
import { GiftCardFace } from "@/features/gift-card-design/components/GiftCardFace";
import type { CardKit } from "@/features/gift-card-design/hooks/use-card-kit";
import { DEFAULT_DESIGN, type DesignId } from "@/features/gift-card-design/lib/design";
import { fontSample, type FontBase } from "../lib/card-font-choices";
import { CardFontField } from "./CardFontPicker";

export { fontName } from "../lib/card-font-choices";

/** The size range offered for the store's mark on its cards. */
export const LOGO_SCALE = { min: 0.5, max: 2, step: 0.05 } as const;

/** What the font pickers of a settings block share: the uploads and what is chosen anywhere. */
export type FontLibraryProps = {
  library: CardFontUpload[];
  onLibrary: (library: CardFontUpload[]) => void;
  inUse: ReadonlySet<string>;
};

/**
 * The store's mark and lettering on its cards: how large the mark is drawn (the same on every
 * design, the mark's own edge kept on the card's margins and lines at any size), and a font for
 * each language, used for the cards' large words only (the greeting, the store's name, who the
 * card is for and its value); the small labels, the note and the code stay in the cards' clear
 * face, which reads at their size. A front and a back show the result as it is set.
 */
export function CardBrandControls({
  kit,
  lang,
  sample,
  logoScale,
  onLogoScale,
  fonts,
  onFonts,
  fontLibrary,
}: {
  /** The kit with the choices being made, for the preview. */
  kit: CardKit;
  lang: "ar" | "en";
  /** The design the preview shows (the signature card, else the first offered). */
  sample: DesignId;
  logoScale: number;
  onLogoScale: (scale: number) => void;
  fonts: CardFontChoices;
  onFonts: (fonts: CardFontChoices) => void;
  fontLibrary: FontLibraryProps;
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
          <CardFontFields
            lang={lang}
            heading={isAr ? "خطوط بطاقات الهدايا" : "Gift card fonts"}
            description={
              isAr
                ? "للكلمات الكبيرة فقط: التهنئة واسم المتجر واسم المُهدى إليه والقيمة. تبقى العناوين الصغيرة والرسالة والرمز بخط البطاقة الواضح."
                : "For the large words only: the greeting, the store's name, who the card is for and its value. Small labels, the note and the code stay in the card's clear face."
            }
            storeName={kit.storeName}
            value={fonts}
            onChange={onFonts}
            base="own"
            fontLibrary={fontLibrary}
          />
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

/** A block's two font pickers, Arabic then English, under its heading. */
export function CardFontFields({
  lang,
  heading,
  description,
  storeName,
  value,
  onChange,
  base,
  inherited,
  fontLibrary,
}: {
  lang: "ar" | "en";
  heading: string;
  description: string;
  storeName: { ar: string | null; en: string | null };
  value: CardFontChoices;
  onChange: (value: CardFontChoices) => void;
  base: FontBase;
  /** The fonts choosing nothing gives, by language. */
  inherited?: CardFontChoices;
  fontLibrary: FontLibraryProps;
}) {
  const isAr = lang === "ar";
  const titles = {
    ar: isAr ? "الخط العربي" : "Arabic font",
    en: isAr ? "الخط الإنجليزي" : "English font",
  };
  return (
    <div role="group" aria-label={heading} className="space-y-2">
      <p className="text-sm font-medium">{heading}</p>
      <p className="text-xs text-muted-foreground">{description}</p>
      {(["ar", "en"] as const).map((script) => (
        <CardFontField
          key={script}
          lang={lang}
          script={script}
          title={titles[script]}
          description={description}
          value={value[script]}
          onChange={(choice: CardFontChoice | null) => onChange({ ...value, [script]: choice })}
          base={base}
          inherited={inherited?.[script] ?? null}
          library={fontLibrary.library}
          onLibrary={fontLibrary.onLibrary}
          inUse={fontLibrary.inUse}
          sample={fontSample(script, storeName)}
        />
      ))}
    </div>
  );
}
