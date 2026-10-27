import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { OffSaleControl } from "@/components/inventory/OffSaleControl";
import { invalidateCatalog, setProductOffSale } from "@/lib/data/catalog";
import { offSaleUntil, type AvailabilityProduct } from "@/lib/product-availability";
import { getFriendlyErrorMessage } from "@/lib/utils";

/**
 * In the product editor: take the product off sale for a while, or put it back. Saved at once,
 * apart from the editor's own save, like the made-to-order pause. A product whose category is off
 * sale says so; it comes back with its category.
 */
export function ProductOffSaleField({
  brandId,
  product,
  isAr,
}: {
  brandId: string;
  product: AvailabilityProduct & { id: string };
  isAr: boolean;
}) {
  const qc = useQueryClient();
  const [own, setOwn] = useState<string | null>(product.unavailable_until ?? null);
  const save = useMutation({
    mutationFn: (until: string | null) => setProductOffSale(brandId, product.id, until),
    onSuccess: (_result, until) => {
      setOwn(until);
      toast.success(
        until
          ? isAr
            ? "أُوقف المنتج عن البيع مؤقتًا."
            : "The product is off sale for now."
          : isAr
            ? "عاد المنتج للبيع."
            : "The product is back on sale.",
      );
      void invalidateCatalog(qc, brandId);
    },
    onError: (error) => toast.error(getFriendlyErrorMessage(error)),
  });
  const fromCategory = offSaleUntil({
    category_unavailable_until: product.category_unavailable_until,
  });

  return (
    <div className="space-y-2">
      <OffSaleControl
        isAr={isAr}
        subject="product"
        current={offSaleUntil({ unavailable_until: own })}
        pending={save.isPending}
        onSet={(until) => save.mutate(until)}
      />
      {fromCategory && (
        <p className="text-xs text-muted-foreground">
          {isAr
            ? "قسمه موقوف عن البيع أيضًا، ويعود معه."
            : "Its category is off sale too; it comes back with it."}
        </p>
      )}
    </div>
  );
}
