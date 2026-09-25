import { useStorefront } from "@/lib/storefront-context";
import { useState, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { OptimizedVideo, ResponsiveImage } from "@/components/responsive-media";
import { isLikelyImageUrl } from "@/lib/media-delivery";
import { StorefrontLink } from "@/features/storefront-home/components/StorefrontLink";

/** The V1 hero's content slides with swipe, arrows and dots. */
export function HeroContentCarousel({
  slides,
}: {
  slides: import("@/lib/storefront-context").HeroContentSlide[];
}) {
  const { settings, lang } = useStorefront();
  const prioritizeHero = !settings.home_promo_cards.some((card) => Boolean(card?.image_url));
  const [idx, setIdx] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const blockedClick = useRef(false);

  const hasMultipleSlides = slides.length > 1;
  const isAr = lang === "ar";

  const goTo = (next: number) => {
    const safe = (next + slides.length) % slides.length;
    setIdx(safe);
  };

  const finishSwipe = (endX: number | undefined) => {
    const startX = touchStartX.current;
    touchStartX.current = null;
    if (startX == null || endX == null) return;
    const distance = endX - startX;
    if (Math.abs(distance) < 42) return;
    blockedClick.current = true;
    goTo(distance < 0 ? idx + 1 : idx - 1);
    window.setTimeout(() => {
      blockedClick.current = false;
    }, 0);
  };

  let preparedVideoIndex = -1;
  for (let offset = 1; offset < slides.length; offset += 1) {
    const candidate = (idx + offset) % slides.length;
    if (slides[candidate]?.type === "video") {
      preparedVideoIndex = candidate;
      break;
    }
  }

  return (
    <div className="relative isolate w-[92%] sm:w-full max-w-xl mx-auto sm:mx-0 overflow-hidden rounded-2xl bg-transparent shadow-lg [clip-path:inset(0_round_1rem)]">
      <div
        dir="ltr"
        className="grid w-full items-stretch overflow-hidden rounded-2xl [clip-path:inset(0_round_1rem)] touch-pan-y"
        onTouchStart={(event) => {
          touchStartX.current = event.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(event) => finishSwipe(event.changedTouches[0]?.clientX)}
        onTouchCancel={() => {
          touchStartX.current = null;
        }}
        onClickCapture={(event) => {
          if (!blockedClick.current) return;
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        {slides.map((slide, slideIndex) => {
          const title =
            lang === "ar" ? slide.title_ar || slide.title_en : slide.title_en || slide.title_ar;
          const body =
            lang === "ar" ? slide.body_ar || slide.body_en : slide.body_en || slide.body_ar;
          const button =
            lang === "ar" ? slide.button_ar || slide.button_en : slide.button_en || slide.button_ar;
          const mediaUrl =
            (lang === "ar" ? slide.media_url_ar : slide.media_url_en) ||
            slide.media_url ||
            (lang === "ar" ? slide.media_url_en : slide.media_url_ar) ||
            "";
          const streamIframeUrl =
            (lang === "ar" ? slide.media_iframe_url_ar : slide.media_iframe_url_en) ||
            (lang === "ar" ? slide.media_iframe_url_en : slide.media_iframe_url_ar) ||
            "";
          const rawPoster =
            (lang === "ar" ? slide.media_poster_url_ar : slide.media_poster_url_en) ||
            (lang === "ar" ? slide.media_poster_url_en : slide.media_poster_url_ar) ||
            "";
          const posterUrl = isLikelyImageUrl(rawPoster)
            ? rawPoster
            : isLikelyImageUrl(mediaUrl)
              ? mediaUrl
              : "";
          const isMediaSlide =
            (slide.type === "image" && Boolean(mediaUrl)) ||
            (slide.type === "video" && Boolean(mediaUrl || streamIframeUrl));
          const slideAlign = slide.align || settings.hero_title_align || "start";
          const slideTextAlign =
            slideAlign === "center"
              ? "center"
              : isAr
                ? slideAlign === "end"
                  ? "left"
                  : "right"
                : slideAlign === "end"
                  ? "right"
                  : "left";
          const rawTitleSize = slide.title_size || settings.hero_title_size || 26;
          const titleSize = Math.max(16, Math.min(48, rawTitleSize));
          const mobileTitleSize = Math.max(16, Math.round(titleSize * 0.78));

          return (
            <article
              key={`${slide.id}-${lang}-${mediaUrl}`}
              dir={lang === "ar" ? "rtl" : "ltr"}
              aria-hidden={slideIndex !== idx}
              inert={slideIndex !== idx ? true : undefined}
              className={`col-start-1 row-start-1 w-full min-w-0 overflow-hidden rounded-2xl transition-[opacity,transform] duration-[500ms] ease-[cubic-bezier(0.22,1,0.36,1)] [backface-visibility:hidden] [clip-path:inset(0_round_1rem)] aspect-video sm:duration-[600ms] ${
                slideIndex === idx
                  ? "z-10 pointer-events-auto translate-y-0 scale-100 opacity-100"
                  : "z-0 pointer-events-none translate-y-1 scale-[0.992] opacity-0"
              }`}
            >
              {isMediaSlide && slide.type === "image" ? (
                <div className="relative h-full w-full overflow-hidden rounded-2xl sm:h-[320px]">
                  <StorefrontLink
                    href={slide.button_href || "#products"}
                    className="group relative block h-full w-full overflow-hidden rounded-2xl"
                    aria-label={
                      title || body || button
                        ? undefined
                        : lang === "ar"
                          ? "عرض المنتجات"
                          : "View products"
                    }
                  >
                    <ResponsiveImage
                      src={mediaUrl}
                      preset="hero"
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      alt={title || ""}
                      className="pointer-events-none h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                      decoding="async"
                      fetchPriority={prioritizeHero && slideIndex === 0 ? "high" : "auto"}
                      loading={slideIndex === 0 ? "eager" : "lazy"}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent pointer-events-none" />
                    {(title || body || button) && (
                      <div
                        className="absolute inset-0 flex flex-col justify-end p-5 pb-12 sm:p-8 sm:pb-16 text-white"
                        style={{ textAlign: slideTextAlign }}
                      >
                        {settings.show_hero_title && title && (
                          <h1
                            className="font-bold drop-shadow-md sm:text-2xl"
                            style={{
                              fontFamily: "var(--sf-font)",
                              fontSize: `clamp(${mobileTitleSize}px, calc(${mobileTitleSize}px + 0.8vw), ${titleSize}px)`,
                            }}
                          >
                            {title}
                          </h1>
                        )}
                        {settings.show_hero_about && body && (
                          <p className="mt-1 line-clamp-2 text-xs text-white/90 drop-shadow-sm sm:line-clamp-none sm:text-sm">
                            {body}
                          </p>
                        )}
                        {button && (
                          <div className="mt-3" style={{ textAlign: slideTextAlign }}>
                            <span className="inline-flex items-center rounded-full bg-primary text-primary-foreground px-4 py-2 text-xs font-semibold shadow-md transition-transform duration-200 group-hover:scale-105 sm:px-6 sm:py-2.5 sm:text-sm">
                              {button}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </StorefrontLink>
                </div>
              ) : isMediaSlide && slide.type === "video" ? (
                <div className="relative h-full w-full overflow-hidden rounded-2xl sm:h-[320px]">
                  <StorefrontLink
                    href={slide.button_href || "#products"}
                    className="group relative block h-full w-full cursor-pointer overflow-hidden rounded-2xl"
                    aria-label={
                      title || body || button
                        ? undefined
                        : lang === "ar"
                          ? "عرض المنتجات"
                          : "View products"
                    }
                  >
                    {streamIframeUrl ? (
                      <div className="pointer-events-none relative h-full w-full overflow-hidden">
                        <iframe
                          src={streamIframeUrl}
                          className="h-full w-full border-0 pointer-events-none scale-105"
                          allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
                          tabIndex={-1}
                          aria-hidden="true"
                        />
                        <div className="absolute inset-0 z-10 pointer-events-none" />
                      </div>
                    ) : (
                      <OptimizedVideo
                        src={mediaUrl}
                        poster={posterUrl}
                        active={slideIndex === idx}
                        prepare={slideIndex === preparedVideoIndex}
                        wrapperClassName="pointer-events-none h-full w-full"
                        className="pointer-events-none h-full w-full object-cover"
                      />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent pointer-events-none" />
                    {(title || body || button) && (
                      <div
                        className="absolute inset-0 flex flex-col justify-end p-5 pb-12 sm:p-8 sm:pb-16 text-white"
                        style={{ textAlign: slideTextAlign }}
                      >
                        {settings.show_hero_title && title && (
                          <h1
                            className="font-bold drop-shadow-md sm:text-2xl"
                            style={{
                              fontFamily: "var(--sf-font)",
                              fontSize: `clamp(${mobileTitleSize}px, calc(${mobileTitleSize}px + 0.8vw), ${titleSize}px)`,
                            }}
                          >
                            {title}
                          </h1>
                        )}
                        {settings.show_hero_about && body && (
                          <p className="mt-1 line-clamp-2 text-xs text-white/90 drop-shadow-sm sm:line-clamp-none sm:text-sm">
                            {body}
                          </p>
                        )}
                        {button && (
                          <div className="mt-3" style={{ textAlign: slideTextAlign }}>
                            <span className="inline-flex items-center rounded-full bg-primary text-primary-foreground px-4 py-2 text-xs font-semibold shadow-md transition-transform duration-200 group-hover:scale-105 sm:px-6 sm:py-2.5 sm:text-sm">
                              {button}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </StorefrontLink>
                </div>
              ) : (
                <div
                  dir={isAr ? "rtl" : "ltr"}
                  className={`hero-carousel-text-card flex w-full h-full flex-col justify-center overflow-hidden rounded-2xl bg-white/70 dark:bg-black/60 text-card-foreground shadow-[0_8px_32px_rgba(0,0,0,0.12),inset_0_1px_1.5px_rgba(255,255,255,0.7)] backdrop-blur-2xl backdrop-saturate-180 border border-white/50 dark:border-white/15 sm:h-[320px] ${
                    hasMultipleSlides ? "p-4 pb-11 sm:p-8 sm:pb-20" : "p-4 sm:p-8"
                  }`}
                  style={{ textAlign: slideTextAlign }}
                >
                  {settings.show_hero_title && title && (
                    <h1
                      className="font-semibold leading-tight drop-shadow-sm mb-1.5 sm:mb-3"
                      style={{
                        color: settings.hero_title_color || "var(--color-foreground)",
                        fontSize: `clamp(${mobileTitleSize}px, calc(${mobileTitleSize}px + 0.8vw), ${titleSize}px)`,
                        fontFamily: "var(--sf-font)",
                      }}
                    >
                      {title}
                    </h1>
                  )}
                  {settings.show_hero_about && body && (
                    <p className="line-clamp-2 text-xs leading-relaxed text-foreground/85 dark:text-neutral-200 mb-2.5 sm:mb-4 sm:line-clamp-none sm:text-base font-normal">
                      {body}
                    </p>
                  )}
                  {button && (
                    <div style={{ textAlign: slideTextAlign }}>
                      <StorefrontLink
                        href={slide.button_href || "#products"}
                        className="inline-flex items-center rounded-full bg-primary text-primary-foreground px-4 py-2 text-xs font-semibold shadow-sm transition-transform duration-200 hover:scale-105 active:scale-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:px-6 sm:py-3 sm:text-sm"
                      >
                        {button}
                      </StorefrontLink>
                    </div>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
      {hasMultipleSlides && (
        <div
          dir="ltr"
          className="pointer-events-none absolute inset-x-3 bottom-1 z-20 flex items-center justify-between text-white mix-blend-difference sm:inset-x-5 sm:bottom-6"
        >
          <button
            type="button"
            onClick={() => goTo(idx - 1)}
            aria-label={lang === "ar" ? "الشريحة السابقة" : "Previous hero slide"}
            className="pointer-events-auto grid h-11 w-11 place-items-center bg-transparent transition duration-300 hover:scale-110 hover:opacity-70 active:scale-95"
          >
            <ChevronLeft strokeWidth={1} className="h-7 w-7" />
          </button>
          <div className="pointer-events-auto flex items-center justify-center gap-1">
            {slides.map((slide, dot) => (
              <button
                key={slide.id}
                type="button"
                onClick={() => setIdx(dot)}
                aria-label={`${lang === "ar" ? "الانتقال إلى الشريحة" : "Go to slide"} ${dot + 1}`}
                className={`flex h-11 items-center px-1 transition-opacity ${
                  dot === idx ? "opacity-100" : "opacity-35 hover:opacity-70"
                }`}
              >
                <span
                  className={`block h-px bg-current transition-all duration-500 ${
                    dot === idx ? "w-8" : "w-3"
                  }`}
                />
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => goTo(idx + 1)}
            aria-label={lang === "ar" ? "الشريحة التالية" : "Next hero slide"}
            className="pointer-events-auto grid h-11 w-11 place-items-center bg-transparent transition duration-300 hover:scale-110 hover:opacity-70 active:scale-95"
          >
            <ChevronRight strokeWidth={1} className="h-7 w-7" />
          </button>
        </div>
      )}
    </div>
  );
}
