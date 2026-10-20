import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { catalogQueries } from "@/lib/data/catalog";
import {
  productLabel,
  shelfOf,
  sizeLabel,
  sizesByProduct,
  type CatalogProduct,
  type CatalogVariant,
} from "../lib/catalog";

/** The store's products and sizes for a supplier's order (the inventory's own cached reads). */
export function useSupplierCatalog(brandId: string, lang: "ar" | "en") {
  const productsQ = useQuery(catalogQueries.products(brandId));
  const variantsQ = useQuery(catalogQueries.variants(brandId));

  return useMemo(() => {
    const products = (productsQ.data ?? []) as unknown as CatalogProduct[];
    const variants = (variantsQ.data ?? []) as unknown as CatalogVariant[];
    const productById = new Map(products.map((p) => [p.id, p]));
    const variantById = new Map(variants.map((v) => [v.id, v]));
    return {
      queries: [productsQ, variantsQ],
      products,
      variants,
      sizes: sizesByProduct(variants),
      productById,
      variantById,
      shelf: shelfOf(variants),
      productName: (id: string | null | undefined) =>
        productLabel(id ? productById.get(id) : null, lang),
      sizeName: (id: string | null | undefined) => sizeLabel(id ? variantById.get(id) : null, lang),
    };
  }, [productsQ, variantsQ, lang]);
}

export type SupplierCatalog = ReturnType<typeof useSupplierCatalog>;
