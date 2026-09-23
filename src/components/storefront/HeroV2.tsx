import React, { useEffect, useRef, useState } from "react";
import { useStorefront, type HeroContentSlide } from "@/lib/storefront-context";
import { OptimizedVideo, ResponsiveImage } from "@/components/responsive-media";
import { isLikelyImageUrl } from "@/lib/media-delivery";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface HeroV2Props {
  slides: HeroContentSlide[];
  background?: { type?: string; url?: string; posterUrl?: string } | string | null;
}

export function HeroV2({ slides, background }: HeroV2Props) {
  const { settings, lang, brand } = useStorefront();
  const isAr = lang === "ar";

  const resolvedBg = background ?? brand.hero_media?.background;
  const fallbackBgUrl = typeof resolvedBg === "string" ? resolvedBg : resolvedBg?.url || "";
  const fallbackBgType =
    (typeof resolvedBg === "object" && resolvedBg?.type) ||
    (/\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(fallbackBgUrl) ? "video" : "image");
  const fallbackBgPoster =
    (typeof resolvedBg === "object" ? resolvedBg?.posterUrl : undefined) || "";
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

  // Merchant-tunable scrim: 0 = clear media, 100 = heavy vignette.
  const overlayStrength = Math.min(100, Math.max(0, Number(settings.hero_overlay_strength ?? 45)));
  const scrimBottom = (overlayStrength / 100) * 0.95;
  const scrimMiddle = (overlayStrength / 100) * 0.45;
  const heroTitleColor = settings.hero_title_color_v2?.trim() || undefined;

  // Responsive Hero Layout & Presentation Settings
  const isFullBleed = (settings.hero_layout ?? "full_bleed") === "full_bleed";
  const mobileRatio = settings.hero_aspect_mobile ?? "portrait_4_5";
  const desktopHeight = settings.hero_height_desktop ?? "standard";
  const showArrows = hasMultiple && settings.hero_show_arrows !== false;

  const mobileRatioClass =
    mobileRatio === "story_9_16"
      ? "aspect-[9/16] min-h-[520px]"
      : mobileRatio === "square_1_1"
        ? "aspect-square min-h-[340px]"
        : mobileRatio === "landscape_4_3"
          ? "aspect-[4/3] min-h-[260px]"
          : "aspect-[4/5] min-h-[420px]";

  const desktopHeightClass =
    desktopHeight === "compact"
      ? "sm:aspect-auto sm:h-[400px] sm:min-h-[400px]"
      : desktopHeight === "cinematic"
        ? "sm:aspect-auto sm:h-[620px] sm:min-h-[620px]"
        : "sm:aspect-auto sm:h-[500px] sm:min-h-[500px]";

  const outerWrapperClass = isFullBleed
    ? "relative w-full overflow-hidden"
    : "relative mx-auto w-full max-w-7xl px-3 sm:px-6 py-2 sm:py-4";

  const cardContainerClass = isFullBleed
    ? `relative isolate w-full overflow-hidden ${mobileRatioClass} ${desktopHeightClass}`
    : `relative isolate w-full overflow-hidden rounded-2xl shadow-lg ring-1 ring-black/5 [clip-path:inset(0_round_1rem)] ${mobileRatioClass} ${desktopHeightClass}`;

  return (
    <section
      ref={containerRef}
      aria-label={isAr ? "الواجهة الرئيسية" : "Hero Section"}
      className="relative w-full overflow-hidden"
    >
      <div className={outerWrapperClass}>
        <div
          dir="ltr"
          className={cardContainerClass}
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
            const body = isAr ? slide.body_ar || slide.body_en : slide.body_en || slide.body_ar;
            const button = isAr
              ? slide.button_ar || slide.button_en
              : slide.button_en || slide.button_ar;

            const slideMedia =
              (isAr ? slide.media_url_ar : slide.media_url_en) ||
              slide.media_url ||
              (isAr ? slide.media_url_en : slide.media_url_ar);

            const mediaUrl = slideMedia || fallbackBgUrl;

            const rawPoster =
              (isAr ? slide.media_poster_url_ar : slide.media_poster_url_en) ||
              (isAr ? slide.media_poster_url_en : slide.media_poster_url_ar) ||
              (slideMedia ? "" : fallbackBgPoster);

            // Strict poster validation: only valid image URLs
            const posterUrl = isLikelyImageUrl(rawPoster)
              ? rawPoster
              : isLikelyImageUrl(mediaUrl)
                ? mediaUrl
                : null;

            const isVideo =
              Boolean(mediaUrl) &&
              (slide.type === "video" ||
                (!slideMedia && fallbackBgType === "video") ||
                /\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(mediaUrl) ||
                mediaUrl.includes("cloudflarestream") ||
                mediaUrl.includes("/stream/"));
            const isImage = !isVideo && Boolean(mediaUrl);

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
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    backgroundImage: `linear-gradient(to top, rgba(0,0,0,${scrimBottom}), rgba(0,0,0,${scrimMiddle}) 45%, rgba(0,0,0,0))`,
                  }}
                />

                {/* Text / Action Content */}
                <div className="absolute inset-0 flex flex-col justify-end p-4 sm:p-10 pb-8 sm:pb-14 text-white z-10 pointer-events-none">
                  <div className="max-w-2xl space-y-2 pointer-events-auto">
                    {title && (
                      <h1
                        className="font-bold tracking-tight text-white drop-shadow-md text-balance"
                        style={{
                          fontSize: "clamp(1.35rem, 1rem + 2.2vw, 2.75rem)",
                          lineHeight: 1.18,
                          ...(heroTitleColor ? { color: heroTitleColor } : {}),
                        }}
                      >
                        {title}
                      </h1>
                    )}
                    {body && (
                      <p className="line-clamp-2 text-xs sm:text-base text-white/90 drop-shadow-sm max-w-xl">
                        {body}
                      </p>
                    )}
                    <div className="pt-2 flex flex-wrap items-center gap-3">
                      {button && (
                        <a
                          href={slide.button_href || "#products"}
                          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 py-2.5 sm:px-6 sm:py-3 text-xs sm:text-sm font-semibold text-primary-foreground shadow-md transition-all duration-200 hover:scale-[1.03] active:scale-[0.98]"
                        >
                          {button}
                        </a>
                      )}
                      {(brand as any)?.modules?.made_to_order && (
                        <a
                          href={`/${brand.slug}/custom-order`}
                          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-white/20 hover:bg-white/30 backdrop-blur-md border border-white/30 px-4 py-2.5 sm:px-5 sm:py-3 text-xs sm:text-sm font-semibold text-white transition-all duration-200 hover:scale-[1.03] active:scale-[0.98]"
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

          {/* Luxury Floating Chevron Slide Navigation Arrows */}
          {showArrows && (
            <>
              <button
                type="button"
                aria-label={isAr ? "الشريحة السابقة" : "Previous slide"}
                onClick={() => goTo(isAr ? activeIdx + 1 : activeIdx - 1)}
                className="absolute left-3 sm:left-6 top-1/2 -translate-y-1/2 z-20 hidden md:grid size-11 place-items-center rounded-full bg-black/35 hover:bg-black/55 text-white backdrop-blur-md border border-white/20 shadow-xl transition-all duration-200 hover:scale-105 active:scale-95 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none cursor-pointer"
              >
                <ChevronLeft className="size-6 text-white" />
              </button>
              <button
                type="button"
                aria-label={isAr ? "الشريحة التالية" : "Next slide"}
                onClick={() => goTo(isAr ? activeIdx - 1 : activeIdx + 1)}
                className="absolute right-3 sm:right-6 top-1/2 -translate-y-1/2 z-20 hidden md:grid size-11 place-items-center rounded-full bg-black/35 hover:bg-black/55 text-white backdrop-blur-md border border-white/20 shadow-xl transition-all duration-200 hover:scale-105 active:scale-95 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none cursor-pointer"
              >
                <ChevronRight className="size-6 text-white" />
              </button>
            </>
          )}

          {/* Carousel Dot Indicators for Full-Bleed mode */}
          {hasMultiple && isFullBleed && (
            <div
              className="absolute bottom-3 sm:bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center justify-center gap-1.5"
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
                  className="grid min-h-11 min-w-11 place-items-center"
                >
                  <span
                    aria-hidden="true"
                    className={`block h-2 rounded-full transition-all duration-300 ${
                      activeIdx === i
                        ? "w-8 bg-white shadow-sm"
                        : "w-2 bg-white/40 hover:bg-white/70"
                    }`}
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Carousel Dot Indicators for Contained mode */}
        {hasMultiple && !isFullBleed && (
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
                className="grid min-h-11 min-w-11 place-items-center"
              >
                <span
                  aria-hidden="true"
                  className={`block h-2 rounded-full transition-all duration-300 ${
                    activeIdx === i
                      ? "w-8 bg-primary"
                      : "w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50"
                  }`}
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
