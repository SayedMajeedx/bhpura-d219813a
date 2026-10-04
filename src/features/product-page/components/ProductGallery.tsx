import { useStorefront } from "@/lib/storefront-context";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Play } from "lucide-react";
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
    <div className="md:col-span-5 max-w-[420px] mx-auto md:max-w-none w-full min-w-0 [overflow-anchor:none]">
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
        // Padding keeps the focus ring inside the scroll area; the negative margin gives the
        // first thumbnail back the edge it shares with the main picture.
        <div className="-mx-1 mt-2 flex gap-2.5 overflow-x-auto p-1 scrollbar-thin">
          {media.map((m, i) => {
            const selected = i === mediaIdx % media.length;
            return (
              <button
                key={i}
                type="button"
                aria-label={
                  m.type === "video"
                    ? t(`عرض الفيديو ${i + 1}`, `Show video ${i + 1}`)
                    : t(`عرض الصورة ${i + 1}`, `Show image ${i + 1}`)
                }
                aria-current={selected ? "true" : undefined}
                // Picking a thumbnail must never move the page: no focus jump on press.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setMediaIdx(i)}
                // Every thumbnail is the same size: the selection is a border, not an outer ring
                // (a ring is clipped by the scroll area and makes the chosen one look larger).
                className={`relative size-18 shrink-0 overflow-hidden rounded-xl border-2 transition-[opacity,border-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                  selected
                    ? "border-primary opacity-100"
                    : "border-border-subtle opacity-75 hover:border-primary/50 hover:opacity-100"
                }`}
                style={selected ? { borderColor: primary } : undefined}
              >
                {m.type === "video" ? (
                  <div className="relative size-full bg-black/90">
                    {m.poster_url || isLikelyImageUrl(m.url) ? (
                      <img
                        src={m.poster_url || m.url}
                        alt=""
                        className="size-full object-cover opacity-70"
                      />
                    ) : (
                      // No poster: the first frame of the video itself.
                      <video
                        src={`${m.url}#t=0.1`}
                        preload="metadata"
                        muted
                        playsInline
                        tabIndex={-1}
                        aria-hidden="true"
                        className="pointer-events-none size-full object-cover opacity-70"
                      />
                    )}
                    <div className="absolute inset-0 grid place-items-center bg-black/25">
                      <span className="grid size-7 place-items-center rounded-full bg-white/90 text-black shadow-md">
                        <Play className="size-3.5 translate-x-px fill-current" />
                      </span>
                    </div>
                  </div>
                ) : (
                  <ResponsiveImage
                    src={m.url}
                    preset="thumb"
                    sizes="80px"
                    alt={displayName}
                    className="size-full object-cover"
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
