import { useMemo, useState } from "react";
import { toast } from "sonner";
import { realSize } from "@/lib/default-variant";
import type { Product } from "@/features/content-studio/lib/studio-content";
import type { useStudioProduct } from "@/features/content-studio/hooks/use-studio-product";
import {
  readCaptionVoice,
  studioCaption,
  type CaptionVoice,
} from "@/features/content-studio/lib/studio-caption";

/**
 * The Instagram caption for the chosen product and variant (or `override`,
 * a template's own caption such as an occasion greeting), and copying it.
 */
export function useStudioCaption({
  selected,
  headline,
  body,
  selectedDescription,
  variantsQ,
  currencySymbol,
  effectivePrice,
  making,
  brandId,
  isAr,
  override = null,
}: {
  selected: Product | undefined;
  headline: string;
  body: string;
  selectedDescription: string | null;
  variantsQ: ReturnType<typeof useStudioProduct>["variantsQ"];
  currencySymbol: string;
  effectivePrice: number | null;
  making: string | null | undefined;
  brandId: string;
  isAr: boolean;
  override?: string | null;
}) {
  const [copiedCaption, setCopiedCaption] = useState(false);

  // A convenience of this device, per store: a caption is always there to read and change.
  const voiceKey = `studio-caption-voice:${brandId}`;
  const [voice, setVoiceState] = useState<CaptionVoice>(() => {
    try {
      return readCaptionVoice(localStorage.getItem(voiceKey));
    } catch {
      return "plural";
    }
  });
  const setCaptionVoice = (next: CaptionVoice) => {
    setVoiceState(next);
    try {
      localStorage.setItem(voiceKey, next);
    } catch {
      /* kept for this visit only */
    }
  };

  const productCaption = useMemo(() => {
    if (!selected) return "";
    const sizes = Array.from(
      new Set(
        (variantsQ.data ?? [])
          .filter((v) => v.product_id === selected.id)
          .filter(
            (v) =>
              (Number(v.stock_main) || 0) + (Number(v.stock_incubator) || 0) > 0 &&
              realSize(v.size),
          )
          .map((v) => String(v.size).trim()),
      ),
    );
    return studioCaption({
      headline,
      body,
      description: selectedDescription,
      occasion: selected.occasion,
      madeToOrder: Boolean(selected.is_made_to_order),
      making,
      sizes,
      price: effectivePrice,
      currency: currencySymbol,
      lang: isAr ? "ar" : "en",
      voice,
    });
  }, [
    selected,
    headline,
    body,
    selectedDescription,
    variantsQ.data,
    currencySymbol,
    effectivePrice,
    making,
    isAr,
    voice,
  ]);
  const captionText = override ?? productCaption;

  const handleCopyCaption = async () => {
    if (!captionText) return;
    try {
      await navigator.clipboard.writeText(captionText);
      setCopiedCaption(true);
      setTimeout(() => setCopiedCaption(false), 2000);
      toast.success(
        isAr ? "تم نسخ كابشن انستقرام للحافظة بنجاح!" : "Instagram caption copied to clipboard!",
      );
    } catch {
      toast.error(isAr ? "تعذر النسخ للحافظة" : "Failed to copy to clipboard");
    }
  };

  return {
    copiedCaption,
    captionText,
    handleCopyCaption,
    captionVoice: voice,
    setCaptionVoice,
  };
}
