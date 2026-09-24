import { Input } from "@/components/ui/input";
import { Search, X, ImageIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Search the catalog by name, SKU, barcode or size and add a variant to the order. */
export function ProductSearchDialog({
  open,
  onOpenChange,
  query,
  onQueryChange,
  results,
  products,
  currency,
  lang,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  query: string;
  onQueryChange: (query: string) => void;
  results: any[];
  products: any[];
  currency: string;
  lang: string;
  onSelect: (variant: any) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-0 overflow-hidden">
        <DialogHeader className="p-4 pb-2 border-b">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Search className="h-4 w-4 text-primary" />
            {lang === "ar" ? "البحث عن منتج أو SKU أو باركود" : "Search Product, SKU, or Barcode"}
          </DialogTitle>
        </DialogHeader>
        <div className="p-4 space-y-3">
          <div className="relative">
            <Search className="absolute start-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus
              placeholder={
                lang === "ar"
                  ? "اكتب للبحث بالاسم، الرمز (SKU)، المقاس، أو الباركود..."
                  : "Type product title, SKU, size, or barcode..."
              }
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              className="ps-9 h-10 text-sm font-medium"
            />
            {query && (
              <button
                type="button"
                className="absolute end-3 top-3 text-muted-foreground hover:text-foreground"
                onClick={() => onQueryChange("")}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="max-h-[380px] overflow-y-auto space-y-2 pe-1">
            {results.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                {lang === "ar"
                  ? `لم يتم العثور على منتجات تطابق "${query}"`
                  : `No products found matching "${query}"`}
              </div>
            ) : (
              results.map((v: any) => {
                const p = products.find((x: any) => x.id === v.product_id);
                const title = (p as any)?.name || "Product";
                const sku = v.sku || (p as any)?.sku;
                const mainStock = Number(v.stock_main ?? 0);
                const incStock = Number(v.stock_incubator ?? 0);
                const fallbackStock = Number(v.stock ?? v.quantity ?? (p as any)?.stock ?? 0);
                const totalStock = mainStock + incStock > 0 ? mainStock + incStock : fallbackStock;
                const price = Number(
                  v.selling_price ??
                    v.price_override ??
                    v.price ??
                    (p as any)?.selling_price ??
                    (p as any)?.base_price ??
                    (p as any)?.price ??
                    0,
                );
                const getMediaUrl = (obj: any) => {
                  if (!obj) return null;
                  if (typeof obj.image_url === "string" && obj.image_url) return obj.image_url;
                  if (typeof obj.image === "string" && obj.image) return obj.image;
                  if (Array.isArray(obj.images) && obj.images[0]) return obj.images[0];
                  return null;
                };
                const img = getMediaUrl(v) || getMediaUrl(p);

                return (
                  <div
                    key={v.id}
                    className="flex items-center justify-between gap-3 p-2.5 rounded-xl border border-border-strong hover:border-primary/60 hover:bg-primary/5 cursor-pointer transition-all"
                    onClick={() => onSelect(v)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-11 w-11 rounded-lg border bg-muted/40 overflow-hidden shrink-0 flex items-center justify-center">
                        {img ? (
                          <img src={img} alt={title} className="h-full w-full object-cover" />
                        ) : (
                          <ImageIcon className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-xs sm:text-sm text-foreground truncate">
                          {title}
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
                          {sku && (
                            <span className="font-mono bg-muted/80 px-1.5 py-0.5 rounded text-xs">
                              {sku}
                            </span>
                          )}
                          {(v.size || v.color) && (
                            <span>{[v.size, v.color].filter(Boolean).join(" / ")}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="text-end shrink-0">
                      <p className="font-bold text-sm text-foreground">
                        {formatMoney(price, currency)}
                      </p>
                      <span
                        className={cn(
                          "text-xs font-semibold px-1.5 py-0.5 rounded inline-block mt-0.5",
                          totalStock > 0
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                            : "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
                        )}
                      >
                        {totalStock > 0
                          ? `${lang === "ar" ? "متوفر" : "In Stock"}: ${totalStock}`
                          : lang === "ar"
                            ? "نفذت الكمية"
                            : "Out of Stock"}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
