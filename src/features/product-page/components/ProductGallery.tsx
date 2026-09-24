import { useStorefront } from "@/lib/storefront-context";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { OptimizedVideo, ResponsiveImage } from "@/components/responsive-media";
import { isLikelyImageUrl } from "@/lib/media-delivery";
import { type StorefrontProductDetail as Product } from "@/lib/data/storefront";
import { ImageZoom } from "@/components/storefront/ImageZoom";
import type { Dispatch, RefObject, SetStateAction } from "react";

import type { PdpMediaItem } from "@/features/product-page/types";
/** Product images and videos: main view with swipe, thumbnails and badges. */
export function ProductGallery({
  displayName,
  galleryRatioClass,
  galleryTouchStartX,
  media,
  mediaIdx,
  primary,
  product,
  setMediaIdx,
  settings,
  t,
}: {
  displayName: string;
  galleryRatioClass: string;
  galleryTouchStartX: RefObject<number | null>;
  media: PdpMediaItem[];
  mediaIdx: number;
  primary: string;
  product: Product;
  setMediaIdx: Dispatch<SetStateAction<number>>;
  settings: ReturnType<typeof useStorefront>["settings"];
  t: ReturnType<typeof useStorefront>["t"];
}) {
  return (
    <div className="md:col-span-5 max-w-[420px] mx-auto md:max-w-none w-full min-w-0">
      <div
        className={`relative ${galleryRatioClass} max-h-[520px] bg-muted rounded-2xl overflow-hidden shadow-sm border border-border-subtle mx-auto w-full max-w-full select-none`}
        onTouchStart={(e) => {
          galleryTouchStartX.current = e.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(e) => {
          const startX = galleryTouchStartX.current;
          galleryTouchStartX.current = null;
          if (startX == null || media.length <= 1) return;
          const endX = e.changedTouches[0]?.clientX;
          if (endX == null) return;
          const diff = endX - startX;
          if (Math.abs(diff) < 35) return;
          setMediaIdx((i) =>
            diff < 0 ? (i + 1) % media.length : (i - 1 + media.length) % media.length,
          );
        }}
      >
        {media.length > 0 ? (
          <>
            {media[mediaIdx % media.length].type === "video" ? (
              <OptimizedVideo
                src={
                  media[mediaIdx % media.length].stream_iframe_url
                    ? undefined
                    : media[mediaIdx % media.length].url
                }
                streamIframeUrl={media[mediaIdx % media.length].stream_iframe_url}
                poster={
                  media[mediaIdx % media.length].poster_url ??
                  (isLikelyImageUrl(media[mediaIdx % media.length].url)
                    ? media[mediaIdx % media.length].url
                    : undefined)
                }
                className="h-full w-full object-cover"
                wrapperClassName="h-full w-full overflow-hidden bg-black/90"
                autoPlay
                loop
                muted
                playsInline
                controls
              />
            ) : settings?.storefront_design_version === 2 && settings?.pdp_image_zoom !== false ? (
              <ImageZoom
                src={media[mediaIdx % media.length].url}
                alt={displayName}
                className="w-full h-full max-w-full"
                aspectRatio="w-full h-full"
                style={{
                  viewTransitionName: `product-img-${product.id.replace(/[^a-zA-Z0-9_-]/g, "_")}`,
                }}
              />
            ) : (
              <ResponsiveImage
                src={media[mediaIdx % media.length].url}
                preset="product"
                sizes="(min-width: 1024px) 55vw, 100vw"
                alt={displayName}
                className="w-full h-full object-cover max-w-full"
                fetchPriority="high"
                loading="eager"
              />
            )}
            {media.length > 1 && (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setMediaIdx((i) => (i - 1 + media.length) % media.length)}
                  className="absolute top-1/2 start-2 -translate-y-1/2 min-h-11 min-w-11 p-2 text-white/90 hover:text-white transition-all active:scale-90 z-20 bg-transparent hover:bg-transparent border-0 shadow-none flex items-center justify-center cursor-pointer"
                  aria-label={t("الصورة السابقة", "Previous media")}
                >
                  <ChevronLeft className="size-8 rtl:rotate-180 text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.85)] filter" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setMediaIdx((i) => (i + 1) % media.length)}
                  className="absolute top-1/2 end-2 -translate-y-1/2 min-h-11 min-w-11 p-2 text-white/90 hover:text-white transition-all active:scale-90 z-20 bg-transparent hover:bg-transparent border-0 shadow-none flex items-center justify-center cursor-pointer"
                  aria-label={t("الصورة التالية", "Next media")}
                >
                  <ChevronRight className="size-8 rtl:rotate-180 text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.85)] filter" />
                </Button>
              </>
            )}
          </>
        ) : (
          <div className="w-full h-full grid place-items-center text-muted-foreground">
            {t("لا توجد صورة", "No image")}
          </div>
        )}
      </div>
      {media.length > 1 && (
        <div className="mt-3 flex gap-2.5 overflow-x-auto pb-2 scrollbar-thin">
          {media.map((m, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setMediaIdx(i)}
              className={`relative h-18 w-18 rounded-xl overflow-hidden shrink-0 border-2 transition-all ${
                i === mediaIdx % media.length
                  ? "ring-2 ring-primary border-primary shadow-sm opacity-100"
                  : "border-border-subtle hover:border-primary/50 opacity-75 hover:opacity-100"
              }`}
              style={i === mediaIdx % media.length ? { borderColor: primary } : undefined}
            >
              {m.type === "video" ? (
                <div className="relative w-full h-full bg-black/90 flex items-center justify-center">
                  {m.poster_url || isLikelyImageUrl(m.url) ? (
                    <img
                      src={m.poster_url || m.url}
                      alt={`${displayName} - preview ${i + 1}`}
                      className="w-full h-full object-cover opacity-60"
                    />
                  ) : (
                    <div className="size-full bg-muted/60" />
                  )}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <div className="h-6 w-6 rounded-full bg-white/90 text-black flex items-center justify-center text-xs font-bold shadow-md">
                      ▶
                    </div>
                  </div>
                </div>
              ) : (
                <ResponsiveImage
                  src={m.url}
                  preset="thumb"
                  sizes="80px"
                  alt={displayName}
                  className="w-full h-full object-cover"
                />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
