import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { storeContentQueries } from "@/lib/data/store-content";
import { bySortOrder, captionText, type GalleryItem } from "@/lib/store-content";

/** The store's pictures (past events, work) as a grid; a tap shows one larger. Nothing when there are none. */
export function StoreGallery({ brandId, isAr }: { brandId: string; isAr: boolean }) {
  const items = useQuery(storeContentQueries.publicGallery(brandId)).data;
  const [open, setOpen] = useState<GalleryItem | null>(null);
  if (!items) return null;
  const sorted = items.filter((item) => item.is_active).sort(bySortOrder);
  if (sorted.length === 0) return null;

  return (
    <section className="space-y-3" aria-labelledby="store-gallery-title">
      <h2 id="store-gallery-title" className="font-display text-xl font-semibold text-foreground">
        {isAr ? "من مناسباتنا" : "From our events"}
      </h2>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {sorted.map((item) => (
          <li key={item.id}>
            <Button
              type="button"
              variant="ghost"
              className="group block h-auto w-full overflow-hidden rounded-xl border border-border p-0 text-start font-normal whitespace-normal"
              onClick={() => setOpen(item)}
            >
              <img
                src={item.image_url}
                alt={captionText(item, isAr)}
                loading="lazy"
                className="aspect-[4/3] w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              {captionText(item, isAr) && (
                <span className="block truncate px-2 py-1.5 text-xs text-muted-foreground">
                  {captionText(item, isAr)}
                </span>
              )}
            </Button>
          </li>
        ))}
      </ul>
      <Dialog open={Boolean(open)} onOpenChange={(next) => !next && setOpen(null)}>
        <DialogContent className="max-w-3xl p-2" dir={isAr ? "rtl" : "ltr"}>
          <DialogTitle className="sr-only">
            {isAr ? "صورة من المعرض" : "Gallery picture"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {open ? captionText(open, isAr) : ""}
          </DialogDescription>
          {open && (
            <figure className="space-y-2">
              <img
                src={open.image_url}
                alt={captionText(open, isAr)}
                className="max-h-[75vh] w-full rounded-lg object-contain"
              />
              {captionText(open, isAr) && (
                <figcaption className="px-2 pb-1 text-center text-sm text-muted-foreground">
                  {captionText(open, isAr)}
                </figcaption>
              )}
            </figure>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
