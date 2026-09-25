import { toast } from "sonner";
import { printLabels } from "@/components/barcode-label";
import { useBrand } from "@/lib/brand-context";
import { useT } from "@/lib/i18n";
import { deletePublicMediaUrl } from "@/lib/r2-upload";
import { getStorefrontUrl } from "@/lib/storefront-url";
import { useEntitlements } from "@/lib/saas-billing/use-entitlements";
import { getFriendlyErrorMessage } from "@/lib/utils";
import {
  createProduct,
  createVariants,
  deleteProducts,
  fetchBarcodeLabelData,
} from "@/lib/data/catalog";
import type { Product, Variant } from "@/features/inventory/types";
import {
  barcodeLabelsFor,
  duplicateProductValues,
  duplicateVariantValues,
} from "@/features/inventory/lib/product-list";

/**
 * Per-product actions in the inventory list: delete (with its media),
 * duplicate as a draft, preview, share, and barcode label printing.
 */
export function useProductActions({
  products,
  variants,
  variantsByProduct,
  businessName,
  isAr,
  onChanged,
}: {
  products: Product[];
  variants: Variant[];
  variantsByProduct: Record<string, Variant[]>;
  businessName: string | null;
  isAr: boolean;
  onChanged: () => void;
}) {
  const t = useT();
  const brand = useBrand();
  const brandId = brand.id;
  const { entitlements } = useEntitlements({ brandId });

  const del = async (id: string) => {
    const product = products.find((item) => item.id === id);
    try {
      await deleteProducts(brandId, [id]);
    } catch (error) {
      toast.error(getFriendlyErrorMessage(error));
      return;
    }
    const urls = new Set(
      [product?.image_url, ...(product?.media ?? []).map((item) => item.url)].filter(
        (url): url is string => Boolean(url),
      ),
    );
    for (const url of urls) void deletePublicMediaUrl(brandId, url).catch(() => undefined);
    toast.success(t("common.delete"));
    onChanged();
  };

  const handleDuplicateProduct = async (productToDuplicate: Product) => {
    try {
      const productLimit = entitlements?.limits?.["products.limit"];
      const isUnlimited = productLimit === -1;
      if (!isUnlimited && typeof productLimit === "number" && productLimit > 0) {
        const currentCount = products.length;
        if (currentCount >= productLimit) {
          toast.error(
            isAr
              ? `لقد بلغت الحد الأقصى للمنتجات المسموح بها في باقتك (${productLimit} منتج). يرجى ترقية باقتك لتكرار المنتجات.`
              : `You have reached the products limit for your plan (${productLimit} products). Please upgrade your plan to duplicate products.`,
          );
          return;
        }
      }

      let insertedProductId: string;
      try {
        insertedProductId = await createProduct(
          brandId,
          duplicateProductValues(productToDuplicate, brandId, isAr),
        );
      } catch (prodErr) {
        toast.error(
          getFriendlyErrorMessage(prodErr) ||
            (isAr ? "فشل تكرار المنتج" : "Failed to duplicate product"),
        );
        return;
      }

      const originalVariants = variants.filter((v) => v.product_id === productToDuplicate.id);
      if (originalVariants.length > 0) {
        // Best-effort, its error is ignored as before (bug backlog #16).
        await createVariants(
          brandId,
          duplicateVariantValues(originalVariants, insertedProductId, brandId),
        ).catch(() => undefined);
      }

      toast.success(
        isAr ? "تم تكرار المنتج كمسودة بنجاح" : "Product duplicated as draft successfully",
      );
      onChanged();
    } catch (err: any) {
      toast.error(err?.message || (isAr ? "حدث خطأ أثناء التكرار" : "Error duplicating product"));
    }
  };

  const handlePreviewProduct = (product: Product) => {
    const url = getStorefrontUrl(brand, `/product/${product.id}`);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleShareProduct = async (product: Product) => {
    const storeUrl = getStorefrontUrl(brand, `/product/${product.id}`);
    const title = isAr ? product.name_ar || product.name : product.name_en || product.name;
    if (navigator.share) {
      try {
        await navigator.share({
          title,
          url: storeUrl,
        });
        return;
      } catch {
        // user cancelled or fallback
      }
    }
    try {
      await navigator.clipboard.writeText(storeUrl);
      toast.success(isAr ? "تم نسخ رابط المنتج" : "Product link copied");
    } catch {
      toast.error(isAr ? "فشل نسخ الرابط" : "Failed to copy link");
    }
  };

  /** Labels for every barcode in the store, read fresh so new variants are included. */
  const printAll = async () => {
    let fresh: Awaited<ReturnType<typeof fetchBarcodeLabelData>>;
    try {
      fresh = await fetchBarcodeLabelData(brandId);
    } catch (error) {
      toast.error(
        getFriendlyErrorMessage(error) ||
          (isAr ? "تعذر تحميل الباركودات" : "Could not load barcodes"),
      );
      return;
    }

    const labels = barcodeLabelsFor(fresh.products, fresh.variants, businessName);
    if (labels.length === 0) {
      toast.error(isAr ? "لا توجد باركودات للطباعة" : "No barcodes to print");
      return;
    }
    printLabels(labels);
  };

  const printProductLabels = (prod: Product) => {
    const labels = barcodeLabelsFor([prod], variantsByProduct[prod.id] || [], businessName);
    if (labels.length > 0) printLabels(labels);
    else toast.error(isAr ? "لا يوجد باركود لهذا المنتج" : "No barcode for this product");
  };

  return {
    del,
    handleDuplicateProduct,
    handlePreviewProduct,
    handleShareProduct,
    printAll,
    printProductLabels,
  };
}
