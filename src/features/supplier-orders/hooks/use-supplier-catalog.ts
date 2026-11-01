import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { catalogQueries } from "@/lib/data/catalog";
import { variantsInUse } from "@/lib/variant-archive";
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
  // Archived sizes too: a past order's line still names its size. Only sizes in use are offered.
  const variantsQ = useQuery(catalogQueries.variantsWithArchived(brandId));

  // Built again only when the data changes (a query's own object is new on every render, and
  // a dialog that follows the lookups would render forever).
  const productsData = productsQ.data;
  const variantsData = variantsQ.data;
  const lookups = useMemo(() => {
    const products = (productsData ?? []) as unknown as CatalogProduct[];
    const everySize = (variantsData ?? []) as unknown as CatalogVariant[];
    const variants = variantsInUse(variantsData ?? []) as unknown as CatalogVariant[];
    const productById = new Map(products.map((p) => [p.id, p]));
    const variantById = new Map(everySize.map((v) => [v.id, v]));
    return {
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
  }, [productsData, variantsData, lang]);
  return { ...lookups, queries: [productsQ, variantsQ] };
}

export type SupplierCatalog = ReturnType<typeof useSupplierCatalog>;
