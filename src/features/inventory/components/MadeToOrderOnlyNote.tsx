import { useVocabulary } from "@/hooks/use-vocabulary";
import { isPlaceholderVariant } from "@/lib/variant-sku-utils";

type NoteProduct = { is_made_to_order?: boolean | null } | null | undefined;
type NoteVariant = {
  size?: string | null;
  color?: string | null;
  fabric?: string | null;
  option_four?: string | null;
  option_five?: string | null;
  stock_main?: number | null;
  stock_incubator?: number | null;
};

/**
 * The "Standard" variant of a made-to-order product that has no ready piece: it only exists so
 * the product has a price and can be ordered. Counting stock on it means nothing (a shopper is
 * never offered it as a ready size), so its row shows this note instead of stock steppers.
 */
export function isMadeToOrderOnlyVariant(product: NoteProduct, variant: NoteVariant): boolean {
  return (
    Boolean(product?.is_made_to_order) &&
    isPlaceholderVariant(variant) &&
    Number(variant.stock_main ?? 0) + Number(variant.stock_incubator ?? 0) <= 0
  );
}

export function MadeToOrderOnlyNote({
  isAr,
  className = "",
}: {
  isAr: boolean;
  className?: string;
}) {
  const { vocabulary } = useVocabulary();
  const lang = isAr ? "ar" : "en";
  return (
    <div className={`text-xs text-muted-foreground ${className}`}>
      <span className="block font-semibold text-foreground">
        {vocabulary.made_to_order?.[lang] || (isAr ? "حسب الطلب" : "Made to order")}
      </span>
      <span className="block">
        {isAr
          ? "لا مخزون جاهز لهذا المنتج. أضف مقاساً جاهزاً لبيع قطع جاهزة."
          : "This product has no ready stock. Add a ready size to sell ready pieces."}
      </span>
    </div>
  );
}
