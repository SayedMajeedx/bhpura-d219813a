import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getCurrentUser } from "@/lib/auth/session";
import { useEntitlements } from "@/lib/saas-billing/use-entitlements";
import { getFriendlyErrorMessage } from "@/lib/utils";
import {
  catalogKeys,
  countAdminProducts,
  createProduct,
  createVariants,
  deleteProducts,
} from "@/lib/data/catalog";
import {
  newProductColumns,
  newProductProblems,
  newProductSizes,
  type NewProductForm,
} from "../lib/new-product";

/**
 * Makes a product from inside a supplier's order: hidden from the store, with its sizes and no
 * stock, within the store's plan limit. The catalog is read again before the order takes it, so
 * the order's card shows its sizes at once. A product whose sizes could not be made is removed,
 * so no product is left that cannot be ordered or sold.
 */
export function useCreateOrderProduct(brandId: string, isAr: boolean) {
  const qc = useQueryClient();
  const { entitlements } = useEntitlements({ brandId });
  const [saving, setSaving] = useState(false);

  const create = async (form: NewProductForm): Promise<string | null> => {
    if (newProductProblems(form).length > 0) return null;
    setSaving(true);
    try {
      const user = await getCurrentUser();
      if (!user) return null;
      const limit = entitlements?.limits?.["products.limit"];
      if (typeof limit === "number" && limit > 0 && (await countAdminProducts(brandId)) >= limit) {
        toast.error(
          isAr
            ? `بلغت الحد الأقصى للمنتجات في باقتك (${limit}). رقِّ باقتك لإضافة المزيد.`
            : `You have reached your plan's products limit (${limit}). Upgrade your plan to add more.`,
        );
        return null;
      }
      const productId = await createProduct(brandId, {
        user_id: user.id,
        brand_id: brandId,
        ...newProductColumns(form),
      });
      try {
        await createVariants(
          brandId,
          newProductSizes(form).map((size) => ({
            user_id: user.id,
            brand_id: brandId,
            product_id: productId,
            ...size,
          })),
        );
      } catch (error) {
        await deleteProducts(brandId, [productId]).catch(() => undefined);
        throw error;
      }
      await Promise.all([
        qc.refetchQueries({ queryKey: catalogKeys.products(brandId) }),
        qc.refetchQueries({ queryKey: catalogKeys.variants(brandId) }),
      ]);
      return productId;
    } catch (error) {
      toast.error(isAr ? "تعذر إنشاء المنتج." : "The product could not be made.", {
        description: getFriendlyErrorMessage(error),
      });
      return null;
    } finally {
      setSaving(false);
    }
  };

  return { create, saving };
}
