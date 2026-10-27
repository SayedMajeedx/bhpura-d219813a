import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { OffSaleControl } from "@/components/inventory/OffSaleControl";
import { invalidateCatalog } from "@/lib/data/catalog";
import { invalidateCategories, updateCategory } from "@/lib/data/categories";
import { offSaleUntil } from "@/lib/product-availability";
import { getFriendlyErrorMessage } from "@/lib/utils";

/**
 * In a category's dialog: take every product filed under it off sale for a while, or put them
 * back. Saved at once. The database carries the moment to each product; a product keeps its own
 * setting and comes back as it was when the category does (migration 20261027120000).
 */
export function CategoryOffSaleField({
  brandId,
  category,
  isAr,
}: {
  brandId: string;
  category: { id: string; unavailable_until?: string | null };
  isAr: boolean;
}) {
  const qc = useQueryClient();
  const [until, setUntil] = useState<string | null>(category.unavailable_until ?? null);
  const save = useMutation({
    mutationFn: (next: string | null) =>
      updateCategory(brandId, category.id, { unavailable_until: next }),
    onSuccess: (_result, next) => {
      setUntil(next);
      toast.success(
        next
          ? isAr
            ? "أُوقف القسم عن البيع مؤقتًا."
            : "The category is off sale for now."
          : isAr
            ? "عاد القسم للبيع."
            : "The category is back on sale.",
      );
      void invalidateCategories(qc, brandId);
      void invalidateCatalog(qc, brandId);
    },
    onError: (error) => toast.error(getFriendlyErrorMessage(error)),
  });
  return (
    <OffSaleControl
      isAr={isAr}
      subject="category"
      current={offSaleUntil({ unavailable_until: until })}
      pending={save.isPending}
      onSet={(next) => save.mutate(next)}
    />
  );
}
