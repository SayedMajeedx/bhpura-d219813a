import { Skeleton } from "@/components/ui/skeleton";
import { useStorefront } from "@/lib/storefront-context";
import { galleryMaxWidth, galleryRatioClass } from "@/features/product-page/lib/product-media";

/**
 * The product page's shape while a product is read after a tap: the gallery in the store's own
 * frame and the lines where the name, price, options and buttons will sit, laid out as the page
 * is, so nothing jumps when it arrives. A tap once left the previous page in place, with no sign
 * that anything was happening, until the slowest of the page's requests answered.
 */
export function ProductPagePending() {
  const { settings, t } = useStorefront();
  const ratio = settings?.pdp_gallery_aspect_ratio;
  return (
    <div
      className="mx-auto w-full max-w-5xl px-4 py-3 sm:px-6 sm:py-8"
      role="status"
      aria-label={t("جارٍ تحميل المنتج", "Loading the product")}
    >
      <div className="grid w-full items-start gap-6 md:grid-cols-12 lg:gap-10">
        <div className="mx-auto w-full max-w-[420px] md:col-span-5 md:max-w-none">
          <div className="mx-auto w-full" style={{ maxWidth: galleryMaxWidth(ratio) }}>
            <Skeleton className={`${galleryRatioClass(ratio)} w-full rounded-2xl`} />
            <div className="mt-2 flex gap-2.5">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="size-18 rounded-xl" />
              ))}
            </div>
          </div>
        </div>
        <div className="w-full min-w-0 space-y-4 md:col-span-7">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-6 w-1/3" />
          <div className="space-y-2 pt-2">
            <Skeleton className="h-4 w-16" />
            <div className="flex gap-2.5">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="size-11 rounded-full" />
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-16" />
            <div className="flex flex-wrap gap-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-11 w-14 rounded-lg" />
              ))}
            </div>
          </div>
          <Skeleton className="hidden h-12 w-full rounded-lg md:block" />
        </div>
      </div>
    </div>
  );
}
