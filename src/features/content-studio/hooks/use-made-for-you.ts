import { useMemo } from "react";
import { tailoredEstimate, type EstimateSettings } from "@/lib/delivery-estimate";
import type { SceneData } from "@/features/content-studio/engine/scene";
import { madeForYouBeats } from "@/features/content-studio/lib/made-for-you";

/**
 * Made for You's three chapters: the words of the store's craft, and the
 * making time it wrote for made-to-order pieces (the piece's name when it
 * wrote none). The time is changed in the store's settings, not here.
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
  const making = useMemo<SceneData["making"]>(
    () =>
      active
        ? { beats: madeForYouBeats({ vertical, lang, time: makingTime, name: productName }) }
        : null,
    [active, vertical, lang, makingTime, productName],
  );
  return { making, makingTime };
}
