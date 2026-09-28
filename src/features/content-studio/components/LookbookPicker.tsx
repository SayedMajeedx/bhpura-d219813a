import { ImageOff, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { firstImage } from "@/features/content-studio/lib/studio-content";
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

      <div
        role="group"
        aria-labelledby="studio-lookbook-label"
        className="grid max-h-80 grid-cols-4 gap-2 overflow-y-auto p-0.5 sm:grid-cols-5"
      >
        {products.map((product) => {
          const place = lookbookIds.indexOf(product.id);
          const picked = place >= 0;
          const locked = picked ? atMin : full;
          const name = isAr ? product.name_ar || product.name : product.name_en || product.name;
          const image = firstImage(product);
          return (
            <button
              key={product.id}
              type="button"
              aria-pressed={picked}
              aria-disabled={locked}
              title={name}
              onClick={() => {
                if (!locked) toggleLookbookProduct(product.id);
              }}
              className={cn(
                "group relative aspect-[3/4] min-w-0 overflow-hidden rounded-xl border-2 text-start transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                picked
                  ? "border-primary ring-2 ring-primary/25 shadow-xs"
                  : "border-border hover:border-primary/40",
                locked && !picked && "cursor-not-allowed opacity-45",
                locked && picked && "cursor-default",
                !locked && "cursor-pointer",
              )}
            >
              {image ? (
                <img
                  src={image}
                  alt=""
                  loading="lazy"
                  className={cn(
                    "size-full object-cover transition-opacity",
                    !picked && "opacity-70 group-hover:opacity-100",
                  )}
                />
              ) : (
                <span className="grid size-full place-items-center bg-muted text-muted-foreground">
                  <ImageOff className="size-4" aria-hidden="true" />
                </span>
              )}
              <span className="absolute inset-x-0 bottom-0 truncate bg-background/85 px-1.5 py-1 text-xs font-medium text-foreground">
                {name}
              </span>
              {picked && (
                <span className="absolute top-1 start-1 grid size-5 place-items-center rounded-full bg-primary text-xs font-bold tabular-nums text-primary-foreground shadow-xs">
                  {place + 1}
                </span>
              )}
            </button>
          );
        })}
      </div>
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
