import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { catalogQueries } from "@/lib/data/catalog";
import { usualSizes } from "@/lib/size-choices";
import { SizeChoicesField } from "@/components/inventory/SizeChoicesField";
import { resolveVariantListAxes } from "@/features/inventory/hooks/use-inventory-axis-defaults";
import type { ProductDialogData } from "@/features/inventory/hooks/use-product-dialog-data";
import type { ProductForm } from "@/features/inventory/lib/product-form";

/**
 * A new product's sizes, before its first save, in the store's own word for them: the sizes the
 * store already sells in one tap, each with its opening pieces. Saving makes exactly those sizes
 * (`newProductVariants`); with none chosen the product is sold with no options.
 */
export function NewProductSizesField({
  brandId,
  addonAxisDefaults,
  form,
  setForm,
  isAr,
}: {
  brandId: string;
  addonAxisDefaults: ProductDialogData["addonAxisDefaults"];
  form: ProductForm;
  setForm: (update: (form: ProductForm) => ProductForm) => void;
  isAr: boolean;
}) {
  const variantsQ = useQuery(catalogQueries.variants(brandId));
  const offered = useMemo(() => usualSizes(variantsQ.data ?? []), [variantsQ.data]);
  const sizeWord = resolveVariantListAxes(null, addonAxisDefaults, isAr ? "ar" : "en", []).size
    .label;
  const piecesWord = form.is_made_to_order
    ? isAr
      ? "قطع جاهزة"
      : "Ready pieces"
    : isAr
      ? "الكمية"
      : "Quantity";

  return (
    <SizeChoicesField
      legend={isAr ? `${sizeWord} (اختياري)` : `${sizeWord} (optional)`}
      offered={offered}
      sizes={form.sizes}
      onSizes={(sizes) => setForm((f) => ({ ...f, sizes }))}
      stock={form.size_stock}
      onStock={(size, typed) =>
        setForm((f) => ({ ...f, size_stock: { ...f.size_stock, [size]: typed } }))
      }
      stockLabel={piecesWord}
      hint={
        form.sizes.length === 0
          ? isAr
            ? "بلا اختيار: يُباع المنتج بدون خيارات. يمكنك إضافة المقاسات والألوان بعد الحفظ أيضاً."
            : "None chosen: it is sold with no options. You can add sizes and colours after saving too."
          : isAr
            ? "اكتب الكمية الجاهزة بجانب كل مقاس."
            : "Type the pieces you have beside each size."
      }
      isAr={isAr}
    />
  );
}
