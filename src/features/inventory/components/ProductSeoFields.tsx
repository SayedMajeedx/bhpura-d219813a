import type { Dispatch, SetStateAction } from "react";
import { SeoListingEditor } from "@/components/seo/SeoListingEditor";
import { useBrand } from "@/lib/brand-context";
import { storefrontCanonical } from "@/lib/seo/canonical";
import { writtenListing } from "@/lib/seo/listing";
import { productSnippet } from "@/features/product-page/lib/product-snippet";
import type { Product } from "@/features/inventory/types";
import type { ProductForm } from "@/features/inventory/lib/product-form";

/**
 * The title and description Google shows for a product, in each language. Left empty, the page
 * says what it always did: the product's name and the store, and its description (or, with none, a
 * sentence of what the page says, `productSnippet`). The preview is that same rule.
 */
export function ProductSeoFields({
  product,
  form,
  setForm,
  isAr,
}: {
  product: Product | null;
  form: ProductForm;
  setForm: Dispatch<SetStateAction<ProductForm>>;
  isAr: boolean;
}) {
  const brand = useBrand();

  return (
    <SeoListingEditor
      isAr={isAr}
      words={form}
      onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
      address={storefrontCanonical(brand, `product/${product?.id ?? ""}`.replace(/\/$/, ""))}
      listing={(lang) => {
        const name =
          (lang === "ar" ? form.name_ar || form.name_en : form.name_en || form.name_ar) || "";
        const storeName =
          (lang === "ar" ? brand.name_ar || brand.name_en : brand.name_en || brand.name_ar) ||
          brand.slug;
        const written = writtenListing(form, lang);
        const description = lang === "ar" ? form.description_ar : form.description_en;
        return {
          title: written.title || `${name} | ${storeName}`,
          description:
            written.description ||
            productSnippet({ name, description, storeName, lang, showPrice: false }),
          fallback: !written.title && !written.description,
        };
      }}
    />
  );
}
