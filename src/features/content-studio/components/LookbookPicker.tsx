import { Layers } from "lucide-react";
import { ProductTileGrid } from "@/features/content-studio/components/ProductTileGrid";
import { LOOKBOOK_MAX, LOOKBOOK_MIN } from "@/features/content-studio/lib/lookbook";
import type { ContentStudio } from "@/features/content-studio/hooks/use-content-studio";

/**
 * The Lookbook's products: tap to add (in order, up to five) or remove (down
 * to two). Each pick shows its place in the carousel.
 */
export function LookbookPicker({ studio }: { studio: ContentStudio }) {
  const { isAr, products, lookbookIds, toggleLookbookProduct } = studio;
  const full = lookbookIds.length >= LOOKBOOK_MAX;
  const atMin = lookbookIds.length <= LOOKBOOK_MIN;

  return (
    <div className="space-y-2.5 rounded-2xl border border-border-strong bg-muted/20 p-3.5 sm:p-4 min-w-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <Layers className="size-3.5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3 id="studio-lookbook-label" className="text-xs font-bold text-foreground">
              {isAr ? "منتجات اللوك بوك" : "Lookbook products"}
            </h3>
            <p className="text-xs text-muted-foreground">
              {isAr
                ? "اختر من ٢ إلى ٥ منتجات، بالترتيب الذي تظهر به."
                : "Pick 2 to 5 products, in the order they appear."}
            </p>
          </div>
        </div>
        <span
          dir="ltr"
          className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold tabular-nums text-primary"
        >
          {lookbookIds.length} / {LOOKBOOK_MAX}
        </span>
      </div>

      <ProductTileGrid
        products={products}
        pickedIds={lookbookIds}
        isAr={isAr}
        labelledBy="studio-lookbook-label"
        isLocked={(picked) => (picked ? atMin : full)}
        onToggle={toggleLookbookProduct}
      />
      {full && (
        <p role="status" className="text-xs text-muted-foreground">
          {isAr
            ? "وصلت إلى ٥ منتجات. أزل منتجاً لإضافة غيره."
            : "That's five. Remove one to add another."}
        </p>
      )}
    </div>
  );
}
