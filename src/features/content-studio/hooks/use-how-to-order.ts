import { useMemo, useState } from "react";
import { useVocabulary } from "@/hooks/use-vocabulary";
import {
  howToOrderSteps,
  type HowToOrderSettings,
} from "@/features/content-studio/lib/how-to-order";

/**
 * How to Order's steps, from the store's settings as they are now, and
 * whether its WhatsApp number is shown. Nothing to choose beyond that: a
 * change to how the store sells is made in its settings, and the story
 * follows.
 */
export function useHowToOrder({
  active,
  settings,
  isAr,
  currencySymbol,
}: {
  active: boolean;
  settings: (HowToOrderSettings & { whatsapp_number?: string | null }) | null | undefined;
  isAr: boolean;
  currencySymbol: string;
}) {
  const lang = isAr ? "ar" : "en";
  const { t } = useVocabulary();
  const [showWhatsapp, setShowWhatsapp] = useState(true);
  const whatsappNumber = settings?.whatsapp_number?.trim() || null;
  const makingWord = t("made_to_order", lang);

  const orderSteps = useMemo(
    () =>
      active
        ? howToOrderSteps(settings, {
            lang,
            currencyLabel: currencySymbol,
            whatsapp: showWhatsapp ? whatsappNumber : null,
            makingWord,
          })
        : null,
    [active, settings, lang, currencySymbol, showWhatsapp, whatsappNumber, makingWord],
  );

  return { orderSteps, whatsappNumber, showWhatsapp, setShowWhatsapp };
}
