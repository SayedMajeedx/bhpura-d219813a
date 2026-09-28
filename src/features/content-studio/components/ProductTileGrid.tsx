import { ImageOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { firstImage, type Product } from "@/features/content-studio/lib/studio-content";

/**
 * Products as photo tiles to pick several of: each pick shows its place in
 * the order. `isLocked` says when a tile may not change (a pick at the
 * minimum, or a new pick when the list is full).
 */
export function ProductTileGrid({
  products,
  pickedIds,
  isAr,
  labelledBy,
  isLocked,
  onToggle,
}: {
  products: readonly Product[];
  pickedIds: readonly string[];
  isAr: boolean;
  labelledBy: string;
  isLocked: (picked: boolean) => boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <div
      role="group"
      aria-labelledby={labelledBy}
      className="grid max-h-80 grid-cols-4 gap-2 overflow-y-auto p-0.5 sm:grid-cols-5"
    >
      {products.map((product) => {
        const place = pickedIds.indexOf(product.id);
        const picked = place >= 0;
        const locked = isLocked(picked);
        const name = isAr ? product.name_ar || product.name : product.name_en || product.name;
        const image = firstImage(product);
        return (
          <Button
            key={product.id}
            type="button"
            variant="ghost"
            aria-pressed={picked}
            aria-disabled={locked}
            title={name}
            onClick={() => {
              if (!locked) onToggle(product.id);
            }}
            className={cn(
              "group relative block aspect-[3/4] h-auto min-w-0 overflow-hidden rounded-xl border-2 p-0 text-start font-normal whitespace-normal transition-all hover:bg-transparent",
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
          </Button>
        );
      })}
    </div>
  );
}
