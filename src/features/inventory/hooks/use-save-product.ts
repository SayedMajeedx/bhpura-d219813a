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
  deleteVariants,
  syncVariantsWithProduct,
  updateProduct,
  updateVariant,
} from "@/lib/data/catalog";
import { savePackageItems } from "@/lib/data/service-packages";
import { saveServiceOptions } from "@/lib/data/service-options";
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
import {
  serviceFromPrice,
  servicePricingChanges,
  servicePricingError,
  type ServicePricing,
} from "@/features/inventory/lib/service-pricing";

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
  service,
  savedOptionIds = [],
}: {
  product: Product | null;
  form: ProductForm;
  isAr: boolean;
  setErrors: (errors: ProductFormErrors) => void;
  /** Called after showing validation errors (the editor returns to the first step). */
  onInvalid: () => void;
  commitMedia: () => void;
  onSaved: (newProductId?: string, kind?: "service" | "product") => void;
  /** The add-ons the service already has (the ones left out of the form are switched off). */
  savedOptionIds?: string[];
  /**
   * A service's prices and its current variants: saved as its variants
   * (one per length, or one fixed price) in place of a product's default
   * variant and price sync.
   */
  service?: {
    pricing: ServicePricing | null;
    variants: ReadonlyArray<{
      id: string;
      selling_price: number;
      duration_minutes?: number | null;
    }>;
  };
}) {
  const t = useT();
  const brand = useBrand();
  const { entitlements } = useEntitlements({ brandId: brand.id });

  return async (e: React.MouseEvent) => {
    e.preventDefault();
    const isService = form.item_kind === "service";
    const newErrors = validateProductForm(form, isAr);
    if (isService) {
      const pricingProblem = service?.pricing
        ? servicePricingError(service.pricing, isAr)
        : isAr
          ? "ما زالت الأسعار تُحمَّل، حاول بعد لحظة."
          : "The prices are still loading; try again in a moment.";
      if (pricingProblem) newErrors.price = pricingProblem;
      else delete newErrors.price;
    }
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
    // A service's base price is its "from" price: its lowest offered price.
    if (isService && service?.pricing) columns.base_price = serviceFromPrice(service.pricing);
    // A service's prices become its variants, each at the service's cost.
    const saveServicePrices = async (productId: string) => {
      if (!service?.pricing) return;
      const changes = servicePricingChanges(service.pricing, service.variants, isAr);
      if (changes.create.length) {
        await createVariants(
          brand.id,
          changes.create.map((values) => ({
            user_id: user.id,
            brand_id: brand.id,
            product_id: productId,
            cost_price: columns.cost_price,
            ...values,
          })),
        );
      }
      for (const { id, patch } of changes.update) {
        await updateVariant(brand.id, id, { ...patch, cost_price: columns.cost_price });
      }
      if (changes.remove.length) await deleteVariants(brand.id, changes.remove);
    };
    // What a package includes is saved after the product (the package flag comes first).
    const savePackage = async (productId: string, wasPackage: boolean) => {
      if (!form.is_package && !wasPackage) return;
      await savePackageItems(brand.id, productId, form.is_package ? form.package_items : []);
    };
    // A service's add-ons are saved with it (the ones taken out are switched off).
    const saveOptions = (productId: string) =>
      saveServiceOptions(brand.id, productId, form.service_options, savedOptionIds);
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

    if (product && isService) {
      try {
        await updateProduct(brand.id, product.id, columns);
        await saveServicePrices(product.id);
        await savePackage(product.id, Boolean(product.is_package));
        await saveOptions(product.id);
      } catch (error) {
        return toast.error(getFriendlyErrorMessage(error));
      }
    } else if (product) {
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
      if (isService) {
        await saveServicePrices(createdProductId).catch((error: unknown) => {
          defaultVariantError = error;
        });
        await saveOptions(createdProductId).catch((error: unknown) => {
          toast.error(
            isAr
              ? "تم حفظ الخدمة، لكن تعذر حفظ إضافاتها. افتحها وأعد المحاولة."
              : "The service was saved, but its add-ons were not. Open it and try again.",
            { description: getFriendlyErrorMessage(error) },
          );
        });
        await savePackage(createdProductId, false).catch((error: unknown) => {
          toast.error(
            isAr
              ? "تم حفظ الباقة، لكن تعذر حفظ الخدمات المضمّنة. افتحها وأعد المحاولة."
              : "The package was saved, but what it includes was not. Open it and try again.",
            { description: getFriendlyErrorMessage(error) },
          );
        });
      } else {
        await newDefaultVariant(createdProductId);
        prefetchOptionTranslations([form.fabric_type], isAr);
      }
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
    onSaved(createdProductId, isService ? "service" : "product");
  };
}
