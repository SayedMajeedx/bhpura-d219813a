import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { replaceUrlQuietly } from "@/lib/quiet-url";
import type { Product, Variant } from "@/features/inventory/types";
import {
  figuresOf,
  filterInventoryProducts,
  productFiguresFrom,
  productNeedsAttention,
  productStockStatus,
  salesByVariantFrom,
  variantsByProductFrom,
} from "@/features/inventory/lib/product-list";
import {
  activeFilterCount,
  inventoryViewToSearch,
  type InventoryView,
} from "@/features/inventory/lib/list-view";
import { stockTotals } from "@/features/inventory/lib/stock-totals";

/**
 * The inventory list: what it shows (tab, search, filters, sort, page, kept in the address),
 * each product's figures worked out once, the tabs' counts and the page of products to draw.
 */
export function useInventoryList({
  products,
  variants,
  salesHistory,
  initialView,
  lowStockUnits,
  pricesMatter,
  costsKnown = false,
  lang,
}: {
  products: Product[];
  variants: Variant[];
  salesHistory: any[];
  initialView: InventoryView;
  lowStockUnits: number;
  pricesMatter: boolean;
  /** The reader may see costs: only then is a product with no cost marked (zero for others). */
  costsKnown?: boolean;
  lang: "ar" | "en";
}) {
  const [view, setView] = useState<InventoryView>(initialView);
  const [pageSize, setPageSize] = useState(10);

  /** Changes the view. Anything but a page change starts again from the first page. */
  const change = useCallback((patch: Partial<InventoryView>) => {
    setView((current) => ({ ...current, page: 1, ...patch }));
  }, []);

  // A link followed while the list is open (the dashboard's "low stock") asks for a new view.
  // Compared by what it says, not by identity: a caller that builds the object on every render
  // must not reset the list on every render.
  const askedKey = JSON.stringify(initialView);
  const asked = useRef(askedKey);
  useEffect(() => {
    if (asked.current === askedKey) return;
    asked.current = askedKey;
    setView(JSON.parse(askedKey) as InventoryView);
  }, [askedKey]);

  // The address follows the view. Not the router: it would scroll the list back to the top.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const query = inventoryViewToSearch(window.location.search, view);
    replaceUrlQuietly(
      `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
    );
  }, [view]);

  const salesByVariant = useMemo(() => salesByVariantFrom(salesHistory), [salesHistory]);
  const variantsByProduct = useMemo(() => variantsByProductFrom(variants), [variants]);
  const figures = useMemo(
    () => productFiguresFrom(products, variantsByProduct, salesByVariant),
    [products, variantsByProduct, salesByVariant],
  );
  const productStock = useCallback((id: string) => figuresOf(figures, id).stock, [figures]);
  const productWeeklySales = useCallback(
    (id: string) => figuresOf(figures, id).weeklySales,
    [figures],
  );
  const lowestPrice = useCallback((id: string) => figuresOf(figures, id).lowestPrice, [figures]);
  const missingCost = useCallback(
    (id: string) => costsKnown && figuresOf(figures, id).missingCost,
    [figures, costsKnown],
  );

  const counts = useMemo(() => {
    const tally = {
      all: products.length,
      attention: 0,
      active: 0,
      inactive: 0,
      low: 0,
      out: 0,
      featured: 0,
      madeToOrder: 0,
    };
    for (const product of products) {
      const { stock, weeklySales, lowestPrice: price } = figuresOf(figures, product.id);
      const noCost = missingCost(product.id);
      const status = productStockStatus(product, stock, weeklySales, lowStockUnits);
      if (status === "low") tally.low += 1;
      if (status === "out") tally.out += 1;
      if (status === "made_to_order") tally.madeToOrder += 1;
      if (product.is_active) tally.active += 1;
      else tally.inactive += 1;
      if (product.featured_trending) tally.featured += 1;
      if (
        productNeedsAttention(product, {
          stock,
          weeklySales,
          lowStockUnits,
          lowestPrice: price,
          pricesMatter,
          missingCost: noCost,
        })
      ) {
        tally.attention += 1;
      }
    }
    return tally;
  }, [products, figures, lowStockUnits, pricesMatter, missingCost]);

  const totals = useMemo(
    () => stockTotals(products, variantsByProduct),
    [products, variantsByProduct],
  );

  const deferredSearch = useDeferredValue(view.search);
  const filtered = useMemo(
    () =>
      filterInventoryProducts({
        products,
        variantsByProduct,
        search: deferredSearch.trim().toLowerCase(),
        category: view.category,
        scope: view.scope,
        issue: view.issue,
        sortBy: view.sort,
        productStock,
        productWeeklySales,
        lowestPrice,
        lowStockUnits,
        pricesMatter,
        missingCost,
        lang,
      }),
    [
      products,
      variantsByProduct,
      deferredSearch,
      view.category,
      view.scope,
      view.issue,
      view.sort,
      productStock,
      productWeeklySales,
      lowestPrice,
      lowStockUnits,
      pricesMatter,
      missingCost,
      lang,
    ],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(view.page, totalPages);
  useEffect(() => {
    if (view.page > totalPages) setView((current) => ({ ...current, page: totalPages }));
  }, [view.page, totalPages]);
  const pageProducts = filtered.slice((page - 1) * pageSize, page * pageSize);

  return {
    view,
    change,
    setPage: (next: number) => setView((current) => ({ ...current, page: Math.max(1, next) })),
    pageSize,
    setPageSize: (size: number) => {
      setPageSize(size);
      setView((current) => ({ ...current, page: 1 }));
    },
    clearFilters: () => change({ search: "", category: "all", issue: "all", scope: "all" }),
    activeFilterCount: activeFilterCount(view),
    salesByVariant,
    variantsByProduct,
    productStock,
    productWeeklySales,
    lowestPrice,
    missingCost,
    counts,
    totals,
    filtered,
    page,
    pageProducts,
  };
}
