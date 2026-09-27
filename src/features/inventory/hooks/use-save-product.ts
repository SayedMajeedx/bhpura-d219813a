import { toast } from "sonner";
import { useBrand } from "@/lib/brand-context";
import { useT } from "@/lib/i18n";
import { useEntitlements } from "@/lib/saas-billing/use-entitlements";
import { getFriendlyErrorMessage } from "@/lib/utils";
import {
  countAdminProducts,
  countProductVariants,
  createProduct,
  createVariants,
  syncVariantsWithProduct,
  updateProduct,
} from "@/lib/data/catalog";
import type { Product } from "@/features/inventory/types";
import { prefetchOptionTranslations } from "@/features/inventory/lib/option-translations";
import {
  defaultVariantValues,
  productColumnsFrom,
  validateProductForm,
  type ProductForm,
  type ProductFormErrors,
} from "@/features/inventory/lib/product-form";
import { getCurrentUser } from "@/lib/auth/session";

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

    const user = await getCurrentUser();
    if (!user) return;

    let createdProductId: string | undefined;
    // The default variant makes the product buyable. When it fails the product
    // is still saved, and the merchant is told it has no variant yet.
    let defaultVariantError: unknown = null;
    const columns = productColumnsFrom(form);
    const newDefaultVariant = (productId: string) =>
      createVariants(brand.id, [
        {
          user_id: user.id,
          brand_id: brand.id,
          product_id: productId,
          ...defaultVariantValues(form, isAr),
        },
      ]).catch((error: unknown) => {
        defaultVariantError = error;
      });

    if (product) {
      try {
        if (form.is_active) {
          const count = await countProductVariants(brand.id, product.id);
          // An active product with no variant gets a default one.
          if (!count) await newDefaultVariant(product.id);
        }
        await updateProduct(brand.id, product.id, columns);
        await syncVariantsWithProduct(brand.id, product.id, columns);
      } catch (error) {
        return toast.error(getFriendlyErrorMessage(error));
      }
    } else {
      const productLimit = entitlements?.limits?.["products.limit"];
      const isUnlimited = productLimit === -1;
      if (!isUnlimited && typeof productLimit === "number" && productLimit > 0) {
        const currentProductCount = await countAdminProducts(brand.id);

        if (currentProductCount >= productLimit) {
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
      try {
        createdProductId = await createProduct(brand.id, payload);
      } catch (error) {
        return toast.error(getFriendlyErrorMessage(error));
      }
      await newDefaultVariant(createdProductId);
      prefetchOptionTranslations([form.fabric_type], isAr);
    }
    commitMedia();
    if (defaultVariantError) {
      toast.error(
        isAr
          ? "تم حفظ المنتج، لكن تعذر إنشاء المتغير الافتراضي، فلا يمكن شراؤه بعد. أضف متغيراً من تبويب المتغيرات."
          : "The product was saved, but its default variant could not be created, so it cannot be bought yet. Add a variant in the Variants tab.",
        { description: getFriendlyErrorMessage(defaultVariantError) },
      );
    } else if (product) {
      toast.success(t("common.save"));
    }
    onSaved(createdProductId);
  };
}
