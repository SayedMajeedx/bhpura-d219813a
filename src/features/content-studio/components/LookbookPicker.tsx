import { Layers } from "lucide-react";
import { ProductTileGrid } from "@/features/content-studio/components/ProductTileGrid";
import type { ContentStudio } from "@/features/content-studio/hooks/use-content-studio";

/** What the picker is called for each template that shows several products. */
const TITLES: Record<string, { en: string; ar: string }> = {
  "lookbook-carousel": { en: "Lookbook products", ar: "منتجات اللوك بوك" },
  "menu-board": { en: "On the menu", ar: "أصناف القائمة" },
  "bundle-set": { en: "In the set", ar: "قطع المجموعة" },
};

/**
 * The products of the Lookbook, a Menu or a Bundle: tap to add (in order, up
 * to the template's most) or remove (down to its least). Each pick shows its
 * place. The pick is shared, so moving between the three keeps it.
 */
export function LookbookPicker({ studio }: { studio: ContentStudio }) {
  const { isAr, products, lookbookIds, toggleLookbookProduct, collectionLimits, templateId } =
    studio;
  const { min, max } = collectionLimits;
  const full = lookbookIds.length >= max;
  const atMin = lookbookIds.length <= min;
  const title = TITLES[templateId] ?? TITLES["lookbook-carousel"];

  return (
    <div className="space-y-2.5 rounded-2xl border border-border-strong bg-muted/20 p-3.5 sm:p-4 min-w-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <Layers className="size-3.5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3 id="studio-lookbook-label" className="text-xs font-bold text-foreground">
              {isAr ? title.ar : title.en}
            </h3>
            <p className="text-xs text-muted-foreground">
              {isAr
                ? `اختر من ${min} إلى ${max}، بالترتيب الذي تظهر به.`
                : `Pick ${min} to ${max}, in the order they appear.`}
            </p>
          </div>
        </div>
        <span
          dir="ltr"
          className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold tabular-nums text-primary"
        >
          {lookbookIds.length} / {max}
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
            ? `وصلت إلى ${max}. أزل واحداً لإضافة غيره.`
            : `That's ${max}. Remove one to add another.`}
        </p>
      )}
    </div>
  );
}
