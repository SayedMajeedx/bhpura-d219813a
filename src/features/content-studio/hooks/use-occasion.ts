import { useMemo, useState } from "react";
import {
  OCCASIONS,
  nextDate,
  occasionById,
  occasionCaption,
  occasionEyebrow,
  storeCountry,
  upcomingOccasion,
  type OccasionId,
} from "@/features/content-studio/lib/occasions";
import type { SceneData } from "@/features/content-studio/engine/scene";

/**
 * The Occasion Pack's choices: the occasion (the next one coming up until the
 * merchant picks), and its greeting, message and offer. Edited wording is
 * kept per occasion and language, so switching back finds it again.
 */
export function useOccasion({
  active,
  currency,
  isAr,
  handle,
  today = new Date(),
}: {
  active: boolean;
  currency: string | null | undefined;
  isAr: boolean;
  handle: string | null;
  /** Today, as a parameter so tests can fix the date. */
  today?: Date;
}) {
  const lang = isAr ? "ar" : "en";
  const country = useMemo(() => storeCountry(currency), [currency]);
  const day = today.toISOString().slice(0, 10);
  const [chosen, setOccasionId] = useState<OccasionId | null>(null);
  const occasionId = useMemo(
    () => chosen ?? upcomingOccasion(new Date(day), country),
    [chosen, day, country],
  );
  const occasionDate = useMemo(
    () => nextDate(occasionId, new Date(day), country),
    [occasionId, day, country],
  );
  const occasion = occasionById(occasionId);
  // Every occasion with its next date, soonest first, for the panel's chips.
  const occasionChoices = useMemo(
    () =>
      OCCASIONS.map((item) => ({
        occasion: item,
        date: nextDate(item.id, new Date(day), country),
      })).sort((a, b) => a.date.getTime() - b.date.getTime()),
    [day, country],
  );

  const [edits, setEdits] = useState<Record<string, string>>({});
  const key = (field: string) => `${occasionId}:${field}:${lang}`;
  const occasionGreeting = edits[key("greeting")] ?? occasion.greeting[lang];
  const occasionMessage = edits[key("message")] ?? occasion.message[lang];
  const occasionOffer = edits[`${occasionId}:offer`] ?? "";
  const edit = (field: string) => (value: string) =>
    setEdits((current) => ({ ...current, [field]: value }));
  const eyebrow = occasionEyebrow(occasionId, occasionDate, country, lang);

  // The greeting as the template draws it; the gallery's thumbnail shows it even when unselected.
  const occasionPreview = useMemo<NonNullable<SceneData["occasion"]>>(
    () => ({
      id: occasionId,
      eyebrow,
      greeting: occasionGreeting,
      message: occasionMessage,
      offer: occasionOffer,
    }),
    [occasionId, eyebrow, occasionGreeting, occasionMessage, occasionOffer],
  );
  const occasionScene = active ? occasionPreview : null;

  const occasionCaptionText = active
    ? occasionCaption({
        occasion,
        greeting: occasionGreeting,
        message: occasionMessage,
        offer: occasionOffer,
        handle,
        lang,
      })
    : null;

  /** Puts a draft's greeting back: its occasion and its words, in the studio's language. */
  const restoreOccasion = (saved: {
    id: OccasionId;
    greeting: string;
    message: string;
    offer: string;
  }) => {
    setOccasionId(saved.id);
    setEdits((current) => ({
      ...current,
      [`${saved.id}:greeting:${lang}`]: saved.greeting,
      [`${saved.id}:message:${lang}`]: saved.message,
      [`${saved.id}:offer`]: saved.offer,
    }));
  };

  return {
    restoreOccasion,
    occasionId,
    setOccasionId,
    occasionDate,
    occasionChoices,
    occasionCountry: country,
    occasionGreeting,
    setOccasionGreeting: edit(key("greeting")),
    occasionMessage,
    setOccasionMessage: edit(key("message")),
    occasionOffer,
    setOccasionOffer: edit(`${occasionId}:offer`),
    occasionScene,
    occasionPreview,
    occasionCaptionText,
  };
}
