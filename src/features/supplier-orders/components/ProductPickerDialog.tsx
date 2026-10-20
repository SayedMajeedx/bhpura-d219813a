import { useId, useMemo, useState } from "react";
import { Package, Plus, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { productLabel, searchProducts } from "../lib/catalog";
import type { SupplierCatalog } from "../hooks/use-supplier-catalog";

/** Most products listed at once: a search narrows a long catalog. */
const SHOWN = 60;

/** Picks a product to order from the supplier (one already in the order is not offered). */
export function ProductPickerDialog({
  open,
  onOpenChange,
  catalog,
  taken,
  onPick,
  onNewProduct,
  lang,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalog: SupplierCatalog;
  taken: ReadonlySet<string>;
  onPick: (productId: string) => void;
  /** A product that is not in the store yet, starting from what was typed in the search. */
  onNewProduct: (name: string) => void;
  lang: "ar" | "en";
}) {
  const isAr = lang === "ar";
  const searchId = useId();
  const [query, setQuery] = useState("");
  const found = useMemo(
    () => searchProducts(catalog.products, catalog.sizes, query).filter((p) => !taken.has(p.id)),
    [catalog.products, catalog.sizes, query, taken],
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setQuery("");
        onOpenChange(next);
      }}
    >
      <DialogContent dir={isAr ? "rtl" : "ltr"} className="max-w-lg gap-3">
        <DialogHeader>
          <DialogTitle>{isAr ? "إضافة منتج للطلبية" : "Add a product to the order"}</DialogTitle>
          <DialogDescription>
            {isAr
              ? "اختر منتجاً من متجرك، أو أنشئ منتجاً جديداً لم يدخل المتجر بعد."
              : "Choose a product from your store, or make a new one that is not in it yet."}
          </DialogDescription>
        </DialogHeader>
        <button
          type="button"
          onClick={() => {
            onNewProduct(query);
            setQuery("");
          }}
          className="flex w-full min-w-0 items-center gap-3 rounded-lg border border-dashed border-primary/40 p-2.5 text-start hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
            <Plus className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">
              {isAr ? "منتج جديد" : "New product"}
              {query.trim() && (
                <span dir="auto" className="font-normal">
                  {isAr ? `: «${query.trim()}»` : `: “${query.trim()}”`}
                </span>
              )}
            </span>
            <span className="block text-xs text-muted-foreground">
              {isAr
                ? "تشكيلة جديدة: الاسم والمقاسات والسعر، ويبقى مخفياً عن المتجر"
                : "A new collection: name, sizes and price, kept hidden from the store"}
            </span>
          </span>
        </button>
        <div className="relative">
          <Search
            className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <label htmlFor={searchId} className="sr-only">
            {isAr ? "ابحث عن منتج" : "Search products"}
          </label>
          <Input
            id={searchId}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={isAr ? "اسم المنتج أو رمز SKU" : "Product name or SKU"}
            className="ps-9"
            autoFocus
          />
        </div>
        <ul className="max-h-[55vh] min-w-0 space-y-1 overflow-y-auto">
          {found.length === 0 ? (
            <li className="p-4 text-center text-sm text-muted-foreground">
              {isAr ? "لا توجد منتجات بهذا الاسم." : "No products match."}
            </li>
          ) : (
            found.slice(0, SHOWN).map((product) => {
              const sizes = catalog.sizes.get(product.id) ?? [];
              return (
                <li key={product.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick(product.id);
                      setQuery("");
                    }}
                    className="flex w-full min-w-0 items-center gap-3 rounded-lg p-2 text-start hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt=""
                        loading="lazy"
                        className="h-11 w-11 shrink-0 rounded-md object-cover"
                      />
                    ) : (
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-muted">
                        <Package className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span
                        dir="auto"
                        className="text-page-start line-clamp-2 break-words text-sm font-semibold"
                      >
                        {productLabel(product, lang)}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {isAr
                          ? sizes.length === 1
                            ? "مقاس واحد"
                            : `${sizes.length} مقاسات`
                          : sizes.length === 1
                            ? "1 size"
                            : `${sizes.length} sizes`}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })
          )}
          {found.length > SHOWN && (
            <li className="p-2 text-center text-xs text-muted-foreground">
              {isAr
                ? `و${found.length - SHOWN} غيرها: اكتب جزءاً من الاسم.`
                : `${found.length - SHOWN} more: type part of the name.`}
            </li>
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
