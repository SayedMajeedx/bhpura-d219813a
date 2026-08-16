import React from "react";
import { Package, ShoppingBag, Plus, Minus, Trash2, ScanLine, Scissors, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

interface OrderItemsWorkflowCardProps {
  lang: "en" | "ar";
  currency: string;
  items: any[];
  isReadOnly?: boolean;
  onUpdateQuantity?: (index: number, newQty: number) => void;
  onRemoveItem?: (index: number) => void;
  onOpenAddItemModal?: () => void;
  onOpenBarcodeScanner?: () => void;
  onOpenTailoringNotes?: (index: number) => void;
  children?: React.ReactNode;
}

export const OrderItemsWorkflowCard: React.FC<OrderItemsWorkflowCardProps> = ({
  lang,
  currency,
  items,
  isReadOnly = false,
  onUpdateQuantity,
  onRemoveItem,
  onOpenAddItemModal,
  onOpenBarcodeScanner,
  onOpenTailoringNotes,
  children,
}) => {
  const isAr = lang === "ar";

  return (
    <div className="rounded-2xl border border-border/70 bg-card p-3.5 sm:p-5 shadow-2xs space-y-4">
      {/* Header Bar */}
      <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
            <ShoppingBag className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-extrabold tracking-tight text-foreground font-display flex items-center gap-2">
              <span>{isAr ? "منتجات الطلب" : "Line Items"}</span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-mono font-bold text-muted-foreground">
                {items.length}
              </span>
            </h2>
          </div>
        </div>

        {/* Action Triggers */}
        {!isReadOnly && (
          <div className="flex items-center gap-2 shrink-0">
            {onOpenBarcodeScanner && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onOpenBarcodeScanner}
                className="h-8 px-2.5 text-xs font-semibold gap-1.5 rounded-xl border-border/80"
              >
                <ScanLine className="h-3.5 w-3.5 text-primary" />
                <span className="hidden sm:inline">{isAr ? "مسح الباركود" : "Scan Barcode"}</span>
              </Button>
            )}

            {onOpenAddItemModal && (
              <Button
                type="button"
                size="sm"
                onClick={onOpenAddItemModal}
                className="h-8 px-3 text-xs font-bold gap-1.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 shadow-2xs"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>{isAr ? "إضافة منتج" : "Add Item"}</span>
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Items List */}
      {items.length === 0 ? (
        <div className="py-8 text-center border-2 border-dashed border-border/60 rounded-xl p-4">
          <Package className="mx-auto h-8 w-8 text-muted-foreground/50 mb-2" />
          <p className="text-xs font-bold text-muted-foreground">
            {isAr ? "لا توجد منتجات في هذا الطلب" : "No line items in this order yet"}
          </p>
          {!isReadOnly && onOpenAddItemModal && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onOpenAddItemModal}
              className="mt-3 text-xs font-semibold rounded-xl"
            >
              <Plus className="h-3.5 w-3.5 me-1.5" />
              {isAr ? "إضافة أول منتج" : "Add First Item"}
            </Button>
          )}
        </div>
      ) : (
        <div className="divide-y divide-border/50 space-y-1">
          {items.map((item, idx) => {
            const itemTitle = item.product_title || item.title || (isAr ? "منتج" : "Product");
            const variantTitle = item.variant_title || item.variant_name || "";
            const qty = Number(item.quantity) || 1;
            const unitPrice = Number(item.unit_price ?? item.price ?? 0);
            const lineTotal = Number(item.total_price ?? qty * unitPrice);
            const imgUrl = item.image_url || item.thumbnail_url;
            const tailoringSpecs = item.tailoring_notes || item.custom_measurements;

            return (
              <div
                key={item.id || idx}
                className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs hover:bg-muted/30 rounded-xl px-2 transition-colors"
              >
                {/* Product Meta */}
                <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                  <div className="h-12 w-12 rounded-xl bg-muted border border-border/70 flex items-center justify-center overflow-hidden shrink-0 shadow-2xs">
                    {imgUrl ? (
                      <img src={imgUrl} alt={itemTitle} className="h-full w-full object-cover" />
                    ) : (
                      <Package className="h-6 w-6 text-muted-foreground/50" />
                    )}
                  </div>

                  <div className="min-w-0 space-y-0.5">
                    <div className="font-extrabold text-foreground text-sm truncate font-display">
                      {itemTitle}
                    </div>

                    {variantTitle && (
                      <div className="text-[11px] font-mono text-muted-foreground font-medium">
                        {variantTitle}
                      </div>
                    )}

                    {/* Tailoring Specs Badge */}
                    {tailoringSpecs ? (
                      <button
                        type="button"
                        onClick={() => onOpenTailoringNotes?.(idx)}
                        className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md hover:bg-amber-500/20 transition-colors"
                      >
                        <Scissors className="h-3 w-3" />
                        <span className="truncate max-w-[200px]">{tailoringSpecs}</span>
                      </button>
                    ) : (
                      !isReadOnly &&
                      onOpenTailoringNotes && (
                        <button
                          type="button"
                          onClick={() => onOpenTailoringNotes(idx)}
                          className="inline-flex items-center gap-1 text-[10px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Scissors className="h-3 w-3" />
                          <span>{isAr ? "+ تفاصيل التفصيل" : "+ Add Tailoring Specs"}</span>
                        </button>
                      )
                    )}
                  </div>
                </div>

                {/* Quantity Controls & Line Price */}
                <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 border-t border-border/40 pt-2 sm:border-0 sm:pt-0">
                  {/* Quantity Stepper */}
                  {!isReadOnly && onUpdateQuantity ? (
                    <div className="flex items-center rounded-xl border border-border/80 bg-background p-0.5 shadow-2xs">
                      <button
                        type="button"
                        onClick={() => onUpdateQuantity(idx, Math.max(1, qty - 1))}
                        disabled={qty <= 1}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 transition-colors touch-manipulation"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>

                      <span className="w-8 text-center font-mono text-xs font-extrabold text-foreground">
                        {qty}
                      </span>

                      <button
                        type="button"
                        onClick={() => onUpdateQuantity(idx, qty + 1)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors touch-manipulation"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="text-xs font-mono font-bold text-muted-foreground bg-muted px-2.5 py-1 rounded-lg">
                      {qty} × {formatMoney(unitPrice, currency, lang)}
                    </div>
                  )}

                  {/* Line Total */}
                  <div className="text-end">
                    <div className="font-mono text-sm font-extrabold text-foreground">
                      {formatMoney(lineTotal, currency, lang)}
                    </div>
                  </div>

                  {/* Delete Item */}
                  {!isReadOnly && onRemoveItem && (
                    <button
                      type="button"
                      onClick={() => onRemoveItem(idx)}
                      className="flex h-8 w-8 items-center justify-center rounded-xl text-destructive hover:bg-destructive/10 transition-colors touch-manipulation"
                      aria-label={isAr ? "حذف المنتج" : "Remove item"}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {children}
    </div>
  );
};
