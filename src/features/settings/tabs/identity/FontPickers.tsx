import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TypographyLanguage } from "@/lib/typography";
import { STOREFRONT_AR_FONTS, STOREFRONT_EN_FONTS } from "./TypographyAdvancedControls";
import {
  FONT_PAIRS,
  activePair,
  fontPatch,
  headingChoice,
  pairPatch,
  shownFonts,
} from "./font-choices";

type Settings = Record<string, unknown>;

const LISTS: Record<TypographyLanguage, readonly string[]> = {
  ar: STOREFRONT_AR_FONTS,
  en: STOREFRONT_EN_FONTS,
};

/**
 * The store's fonts: a text font and a heading font for each language (the heading follows the
 * text unless chosen), and the font pairs, each setting both. What the pickers show is what the
 * storefront shows.
 */
export function FontPickers({
  bs,
  isAr,
  onChange,
}: {
  bs: Settings;
  isAr: boolean;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const { text } = shownFonts(bs);
  const active = activePair(bs);
  const languages: { id: TypographyLanguage; ar: string; en: string }[] = [
    { id: "ar", ar: "عربي", en: "Arabic" },
    { id: "en", ar: "إنجليزي", en: "English" },
  ];
  const withCurrent = (list: readonly string[], current: string) =>
    list.includes(current) ? list : [current, ...list];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        {languages.map((language) => {
          const textFamily = text[language.id].url
            ? isAr
              ? "ملف مرفوع"
              : "Uploaded file"
            : text[language.id].family;
          const heading = headingChoice(bs, language.id);
          return (
            <div
              key={language.id}
              className="min-w-0 space-y-3 rounded-xl border border-border p-3"
            >
              <p className="text-sm font-semibold">{isAr ? language.ar : language.en}</p>
              <div className="space-y-1.5">
                <Label htmlFor={`font-text-${language.id}`}>
                  {isAr ? "خط النصوص" : "Text font"}
                </Label>
                <Select
                  value={textFamily}
                  onValueChange={(family) =>
                    onChange(fontPatch(bs, { text: { [language.id]: family } }))
                  }
                >
                  <SelectTrigger id={`font-text-${language.id}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {withCurrent(LISTS[language.id], textFamily).map((font) => (
                      <SelectItem key={font} value={font}>
                        <span style={{ fontFamily: font }}>{font}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`font-heading-${language.id}`}>
                  {isAr ? "خط العناوين" : "Heading font"}
                </Label>
                <Select
                  value={heading}
                  onValueChange={(choice) => {
                    // "Uploaded file" is shown to say what is there; it is not a family to save.
                    if (choice === "upload") return;
                    onChange(fontPatch(bs, { heading: { [language.id]: choice } }));
                  }}
                >
                  <SelectTrigger id={`font-heading-${language.id}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="same">
                      {isAr ? "مثل خط النصوص" : "Same as the text"}
                    </SelectItem>
                    {heading === "upload" && (
                      <SelectItem value="upload">{isAr ? "ملف مرفوع" : "Uploaded file"}</SelectItem>
                    )}
                    {(heading === "same" || heading === "upload"
                      ? LISTS[language.id]
                      : withCurrent(LISTS[language.id], heading)
                    ).map((font) => (
                      <SelectItem key={font} value={font}>
                        <span style={{ fontFamily: font }}>{font}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          );
        })}
      </div>

      <div className="space-y-2">
        <div>
          <p className="text-sm font-semibold">{isAr ? "أزواج جاهزة" : "Font pairs"}</p>
          <p className="text-xs text-muted-foreground">
            {isAr
              ? "خط للعناوين وخط للنصوص في اللغتين، بلمسة واحدة."
              : "A heading font and a text font in both languages, in one tap."}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FONT_PAIRS.map((pair) => {
            const on = active === pair.id;
            return (
              <Button
                key={pair.id}
                type="button"
                variant="outline"
                aria-pressed={on}
                onClick={() => onChange(pairPatch(bs, pair))}
                className={`h-auto min-w-0 flex-col items-start gap-1 whitespace-normal p-3.5 text-start ${
                  on ? "border-primary bg-primary/5 ring-1 ring-primary/20" : ""
                }`}
              >
                <span className="flex w-full items-center justify-between gap-2">
                  <span className="text-sm font-semibold">
                    {isAr ? pair.label.ar : pair.label.en}
                  </span>
                  {on && <Check className="size-4 text-primary" aria-hidden="true" />}
                </span>
                <span className="text-xs font-normal text-muted-foreground">
                  {isAr ? pair.description.ar : pair.description.en}
                </span>
                <span
                  className="mt-1 block text-base"
                  style={{ fontFamily: `"${pair.heading.ar}", "${pair.heading.en}"` }}
                >
                  {isAr ? "عنوان" : "Heading"}
                </span>
                <span
                  className="block text-xs font-normal text-muted-foreground"
                  style={{ fontFamily: `"${pair.text.ar}", "${pair.text.en}"` }}
                >
                  {pair.heading.ar} / {pair.heading.en} · {pair.text.ar} / {pair.text.en}
                </span>
              </Button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
