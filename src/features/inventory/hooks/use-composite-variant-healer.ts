import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useBrand } from "@/lib/brand-context";
import { getFriendlyErrorMessage } from "@/lib/utils";
import { updateProduct, updateVariant } from "@/lib/data/catalog";
import { splitCompositeVariantSize } from "@/lib/format";
import type { Product, Variant } from "@/features/inventory/types";

/**
 * Variants whose size holds two values ("700 - Dark" with no colour), and a
 * one-click fix that splits them into size and colour/option.
 */
export function useCompositeVariantHealer({
  variants,
  product,
  productId,
  colorLabel,
  isAr,
  onChanged,
}: {
  variants: Variant[];
  product?: Product;
  productId: string;
  colorLabel: string;
  isAr: boolean;
  onChanged: () => void;
}) {
  const brandId = useBrand().id;
  // 1-Click Auto-Healer: Detect variants where size contains merged attributes (e.g. "700 - عادية" with color null)
  const [isHealing, setIsHealing] = useState(false);
  const compositeVariants = useMemo(() => {
    return variants.filter((v) => {
      if (v.color && v.color.trim()) return false;
      const split = splitCompositeVariantSize(v.size, v.size_unit);
      return split.isComposite;
    });
  }, [variants]);

  const handleAutoHealCompositeVariants = async () => {
    if (compositeVariants.length === 0) return;
    setIsHealing(true);
    try {
      for (const v of compositeVariants) {
        const split = splitCompositeVariantSize(v.size, v.size_unit);
        if (split.isComposite) {
          await updateVariant(brandId, v.id, {
            size: split.size,
            size_unit: split.unit || v.size_unit || "g",
            color: split.option,
          });
        }
      }

      if (!product?.variant_label_color_ar) {
        await updateProduct(brandId, productId, {
          variant_label_color_ar: colorLabel || "النكهة / الخيار",
          variant_label_color_en: "Flavor / Option",
        }).catch((pErr: unknown) => console.warn("Could not update product axis label:", pErr));
      }

      toast.success(
        isAr
          ? `تم بنجاح فرز وتصحيح ${compositeVariants.length} متغيرات وتفعيل محور النكهات!`
          : `Successfully healed ${compositeVariants.length} variants into clean sizes & options!`,
      );
      onChanged();
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to auto-heal variants");
    } finally {
      setIsHealing(false);
    }
  };

  return { compositeVariants, isHealing, handleAutoHealCompositeVariants };
}
