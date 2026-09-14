import { useStorefront } from "@/lib/storefront-context";
import { resolveSizeGuideForProduct } from "../../lib/size-guide";
import { SizeGuideModal } from "./SizeGuideModal";

export function SizeGuideModalSlot({
  product,
  selectedSize,
  onSelectSize,
}: {
  product?: any;
  selectedSize?: string | null;
  onSelectSize?: (size: string) => void;
}) {
  const { lang, sizeGuides } = useStorefront();
  const isAr = lang === "ar";
  if (!product) return null;

  const resolvedGuide = resolveSizeGuideForProduct({
    product: {
      size_guide_id: product?.size_guide_id,
      size_guide_hidden: product?.size_guide_hidden,
      category: product?.category,
    },
    sizeGuides: (sizeGuides as any) ?? [],
  });

  return (
    <SizeGuideModal
      isAr={isAr}
      productName={product.name}
      guide={resolvedGuide}
      selectedSize={selectedSize}
      onSelectSize={onSelectSize}
    />
  );
}
export default SizeGuideModalSlot;
