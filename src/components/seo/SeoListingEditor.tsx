import { useId } from "react";
import { ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ListingPreview } from "@/components/seo/ListingPreview";
import { META_DESCRIPTION_LIMIT, META_TITLE_LIMIT, typingMetaText } from "@/lib/seo";
import type { Listing } from "@/lib/seo/listing";

export type SeoWords = {
  seo_title_ar: string;
  seo_title_en: string;
  seo_description_ar: string;
  seo_description_en: string;
};

/**
 * The words Google shows for a product or a category, in each language, folded under "Google
 * listing" with Google's result for what is written so far. Left empty, the page says what it
 * always said (the caller's `listing` for that language says what that is).
 */
export function SeoListingEditor({
  isAr,
  words,
  onChange,
  listing,
  address,
}: {
  isAr: boolean;
  words: SeoWords;
  onChange: (patch: Partial<SeoWords>) => void;
  listing: (lang: "ar" | "en") => Listing;
  address: string;
}) {
  const id = useId();
  return (
    <details className="group rounded-xl border border-border-strong">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-bold text-foreground">
        <span>
          {isAr ? "الظهور في Google (اختياري)" : "Google listing (optional)"}
          <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
            {isAr
              ? "العنوان والوصف اللذان يظهران في نتائج البحث"
              : "The title and description shown in search results"}
          </span>
        </span>
        <ChevronDown
          className="size-4 shrink-0 transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="space-y-5 border-t border-border p-4">
        {(["ar", "en"] as const).map((lang) => {
          const title = words[`seo_title_${lang}`];
          const description = words[`seo_description_${lang}`];
          return (
            <div key={lang} className="space-y-3">
              <ListingPreview listing={listing(lang)} address={address} lang={lang} isAr={isAr} />
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <Label htmlFor={`${id}-${lang}-title`} className="font-medium">
                    {lang === "ar"
                      ? isAr
                        ? "العنوان — عربي"
                        : "Title — Arabic"
                      : isAr
                        ? "العنوان — إنجليزي"
                        : "Title — English"}
                  </Label>
                  <span className="font-mono text-muted-foreground">
                    {title.length}/{META_TITLE_LIMIT}
                  </span>
                </div>
                <Input
                  id={`${id}-${lang}-title`}
                  dir={lang === "ar" ? "rtl" : "ltr"}
                  value={title}
                  maxLength={META_TITLE_LIMIT}
                  onChange={(event) =>
                    onChange({
                      [`seo_title_${lang}`]: typingMetaText(event.target.value, META_TITLE_LIMIT),
                    })
                  }
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <Label htmlFor={`${id}-${lang}-description`} className="font-medium">
                    {lang === "ar"
                      ? isAr
                        ? "الوصف — عربي"
                        : "Description — Arabic"
                      : isAr
                        ? "الوصف — إنجليزي"
                        : "Description — English"}
                  </Label>
                  <span className="font-mono text-muted-foreground">
                    {description.length}/{META_DESCRIPTION_LIMIT}
                  </span>
                </div>
                <Textarea
                  id={`${id}-${lang}-description`}
                  dir={lang === "ar" ? "rtl" : "ltr"}
                  value={description}
                  maxLength={META_DESCRIPTION_LIMIT}
                  rows={2}
                  onChange={(event) =>
                    onChange({
                      [`seo_description_${lang}`]: typingMetaText(
                        event.target.value,
                        META_DESCRIPTION_LIMIT,
                      ),
                    })
                  }
                  className="min-h-[56px] text-xs"
                />
              </div>
            </div>
          );
        })}
      </div>
    </details>
  );
}
