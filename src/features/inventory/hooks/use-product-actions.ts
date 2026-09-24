import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { printLabels } from "@/components/barcode-label";
import { useBrand } from "@/lib/brand-context";
import { useT } from "@/lib/i18n";
import { deletePublicMediaUrl } from "@/lib/r2-upload";
import { getStorefrontUrl } from "@/lib/storefront-url";
import { useEntitlements } from "@/lib/saas-billing/use-entitlements";
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
    const { error } = await supabase.from("products").delete().eq("id", id).eq("brand_id", brandId);
    if (error) toast.error(error.message);
    else {
      const urls = new Set(
        [product?.image_url, ...(product?.media ?? []).map((item) => item.url)].filter(
          (url): url is string => Boolean(url),
        ),
      );
      for (const url of urls) void deletePublicMediaUrl(brandId, url).catch(() => undefined);
      toast.success(t("common.delete"));
      onChanged();
    }
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

      const { data: insertedProduct, error: prodErr } = await (supabase.from("products") as any)
        .insert(duplicateProductValues(productToDuplicate, brandId, isAr))
        .select()
        .single();

      if (prodErr || !insertedProduct) {
        toast.error(
          prodErr?.message || (isAr ? "فشل تكرار المنتج" : "Failed to duplicate product"),
        );
        return;
      }

      const originalVariants = variants.filter((v) => v.product_id === productToDuplicate.id);
      if (originalVariants.length > 0) {
        await (supabase.from("product_variants") as any).insert(
          duplicateVariantValues(originalVariants, insertedProduct.id, brandId),
        );
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
    const [
      { data: freshProducts, error: productsError },
      { data: freshVariants, error: variantsError },
    ] = await Promise.all([
      supabase
        .from("products")
        .select("id, name")
        .eq("brand_id", brandId)
        .order("created_at", { ascending: false }),
      supabase
        .from("product_variants")
        .select("product_id, barcode, size, color, selling_price")
        .eq("brand_id", brandId)
        .not("barcode", "is", null)
        .order("created_at"),
    ]);

    if (productsError || variantsError) {
      toast.error(
        productsError?.message ??
          variantsError?.message ??
          (isAr ? "تعذر تحميل الباركودات" : "Could not load barcodes"),
      );
      return;
    }

    const labels = barcodeLabelsFor(
      (freshProducts ?? products) as Pick<Product, "id" | "name">[],
      (freshVariants ?? variants) as Pick<
        Variant,
        "product_id" | "barcode" | "size" | "color" | "selling_price"
      >[],
      businessName,
    );
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
