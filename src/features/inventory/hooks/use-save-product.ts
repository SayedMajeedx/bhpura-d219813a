import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/lib/brand-context";
import { useT } from "@/lib/i18n";
import { useEntitlements } from "@/lib/saas-billing/use-entitlements";
import type { Product } from "@/features/inventory/types";
import { prefetchOptionTranslations } from "@/features/inventory/lib/option-translations";
import {
  defaultVariantValues,
  productColumnsFrom,
  validateProductForm,
  type ProductForm,
  type ProductFormErrors,
} from "@/features/inventory/lib/product-form";

/**
 * Saves the product editor. Updating an active product with no variants adds a
 * default variant, and variants follow the product's cost and regular price.
 * Creating checks the plan's product limit and adds the default variant.
 */
export function useSaveProduct({
  product,
  form,
  isAr,
  setErrors,
  onInvalid,
  commitMedia,
  onSaved,
}: {
  product: Product | null;
  form: ProductForm;
  isAr: boolean;
  setErrors: (errors: ProductFormErrors) => void;
  /** Called after showing validation errors (the editor returns to the first step). */
  onInvalid: () => void;
  commitMedia: () => void;
  onSaved: (newProductId?: string) => void;
}) {
  const t = useT();
  const brand = useBrand();
  const { entitlements } = useEntitlements({ brandId: brand.id });

  return async (e: React.MouseEvent) => {
    e.preventDefault();
    const newErrors = validateProductForm(form, isAr);
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      onInvalid();
      return;
    }

    setErrors({});

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    let createdProductId: string | undefined;
    const columns = productColumnsFrom(form);

    if (product) {
      if (form.is_active) {
        const { count, error: variantCountError } = await supabase
          .from("product_variants")
          .select("id", { count: "exact", head: true })
          .eq("product_id", product.id);
        if (variantCountError) return toast.error(variantCountError.message);
        if (!count) {
          // Smart default: Automatically create a standard default variant so merchant isn't blocked
          await (supabase.from("product_variants") as any).insert({
            user_id: user.id,
            brand_id: brand.id,
            product_id: product.id,
            ...defaultVariantValues(form, isAr),
          });
        }
      }
      const patch = columns;
      const { error } = await (supabase as any).from("products").update(patch).eq("id", product.id);
      if (error) return toast.error(error.message);
      const { error: variantDefaultsError } = await (supabase.from("product_variants") as any)
        .update({ cost_price: patch.cost_price })
        .eq("product_id", product.id);
      if (variantDefaultsError) return toast.error(variantDefaultsError.message);
      const { error: inheritedPriceError } = await (supabase.from("product_variants") as any)
        .update({ selling_price: patch.base_price, original_price: null })
        .eq("product_id", product.id)
        .is("original_price", null);
      if (inheritedPriceError) return toast.error(inheritedPriceError.message);
      const { error: saleOriginalError } = await (supabase.from("product_variants") as any)
        .update({ original_price: patch.base_price })
        .eq("product_id", product.id)
        .not("original_price", "is", null);
      if (saleOriginalError) return toast.error(saleOriginalError.message);
    } else {
      const productLimit = entitlements?.limits?.["products.limit"];
      const isUnlimited = productLimit === -1;
      if (!isUnlimited && typeof productLimit === "number" && productLimit > 0) {
        const { count: currentProductCount } = await supabase
          .from("products")
          .select("id", { count: "exact", head: true })
          .eq("brand_id", brand.id);

        if ((currentProductCount || 0) >= productLimit) {
          return toast.error(
            isAr
              ? `لقد بلغت الحد الأقصى للمنتجات المسموح بها في باقتك (${productLimit} منتج). يرجى ترقية باقتك لإضافة المزيد.`
              : `You have reached the products limit for your plan (${productLimit} products). Please upgrade your plan to add more.`,
          );
        }
      }

      const payload = {
        user_id: user.id,
        brand_id: brand.id,
        ...columns,
      };
      const { data: newProd, error } = await (supabase.from("products") as any)
        .insert(payload)
        .select("id")
        .single();
      if (error) return toast.error(error.message);

      createdProductId = newProd?.id;
      // Auto-create default standard variant for instant purchaseability
      if (newProd?.id) {
        await (supabase.from("product_variants") as any).insert({
          user_id: user.id,
          brand_id: brand.id,
          product_id: newProd.id,
          ...defaultVariantValues(form, isAr),
        });
        prefetchOptionTranslations([form.fabric_type], isAr);
      }
    }
    commitMedia();
    if (product) {
      toast.success(t("common.save"));
    }
    onSaved(createdProductId);
  };
}
