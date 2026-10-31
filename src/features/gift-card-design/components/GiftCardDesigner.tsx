import { useEffect, useMemo } from "react";
import { RectangleHorizontal, RectangleVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { occasionsInOrder } from "../lib/occasions";
import {
  designName,
  designParts,
  designsFor,
  type CardDesign,
  type CardLanguage,
} from "../lib/design";
import type { CardDetails } from "../lib/content";
import type { CardKit } from "../hooks/use-card-kit";
import { GiftCardFace } from "./GiftCardFace";
import { GiftCardPreview } from "./GiftCardPreview";

/**
 * Choosing a card, as on the cards the owner named: the occasion first (what is in season leads),
 * then a handful of designs for it (the store's signature card first), which way it stands and
 * its language; the card is shown as it will be, front and back. The store's own choices decide
 * what is offered (`designsFor`).
 */
export function GiftCardDesigner({
  kit,
  value,
  onChange,
  details,
  primary,
  lang,
  today = new Date(),
}: {
  kit: CardKit;
  value: CardDesign;
  onChange: (design: CardDesign) => void;
  details: CardDetails;
  primary: "ar" | "en";
  lang: "ar" | "en";
  today?: Date;
}) {
  const isAr = lang === "ar";
  const occasions = useMemo(() => occasionsInOrder(today, kit.currency), [today, kit.currency]);
  const options = designsFor({
    occasion: value.occasion,
    kind: kit.kind,
    store: kit.store,
    hasPhoto: kit.photos.length > 0,
  });
  const optionsKey = options.join("|");

  // A design the store turned off, or a photo design with no photo, gives way to the first offered.
  useEffect(() => {
    if (!options.includes(value.design)) onChange({ ...value, design: options[0] });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when what is offered changes
  }, [optionsKey, value.design]);

  const choose = (patch: Partial<CardDesign>) => onChange({ ...value, ...patch });
  const pickOccasion = (occasion: CardDesign["occasion"]) => {
    const next = designsFor({
      occasion,
      kind: kit.kind,
      store: kit.store,
      hasPhoto: kit.photos.length > 0,
    });
    choose({ occasion, design: next.includes(value.design) ? value.design : next[0] });
  };
  const isPhoto = designParts(value.design).composition === "photo";
  const languages: Array<{ id: CardLanguage; label: string }> = [
    { id: "ar", label: "عربي" },
    { id: "en", label: "English" },
    { id: "both", label: isAr ? "عربي + English" : "English + عربي" },
  ];

  return (
    <div className="space-y-5">
      <GiftCardPreview kit={kit} design={value} details={details} primary={primary} lang={lang} />

      <div className="space-y-2">
        <p id="card-occasion-label" className="text-sm font-semibold">
          {isAr ? "المناسبة" : "Occasion"}
        </p>
        <div
          role="radiogroup"
          aria-labelledby="card-occasion-label"
          className="-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1"
        >
          {occasions.map((occasion) => (
            <Button
              key={occasion.id}
              type="button"
              role="radio"
              aria-checked={value.occasion === occasion.id}
              variant={value.occasion === occasion.id ? "default" : "outline"}
              size="sm"
              className="shrink-0 snap-start rounded-full"
              onClick={() => pickOccasion(occasion.id)}
            >
              {occasion.name[lang]}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p id="card-design-label" className="text-sm font-semibold">
          {isAr ? "التصميم" : "Design"}
        </p>
        <div
          role="radiogroup"
          aria-labelledby="card-design-label"
          className={cn(
            "grid gap-3",
            value.orientation === "landscape" ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-3",
          )}
        >
          {options.map((id) => {
            const chosen = value.design === id;
            return (
              <Button
                key={id}
                type="button"
                role="radio"
                aria-checked={chosen}
                aria-label={designName(id, lang)}
                variant="ghost"
                className={cn(
                  "h-auto rounded-lg p-1.5 ring-offset-2 ring-offset-background",
                  chosen ? "ring-2 ring-primary" : "ring-1 ring-border",
                )}
                onClick={() => choose({ design: id })}
              >
                <GiftCardFace
                  kit={kit}
                  design={{ ...value, design: id }}
                  details={details}
                  primary={primary}
                  label={designName(id, lang)}
                  className="w-full shadow-sm"
                />
              </Button>
            );
          })}
        </div>
      </div>

      {isPhoto && kit.photos.length > 1 && (
        <div className="space-y-2">
          <p id="card-photo-label" className="text-sm font-semibold">
            {isAr ? "الصورة" : "Photo"}
          </p>
          <div
            role="radiogroup"
            aria-labelledby="card-photo-label"
            className="flex flex-wrap gap-2"
          >
            {kit.photos.map((photo, index) => {
              const chosen = (value.photo ?? kit.photos[0]) === photo;
              return (
                <Button
                  key={photo}
                  type="button"
                  role="radio"
                  aria-checked={chosen}
                  aria-label={isAr ? `الصورة ${index + 1}` : `Photo ${index + 1}`}
                  variant="ghost"
                  className={cn(
                    "size-14 overflow-hidden rounded-md p-0",
                    chosen ? "ring-2 ring-primary" : "ring-1 ring-border",
                  )}
                  onClick={() => choose({ photo })}
                >
                  <img src={photo} alt="" className="size-full object-cover" loading="lazy" />
                </Button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-x-6 gap-y-3">
        <div className="space-y-2">
          <p id="card-shape-label" className="text-sm font-semibold">
            {isAr ? "الاتجاه" : "Orientation"}
          </p>
          <div role="radiogroup" aria-labelledby="card-shape-label" className="flex gap-2">
            {(["portrait", "landscape"] as const).map((orientation) => (
              <Button
                key={orientation}
                type="button"
                role="radio"
                aria-checked={value.orientation === orientation}
                variant={value.orientation === orientation ? "default" : "outline"}
                size="sm"
                className="gap-1.5"
                onClick={() => choose({ orientation })}
              >
                {orientation === "portrait" ? (
                  <RectangleVertical className="size-4" aria-hidden="true" />
                ) : (
                  <RectangleHorizontal className="size-4" aria-hidden="true" />
                )}
                {orientation === "portrait"
                  ? isAr
                    ? "طولي"
                    : "Portrait"
                  : isAr
                    ? "عرضي"
                    : "Landscape"}
              </Button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <p id="card-language-label" className="text-sm font-semibold">
            {isAr ? "لغة البطاقة" : "Card language"}
          </p>
          <div
            role="radiogroup"
            aria-labelledby="card-language-label"
            className="flex flex-wrap gap-2"
          >
            {languages.map((language) => (
              <Button
                key={language.id}
                type="button"
                role="radio"
                aria-checked={value.language === language.id}
                variant={value.language === language.id ? "default" : "outline"}
                size="sm"
                onClick={() => choose({ language: language.id })}
              >
                {language.label}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
