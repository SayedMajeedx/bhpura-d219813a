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
 * follows. The steps are worked out even while another template is chosen
 * (`orderStepsPreview`), so the picker's thumbnail shows this store's own.
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

  const orderStepsPreview = useMemo(
    () =>
      howToOrderSteps(settings, {
        lang,
        currencyLabel: currencySymbol,
        whatsapp: showWhatsapp ? whatsappNumber : null,
        makingWord,
      }),
    [settings, lang, currencySymbol, showWhatsapp, whatsappNumber, makingWord],
  );
  const orderSteps = active ? orderStepsPreview : null;

  return { orderSteps, orderStepsPreview, whatsappNumber, showWhatsapp, setShowWhatsapp };
}
