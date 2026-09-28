import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { useAdminStoreProfile } from "@/hooks/use-store-profile";
import type { Product } from "@/features/content-studio/lib/studio-content";
import type { useStudioProduct } from "@/features/content-studio/hooks/use-studio-product";

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
  storeProfile,
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
  storeProfile: ReturnType<typeof useAdminStoreProfile>["profile"];
  isAr: boolean;
  override?: string | null;
}) {
  const [copiedCaption, setCopiedCaption] = useState(false);

  const productCaption = useMemo(() => {
    if (!selected) return "";
    const title = headline.trim() ? `✨ ${headline.trim()}` : "✨ [العنوان العاطفي]";
    const desc = body.trim() || selectedDescription || "";

    const pVariants = (variantsQ.data ?? []).filter((v) => v.product_id === selected.id);
    const availableSizes = Array.from(
      new Set(
        pVariants
          .filter(
            (v) => (Number(v.stock_main) || 0) + (Number(v.stock_incubator) || 0) > 0 && v.size,
          )
          .map((v) => v.size!.trim()),
      ),
    );

    const sizesFormatted = availableSizes.length > 0 ? availableSizes.join(" · ") : "";

    const occasionFormatted = selected.occasion ? selected.occasion.trim() : "";
    const fabricFormatted = selected.fabric_type ? selected.fabric_type.trim() : "";
    const priceFormatted = effectivePrice != null ? Number(effectivePrice).toFixed(3) : "0.000";

    const details: string[] = [];
    if (sizesFormatted) {
      details.push(`📏 المقاسات المتوفرة للبيع الفوري: ${sizesFormatted}`);
    } else if (storeProfile.modules.made_to_order) {
      details.push("📏 المقاسات: متوفرة حسب الطلب");
    }
    if (occasionFormatted && storeProfile.vertical === "fashion") {
      details.push(`👗 مناسبة لـ: ${occasionFormatted}`);
    }
    if (fabricFormatted && storeProfile.vertical === "fashion") {
      details.push(`🧵 نوع القماش: ${fabricFormatted}`);
    }
    if (storeProfile.modules.made_to_order) {
      details.push("✂️ متوفرة حسب الطلب: نعم");
    }

    const detailsBlock = details.length > 0 ? `\n\n${details.join("\n")}` : "";

    return `${title}
${desc}${detailsBlock}

💰 ${priceFormatted} ${currencySymbol}`;
  }, [
    selected,
    headline,
    body,
    selectedDescription,
    variantsQ.data,
    currencySymbol,
    effectivePrice,
    storeProfile.modules.made_to_order,
    storeProfile.vertical,
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
  };
}
