import { useMemo, useState } from "react";
import { toast } from "sonner";
import { realSize } from "@/lib/default-variant";
import type { Product } from "@/features/content-studio/lib/studio-content";
import type { Sale } from "@/features/content-studio/lib/sale-price";
import { postName } from "@/features/content-studio/lib/post-name";
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
  sale = null,
  saleEnds = null,
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
  /** The offer's price on the chosen piece, as the post shows it (null: none). */
  sale?: Sale | null;
  /** When that offer ends, in the reader's words. */
  saleEnds?: string | null;
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
    const full = isAr ? selected.name_ar || selected.name : selected.name_en || selected.name;
    const named = postName(full);
    return studioCaption({
      headline,
      // The headline left as the post's short name: the caption says the piece in full.
      name: named.kind && headline.trim() === named.name ? named.label : null,
      body,
      description: selectedDescription,
      occasion: selected.occasion,
      madeToOrder: Boolean(selected.is_made_to_order),
      making,
      sizes,
      price: sale?.price ?? effectivePrice,
      was: sale ? sale.original : null,
      saleEnds: sale ? saleEnds : null,
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
    sale,
    saleEnds,
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
