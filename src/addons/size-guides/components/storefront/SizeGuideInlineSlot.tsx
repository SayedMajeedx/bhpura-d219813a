import { useStorefront } from "@/lib/storefront-context";
import { resolveSizeGuideForProduct } from "../../lib/size-guide";
import { SizeGuideInline } from "./size-guide/SizeGuideInline";

export function SizeGuideInlineSlot({
  product,
  selectedSize,
  onSelectSize,
}: {
  product?: any;
  selectedSize?: string | null;
  onSelectSize?: (size: string) => void;
}) {
  const { sizeGuides } = useStorefront();
  if (!product) return null;

  const resolvedGuide = resolveSizeGuideForProduct({
    product: {
      size_guide_id: product?.size_guide_id,
      size_guide_hidden: product?.size_guide_hidden,
      category: product?.category,
    },
    sizeGuides: (sizeGuides as any) ?? [],
  });

  if (!resolvedGuide) return null;

  return (
    <div className="mt-8 border-t border-border pt-6">
      <SizeGuideInline
        guide={resolvedGuide}
        selectedSize={selectedSize}
        onSelectSize={onSelectSize}
      />
    </div>
  );
}
export default SizeGuideInlineSlot;
