import React, { useEffect, useRef, useState } from "react";
import { useStorefront, type HeroContentSlide } from "@/lib/storefront-context";
import { OptimizedVideo, ResponsiveImage } from "@/components/responsive-media";
import { isLikelyImageUrl } from "@/lib/media-delivery";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface HeroV2Props {
  slides: HeroContentSlide[];
}

export function HeroV2({ slides }: HeroV2Props) {
  const { settings, lang, brand } = useStorefront();
  const isAr = lang === "ar";
  const [activeIdx, setActiveIdx] = useState(0);
  const [isInViewport, setIsInViewport] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);
  const blockedClick = useRef(false);

  // IntersectionObserver to pause media when hero is offscreen
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        setIsInViewport(entry ? entry.isIntersecting : true);
      },
      { threshold: 0.1 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (!slides || slides.length === 0) {
    return null;
  }

  const hasMultiple = slides.length > 1;

  const goTo = (next: number) => {
    const safe = (next + slides.length) % slides.length;
    setActiveIdx(safe);
  };

  const finishSwipe = (endX: number | undefined) => {
    const startX = touchStartX.current;
    touchStartX.current = null;
    if (startX == null || endX == null) return;
    const distance = endX - startX;
    if (Math.abs(distance) < 40) return;
    blockedClick.current = true;
    goTo(distance < 0 ? activeIdx + 1 : activeIdx - 1);
    window.setTimeout(() => {
      blockedClick.current = false;
    }, 50);
  };

  // Find next video slide to prepare
  let preparedVideoIndex = -1;
  for (let offset = 1; offset < slides.length; offset += 1) {
    const candidate = (activeIdx + offset) % slides.length;
    if (slides[candidate]?.type === "video") {
      preparedVideoIndex = candidate;
      break;
    }
  }

  const accentColor = settings.storefront_accent_color || brand?.primary_color || "#3f121a";

  return (
    <section
      ref={containerRef}
      aria-label={isAr ? "الواجهة الرئيسية" : "Hero Section"}
      className="relative w-full overflow-hidden"
    >
      <div className="relative mx-auto w-full max-w-7xl px-3 sm:px-6 py-2 sm:py-4">
        <div
          dir="ltr"
          className="relative isolate w-full overflow-hidden rounded-2xl shadow-lg ring-1 ring-black/5 [clip-path:inset(0_round_1rem)] aspect-[4/3] sm:aspect-[21/9] min-h-[260px] sm:min-h-[420px]"
          onTouchStart={(e) => {
            touchStartX.current = e.touches[0]?.clientX ?? null;
          }}
          onTouchEnd={(e) => finishSwipe(e.changedTouches[0]?.clientX)}
          onTouchCancel={() => {
            touchStartX.current = null;
          }}
          onClickCapture={(e) => {
            if (blockedClick.current) {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
        >
          {slides.map((slide, idx) => {
            const isActive = activeIdx === idx;
            const title = isAr
              ? slide.title_ar || slide.title_en
              : slide.title_en || slide.title_ar;
            const body = isAr
              ? slide.body_ar || slide.body_en
              : slide.body_en || slide.body_ar;
            const button = isAr
              ? slide.button_ar || slide.button_en
              : slide.button_en || slide.button_ar;

            const mediaUrl =
              (isAr ? slide.media_url_ar : slide.media_url_en) ||
              slide.media_url ||
              (isAr ? slide.media_url_en : slide.media_url_ar) ||
              "";

            const rawPoster =
              (isAr ? slide.media_poster_url_ar : slide.media_poster_url_en) ||
              (isAr ? slide.media_poster_url_en : slide.media_poster_url_ar) ||
              "";

            // Strict poster validation: only valid image URLs
            const posterUrl = isLikelyImageUrl(rawPoster)
              ? rawPoster
              : isLikelyImageUrl(mediaUrl)
                ? mediaUrl
                : null;

            const isImage = slide.type === "image" && Boolean(mediaUrl);
            const isVideo = slide.type === "video" && Boolean(mediaUrl);

            return (
              <article
                key={slide.id || idx}
                dir={isAr ? "rtl" : "ltr"}
                aria-hidden={!isActive}
                inert={!isActive ? true : undefined}
                className={`absolute inset-0 size-full transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                  isActive
                    ? "z-10 opacity-100 scale-100 pointer-events-auto"
                    : "z-0 opacity-0 scale-[0.98] pointer-events-none"
                }`}
              >
                {/* Fallback Luxury Geometric Background */}
                <div
                  className="absolute inset-0 size-full"
                  style={{
                    background: `radial-gradient(circle at 60% 40%, ${accentColor}cc 0%, ${accentColor}ee 50%, #0d0407 100%)`,
                  }}
                >
                  <svg
                    className="absolute inset-0 size-full opacity-[0.07] mix-blend-overlay"
                    xmlns="http://www.w3.org/2000/svg"
                    width="100%"
                    height="100%"
                  >
                    <defs>
                      <pattern
                        id="hero-v2-grid"
                        width="40"
                        height="40"
                        patternUnits="userSpaceOnUse"
                      >
                        <path
                          d="M 40 0 L 0 0 0 40"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1"
                        />
                      </pattern>
                    </defs>
                    <rect width="100%" height="100%" fill="url(#hero-v2-grid)" />
                  </svg>
                </div>

                {/* Media Layer */}
                {isImage && (
                  <ResponsiveImage
                    src={mediaUrl}
                    preset="hero"
                    sizes="(max-width: 640px) 100vw, (max-width: 1280px) 100vw, 1280px"
                    alt={title || ""}
                    className="absolute inset-0 size-full object-cover transition-transform duration-700 ease-out"
                    loading={idx === 0 ? "eager" : "lazy"}
                    decoding="async"
                    fetchPriority={idx === 0 ? "high" : "auto"}
                  />
                )}

                {isVideo && (
                  <OptimizedVideo
                    src={mediaUrl}
                    poster={posterUrl}
                    active={isActive && isInViewport}
                    prepare={idx === preparedVideoIndex}
                    wrapperClassName="absolute inset-0 size-full pointer-events-none"
                    className="size-full object-cover"
                  />
                )}

                {/* High-Contrast Luxury Vignette Scrim */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent pointer-events-none" />

                {/* Text / Action Content */}
                <div className="absolute inset-0 flex flex-col justify-end p-5 sm:p-10 pb-10 sm:pb-14 text-white z-10">
                  <div className="max-w-2xl space-y-2">
                    {title && (
                      <h1
                        className="font-bold tracking-tight text-white drop-shadow-md"
                        style={{
                          fontSize: "clamp(1.75rem, 1.25rem + 2.2vw, 3rem)",
                          lineHeight: 1.15,
                        }}
                      >
                        {title}
                      </h1>
                    )}
                    {body && (
                      <p className="line-clamp-2 text-sm sm:text-base text-white/90 drop-shadow-sm max-w-xl">
                        {body}
                      </p>
                    )}
                    <div className="pt-2 flex flex-wrap items-center gap-3">
                      {button && (
                        <a
                          href={slide.button_href || "#products"}
                          className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-2.5 sm:px-6 sm:py-3 text-xs sm:text-sm font-semibold text-primary-foreground shadow-md transition-all duration-200 hover:scale-[1.03] active:scale-[0.98]"
                        >
                          {button}
                        </a>
                      )}
                      {(brand as any)?.modules?.made_to_order && (
                        <a
                          href={`/${brand.slug}/custom-order`}
                          className="inline-flex items-center justify-center rounded-xl bg-white/20 hover:bg-white/30 backdrop-blur-md border border-white/30 px-4 py-2.5 sm:px-5 sm:py-3 text-xs sm:text-sm font-semibold text-white transition-all duration-200 hover:scale-[1.03] active:scale-[0.98]"
                        >
                          {isAr ? "طلب مخصص" : "Bespoke Order"}
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {/* Carousel Dot Indicators */}
        {hasMultiple && (
          <div
            className="mt-3 flex items-center justify-center gap-2"
            role="tablist"
            aria-label={isAr ? "شرائح الواجهة" : "Hero slides"}
          >
            {slides.map((_, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={activeIdx === i}
                aria-label={`${isAr ? "شريحة" : "Slide"} ${i + 1}`}
                onClick={() => goTo(i)}
                className={`h-2 rounded-full transition-all duration-300 ${
                  activeIdx === i
                    ? "w-8 bg-primary"
                    : "w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50"
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
