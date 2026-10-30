import { EyeOff, LayoutGrid, List, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { formatMoney } from "@/lib/format";
import { productCover } from "@/lib/product-photo";
import { PRODUCT_PHOTO_CLASS, type ProductPhotoRatio } from "@/lib/brand-templates/design-presets";
import { StockLevelBadge } from "@/components/inventory/StockLevelBadge";
import { AttentionMarks } from "@/components/inventory/AttentionMarks";
import { productAttentionReasons } from "@/features/inventory/lib/attention";
import type { InventoryLayout } from "@/features/inventory/lib/list-view";
import type { Product } from "@/features/inventory/types";

/**
 * The inventory as the products' photos: a boutique knows a piece by its picture before its
 * name. Each card is the photo in the store's own card shape, the name, the lowest price, the
 * stock badge and the same attention marks as a row (`productAttentionReasons`); a tap opens the
 * product, and its box selects it for the bulk actions as a row's does.
 */
export function InventoryPhotoGrid({
  lang,
  products,
  photoRatio,
  currency,
  productStock,
  lowestPrice,
  weeklySalesOf,
  missingCostOf,
  lowStockUnits,
  pricesMatter,
  selectedProductIds,
  onToggleSelected,
  onEdit,
}: {
  lang: "ar" | "en";
  products: Product[];
  /** The store's card shape (`productCardRatio`). */
  photoRatio: ProductPhotoRatio;
  currency: string;
  productStock: (id: string) => number;
  lowestPrice: (id: string) => number;
  weeklySalesOf: (id: string) => number;
  missingCostOf: (id: string) => boolean;
  lowStockUnits: number;
  pricesMatter: boolean;
  selectedProductIds: ReadonlySet<string>;
  onToggleSelected: (id: string) => void;
  onEdit: (product: Product) => void;
}) {
  const isAr = lang === "ar";
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {products.map((product) => {
        const name = (isAr ? product.name_ar : product.name_en) || product.name;
        const cover = productCover(product);
        const stock = productStock(product.id);
        const price = lowestPrice(product.id);
        const reasons = productAttentionReasons(product, {
          stock,
          weeklySales: weeklySalesOf(product.id),
          lowStockUnits,
          lowestPrice: price,
          pricesMatter,
          missingCost: missingCostOf(product.id),
        });
        return (
          <li
            key={product.id}
            id={`product-row-${product.id}`}
            className="relative flex min-w-0 flex-col overflow-hidden rounded-xl border border-border-subtle bg-card shadow-2xs"
          >
            <span
              className={`relative block w-full overflow-hidden bg-muted ${PRODUCT_PHOTO_CLASS[photoRatio]}`}
            >
              {cover ? (
                <img
                  src={cover}
                  alt=""
                  loading="lazy"
                  className={`h-full w-full object-cover ${product.is_active ? "" : "opacity-60"}`}
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center">
                  <Package className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
                </span>
              )}
              {!product.is_active && (
                <span className="absolute bottom-2 start-2 inline-flex items-center gap-1 rounded-md bg-background/90 px-2 py-0.5 text-xs font-semibold text-foreground">
                  <EyeOff className="h-3 w-3" aria-hidden="true" />
                  {isAr ? "مخفي" : "Hidden"}
                </span>
              )}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1 p-2.5">
              <span
                dir="auto"
                className="line-clamp-2 break-words text-page-start text-sm font-semibold text-foreground"
              >
                {name}
              </span>
              {price > 0 && (
                <span className="text-xs font-bold text-foreground">
                  {formatMoney(price, currency, lang)}
                </span>
              )}
              <div className="mt-auto flex flex-col gap-1 pt-1">
                <StockLevelBadge
                  product={product}
                  totalStock={stock}
                  lang={lang}
                  lowStockUnits={lowStockUnits}
                />
                <AttentionMarks reasons={reasons} lang={lang} />
              </div>
            </div>
            {/* The whole card opens the product; its box, above, selects it. */}
            <Button
              type="button"
              variant="ghost"
              onClick={() => onEdit(product)}
              aria-label={isAr ? `تعديل ${name}` : `Edit ${name}`}
              className="absolute inset-0 h-full w-full rounded-xl p-0 hover:bg-foreground/5 active:scale-100"
            />
            <span className="absolute end-2 top-2 z-10 rounded-md bg-background/90 p-1 shadow-2xs">
              <Checkbox
                checked={selectedProductIds.has(product.id)}
                onCheckedChange={() => onToggleSelected(product.id)}
                aria-label={isAr ? `تحديد المنتج ${name}` : `Select product ${name}`}
              />
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Rows or photos, beside the list's sort. */
export function InventoryLayoutSwitch({
  lang,
  layout,
  onChange,
}: {
  lang: "ar" | "en";
  layout: InventoryLayout;
  onChange: (layout: InventoryLayout) => void;
}) {
  const isAr = lang === "ar";
  const options: Array<{ id: InventoryLayout; label: string; Icon: typeof List }> = [
    { id: "list", label: isAr ? "عرض كقائمة" : "Show as a list", Icon: List },
    { id: "photos", label: isAr ? "عرض بالصور" : "Show as photos", Icon: LayoutGrid },
  ];
  return (
    <div
      role="group"
      aria-label={isAr ? "طريقة العرض" : "Layout"}
      className="inline-flex shrink-0 rounded-lg border border-border-strong bg-background/50 p-0.5"
    >
      {options.map(({ id, label, Icon }) => (
        <Button
          key={id}
          type="button"
          variant="chip"
          size="icon"
          aria-label={label}
          aria-pressed={layout === id}
          title={label}
          onClick={() => onChange(id)}
          className={`h-8 w-8 rounded-md pointer-coarse:h-10 pointer-coarse:w-10 ${
            layout === id
              ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
              : ""
          }`}
        >
          <Icon aria-hidden="true" />
        </Button>
      ))}
    </div>
  );
}
