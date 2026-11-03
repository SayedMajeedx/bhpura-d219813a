import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SHEET_LANGS, type SheetLang } from "@/features/orders/lib/job-sheet";

const NAMES: Record<SheetLang, { ar: string; en: string }> = {
  ar: { ar: "العربية", en: "العربية" },
  en: { ar: "English", en: "English" },
  both: { ar: "الاثنتان معاً", en: "Both" },
};

/** "العربية · English · both": a language named in its own words, "both" in the reader's. */
export function sheetLangName(lang: SheetLang, readerLang: "ar" | "en"): string {
  return NAMES[lang][readerLang];
}

/**
 * The language a job sheet or a supplier's message is written in: Arabic, English, or both side
 * by side. One row of three buttons, the chosen one pressed.
 */
export function SheetLanguageChoice({
  value,
  onChange,
  lang,
  label,
  className,
}: {
  value: SheetLang;
  onChange: (value: SheetLang) => void;
  /** The reader's language, for the label and "both". */
  lang: "ar" | "en";
  label?: string;
  className?: string;
}) {
  const isAr = lang === "ar";
  const name = label ?? (isAr ? "اللغة" : "Language");
  return (
    <div className={cn("space-y-1.5", className)}>
      <p className="text-sm font-medium text-foreground">{name}</p>
      <div role="radiogroup" aria-label={name} className="flex flex-wrap gap-2">
        {SHEET_LANGS.map((option) => (
          <Button
            key={option}
            type="button"
            role="radio"
            aria-checked={value === option}
            variant={value === option ? "default" : "outline"}
            size="sm"
            onClick={() => onChange(option)}
            className="h-9 min-w-20 pointer-coarse:h-11"
          >
            <span lang={option === "both" ? lang : option}>{sheetLangName(option, lang)}</span>
          </Button>
        ))}
      </div>
    </div>
  );
}
