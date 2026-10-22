import { useMemo } from "react";
import { tailoredEstimate, type EstimateSettings } from "@/lib/delivery-estimate";
import type { SceneData } from "@/features/content-studio/engine/scene";
import { madeForYouBeats } from "@/features/content-studio/lib/made-for-you";

/**
 * Made for You's three chapters: the words of the store's craft, and the
 * making time it wrote for made-to-order pieces (the piece's name when it
 * wrote none). The time is changed in the store's settings, not here. The
 * chapters are worked out even while another template is chosen
 * (`makingPreview`), so the picker's thumbnail speaks the store's craft.
 */
export function useMadeForYou({
  active,
  settings,
  vertical,
  isAr,
  productName,
}: {
  active: boolean;
  settings: EstimateSettings | null | undefined;
  vertical: unknown;
  isAr: boolean;
  productName: string;
}) {
  const lang = isAr ? "ar" : "en";
  const makingTime = settings ? tailoredEstimate(settings, lang) : null;
  const makingPreview = useMemo<NonNullable<SceneData["making"]>>(
    () => ({ beats: madeForYouBeats({ vertical, lang, time: makingTime, name: productName }) }),
    [vertical, lang, makingTime, productName],
  );
  const making = active ? makingPreview : null;
  return { making, makingPreview, makingTime };
}
