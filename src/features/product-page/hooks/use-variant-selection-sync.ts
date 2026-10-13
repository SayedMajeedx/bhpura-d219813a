import { useEffect, type Dispatch, type SetStateAction } from "react";
import type { StorefrontVariant as Variant } from "@/lib/data/storefront";
import { chosenVariant } from "@/features/product-page/lib/variant-options";

/**
 * Keeps the product page's option pickers and the chosen variant in step:
 * an axis with one value is pre-selected, a product with one variant selects
 * it, and a variant is chosen only once every option is (see chosenVariant).
 */
export function useVariantSelectionSync({
  variants,
  variantId,
  setVariantId,
  uniqueSizes,
  uniqueColors,
  uniqueFabrics,
  uniqueFour,
  uniqueFive,
  selectedSize,
  setSelectedSize,
  selectedColor,
  setSelectedColor,
  selectedFabric,
  setSelectedFabric,
  selectedOptionFour,
  setSelectedOptionFour,
  selectedOptionFive,
  setSelectedOptionFive,
}: {
  variants: Variant[];
  variantId: string | null;
  setVariantId: Dispatch<SetStateAction<string | null>>;
  uniqueSizes: string[];
  uniqueColors: string[];
  uniqueFabrics: string[];
  uniqueFour: string[];
  uniqueFive: string[];
  selectedSize: string | null;
  setSelectedSize: Dispatch<SetStateAction<string | null>>;
  selectedColor: string | null;
  setSelectedColor: Dispatch<SetStateAction<string | null>>;
  selectedFabric: string | null;
  setSelectedFabric: Dispatch<SetStateAction<string | null>>;
  selectedOptionFour: string | null;
  setSelectedOptionFour: Dispatch<SetStateAction<string | null>>;
  selectedOptionFive: string | null;
  setSelectedOptionFive: Dispatch<SetStateAction<string | null>>;
}) {
  // Pre-select single options if an axis has only 1 choice available
  useEffect(() => {
    if (uniqueSizes.length === 1 && !selectedSize) {
      setSelectedSize(uniqueSizes[0]);
    }
  }, [uniqueSizes, selectedSize, setSelectedSize]);

  useEffect(() => {
    if (uniqueColors.length === 1 && !selectedColor) {
      setSelectedColor(uniqueColors[0]);
    }
  }, [uniqueColors, selectedColor, setSelectedColor]);

  useEffect(() => {
    if (uniqueFabrics.length === 1 && !selectedFabric) {
      setSelectedFabric(uniqueFabrics[0]);
    }
  }, [uniqueFabrics, selectedFabric, setSelectedFabric]);

  useEffect(() => {
    if (uniqueFour.length === 1 && !selectedOptionFour) {
      setSelectedOptionFour(uniqueFour[0]);
    }
  }, [uniqueFour, selectedOptionFour, setSelectedOptionFour]);

  useEffect(() => {
    if (uniqueFive.length === 1 && !selectedOptionFive) {
      setSelectedOptionFive(uniqueFive[0]);
    }
  }, [uniqueFive, selectedOptionFive, setSelectedOptionFive]);

  // Auto-initialize attributes only when a single variant is available
  useEffect(() => {
    if (variants.length === 1 && !variantId) {
      const first = variants[0];
      setVariantId(first.id);
      setSelectedColor(first.color ?? null);
      setSelectedSize(first.size ?? null);
      setSelectedFabric(first.fabric ?? null);
      setSelectedOptionFour(first.option_four ?? null);
      setSelectedOptionFive(first.option_five ?? null);
    }
  }, [
    variants,
    variantId,
    setVariantId,
    setSelectedColor,
    setSelectedSize,
    setSelectedFabric,
    setSelectedOptionFour,
    setSelectedOptionFive,
  ]);

  // The chosen options name a variant only once every option offered with
  // more than one value is chosen; until then none is picked for the shopper.
  useEffect(() => {
    const match = chosenVariant(
      variants,
      {
        size: selectedSize,
        color: selectedColor,
        fabric: selectedFabric,
        four: selectedOptionFour,
        five: selectedOptionFive,
      },
      {
        size: uniqueSizes,
        color: uniqueColors,
        fabric: uniqueFabrics,
        four: uniqueFour,
        five: uniqueFive,
      },
    );
    setVariantId(match?.id ?? null);
  }, [
    selectedColor,
    selectedSize,
    selectedFabric,
    selectedOptionFour,
    selectedOptionFive,
    variants,
    uniqueSizes,
    uniqueColors,
    uniqueFabrics,
    uniqueFour,
    uniqueFive,
    setVariantId,
  ]);
}
