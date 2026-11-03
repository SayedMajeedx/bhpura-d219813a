import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Archive, ChevronRight, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { catalogQueries, restoreProduct } from "@/lib/data/catalog";
import { arNoun, countOf } from "@/lib/arabic-count";
import { productDeleteError } from "@/features/inventory/lib/product-delete";

type ArchivedProduct = {
  id: string;
  name?: string | null;
  name_ar?: string | null;
  name_en?: string | null;
  archived_at?: string | null;
};

/** The archived products of a list, the most recently archived first. */
export function archivedProducts<P extends ArchivedProduct>(products: readonly P[]): P[] {
  return products
    .filter((product) => Boolean(product.archived_at))
    .sort((a, b) => String(b.archived_at).localeCompare(String(a.archived_at)));
}

/**
 * One line above the inventory list while the store has archived products: removed with a history
 * of sales or stock, hidden and kept (`remove_products`). It opens their list, where each one can
 * be brought back, still hidden from the store until the merchant shows it (`restore_product`).
 */
export function ArchivedProductsLine({
  brandId,
  isAr,
  onRestored,
}: {
  brandId: string;
  isAr: boolean;
  onRestored: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const productsQ = useQuery(catalogQueries.productsWithArchived(brandId));
  const archived = useMemo(() => archivedProducts(productsQ.data ?? []), [productsQ.data]);
  if (archived.length === 0 && !open) return null;

  const nameOf = (product: ArchivedProduct) =>
    (isAr ? product.name_ar || product.name_en : product.name_en || product.name_ar) ||
    product.name ||
    "";

  const restore = async (id: string) => {
    setRestoring(id);
    try {
      await restoreProduct(id);
      toast.success(
        isAr
          ? "أُعيد المنتج إلى المخزون. ما زال مخفياً عن المتجر حتى تُظهره."
          : "The product is back in the inventory, still hidden from the store until you show it.",
      );
      onRestored();
    } catch (error) {
      toast.error(productDeleteError(error, isAr));
    } finally {
      setRestoring(null);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        className="h-auto w-full min-w-0 justify-start gap-2.5 rounded-xl px-4 py-3 text-start"
      >
        <Archive className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 flex-1 text-sm font-medium">
          {isAr
            ? `المنتجات المؤرشفة: ${arNoun(archived.length, "product")}`
            : `Archived products: ${countOf(archived.length, "product", "en")}`}
        </span>
        <ChevronRight
          className="size-4 shrink-0 text-muted-foreground rtl:rotate-180"
          aria-hidden="true"
        />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir={isAr ? "rtl" : "ltr"} className="max-w-md gap-3">
          <DialogHeader>
            <DialogTitle>{isAr ? "المنتجات المؤرشفة" : "Archived products"}</DialogTitle>
            <DialogDescription>
              {isAr
                ? "منتجات حُذفت ولها سجل من المبيعات أو المخزون، فأُخفيت وبقي سجلها. استعادة المنتج تعيده إلى المخزون مخفياً حتى تُظهره."
                : "Products removed with a record of sales or stock, hidden with their record kept. Restoring one puts it back in the inventory, hidden until you show it."}
            </DialogDescription>
          </DialogHeader>
          {archived.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {isAr ? "لا توجد منتجات مؤرشفة." : "No archived products."}
            </p>
          ) : (
            <ul className="max-h-80 divide-y divide-border overflow-y-auto">
              {archived.map((product) => (
                <li key={product.id} className="flex min-w-0 items-center gap-3 py-2.5">
                  <span
                    dir="auto"
                    className="min-w-0 flex-1 text-page-start text-sm font-medium line-clamp-2 break-words"
                  >
                    {nameOf(product)}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={restoring !== null}
                    onClick={() => void restore(product.id)}
                    className="shrink-0 gap-1.5"
                    aria-label={isAr ? `استعادة ${nameOf(product)}` : `Restore ${nameOf(product)}`}
                  >
                    <RotateCcw className="size-4" aria-hidden="true" />
                    {isAr ? "استعادة" : "Restore"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
