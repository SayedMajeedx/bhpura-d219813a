import React, { useEffect, useRef, useState } from "react";
import {
  useStorefront,
  type Brand,
  type HeroContentSlide,
  type PublicSettings,
} from "@/lib/storefront-context";
import { OptimizedVideo, ResponsiveImage } from "@/components/responsive-media";
import { cloudflareImageUrl } from "@/lib/media-delivery";
import {
  heroMediaFit,
  isValidAspect,
  useMeasuredAspects,
  type AspectProbe,
} from "@/lib/media-aspect";
import {
  DEFAULT_HERO_MOBILE,
  heroFocalPosition,
  heroFrameSizingClass,
  isSmartFitSetting,
  resolveHeroSlideMedia,
  useIsHeroMobile,
  type HeroBackgroundInput,
  type HeroMediaVariant,
} from "@/lib/hero-media";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  HERO_ACTIONS_ALIGN_CLASS,
  HERO_TEXT_ALIGN_CLASS,
  HERO_TEXT_POSITION_CLASS,
  HERO_TEXT_POSITION_CLASS_SM,
  HERO_TEXT_SCALE,
  headlinePhrases,
  headlineSettings,
  heroScrim,
  slideLook,
} from "@/lib/hero-headline";
import { HeroHeadline } from "@/components/storefront/HeroHeadline";

export interface HeroV2Props {
  slides: HeroContentSlide[];
  background?: HeroBackgroundInput;
}

type ResolvedSlide = {
  slide: HeroContentSlide;
  title: string;
  body: string;
  button: string;
  phrases: string[];
  headline: ReturnType<typeof headlineSettings>;
  look: ReturnType<typeof slideLook>;
  main: HeroMediaVariant | null;
  mobile: HeroMediaVariant | null;
  isVideo: boolean;
  isImage: boolean;
};

/** The storefront's hero: the store's own settings, language and brand from the page. */
export function HeroV2({ slides, background }: HeroV2Props) {
  const { settings, lang, brand } = useStorefront();
  return (
    <HeroV2View
      slides={slides}
      background={background}
      settings={settings}
      lang={lang}
      brand={brand}
    />
  );
}

/**
 * The hero itself, given everything it shows: the storefront passes its page's context, and the
 * hero settings' live preview passes the draft being edited (src/routes/hero-preview.tsx), so the
 * merchant sees the very hero the store will show.
 */
export function HeroV2View({
  slides,
  background,
  settings,
  lang,
  brand,
}: HeroV2Props & {
  settings: PublicSettings;
  lang: "ar" | "en";
  brand: Brand;
}) {
  const isAr = lang === "ar";

  const resolvedBg: HeroBackgroundInput = background ?? brand.hero_media?.background;
  const isMobile = useIsHeroMobile();
  const [activeIdx, setActiveIdx] = useState(0);
  const [isInViewport, setIsInViewport] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [frameSize, setFrameSize] = useState<{ w: number; h: number } | null>(null);
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

  const resolved: ResolvedSlide[] = (slides ?? []).map((slide) => {
    const title =
      (isAr ? slide.title_ar || slide.title_en : slide.title_en || slide.title_ar) || "";
    const body = (isAr ? slide.body_ar || slide.body_en : slide.body_en || slide.body_ar) || "";
    const button =
      (isAr ? slide.button_ar || slide.button_en : slide.button_en || slide.button_ar) || "";
    const media = resolveHeroSlideMedia(slide, isAr ? "ar" : "en", resolvedBg);
    const isVideo = Boolean(media.main) && media.isVideo;
    const isImage = Boolean(media.main) && !media.isVideo;
    // The headline: the slide's phrases (one after another), else its title as the only one.
    const phrases = headlinePhrases(slide, isAr ? "ar" : "en");
    const headline = headlineSettings(slide);
    // The slide's own shade and text colour, else the store's.
    const look = slideLook(slide, settings);
    return {
      slide,
      title,
      body,
      button,
      phrases,
      headline,
      look,
      main: media.main,
      mobile: media.mobile,
      isVideo,
      isImage,
    };
  });

  // Media uploaded before aspects were recorded is measured in the browser.
  // The poster is already cached as the LCP image, so it is the cheapest probe.
  const aspectProbes: AspectProbe[] = resolved
    .flatMap((r) => [
      r.main && { variant: r.main, isVideo: r.isVideo },
      r.mobile && { variant: r.mobile, isVideo: r.isVideo },
    ])
    .filter((entry): entry is { variant: HeroMediaVariant; isVideo: boolean } =>
      Boolean(entry && !entry.variant.aspect),
    )
    .map(({ variant, isVideo }) => ({
      key: variant.url,
      url: variant.posterUrl || variant.url,
      isVideo: !variant.posterUrl && isVideo,
    }));
  const measuredAspects = useMeasuredAspects(aspectProbes);
  const aspectOf = (variant: HeroMediaVariant | null) =>
    variant ? (variant.aspect ?? measuredAspects[variant.url] ?? null) : null;
  const mainAspects = resolved.map((r) => aspectOf(r.main));
  const mobileAspects = resolved.map((r) => aspectOf(r.mobile) ?? aspectOf(r.main));

  const hasSlides = resolved.length > 0;
  useEffect(() => {
    const el = frameRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      setFrameSize((prev) =>
        prev && Math.abs(prev.w - rect.width) < 0.5 && Math.abs(prev.h - rect.height) < 0.5
          ? prev
          : { w: rect.width, h: rect.height },
      );
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasSlides]);

  if (!hasSlides) {
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

  // Responsive Hero Layout & Presentation Settings
  const isFullBleed = (settings.hero_layout ?? "full_bleed") === "full_bleed";
  const mobileRatio = settings.hero_aspect_mobile ?? DEFAULT_HERO_MOBILE;
  const desktopHeight = settings.hero_height_desktop ?? "standard";
  const showArrows = hasMultiple && settings.hero_show_arrows !== false;
  const videoFit = settings.hero_video_fit ?? "contain_ambient";
  // "contain_ambient" is the stored value for Smart Fit: the frame follows the
  // media's own shape so nothing is cropped, while staying edge-to-edge.
  const isSmartFit = isSmartFitSetting(videoFit);

  // One frame for the whole carousel so the page never jumps between slides.
  // The first slide sets the shape (its phone cut on phones); slides that
  // differ are letterboxed.
  const leadIndex = resolved[0]?.main
    ? 0
    : mainAspects.findIndex((aspect) => isValidAspect(aspect));
  const leadAspect = leadIndex >= 0 ? mainAspects[leadIndex] : null;
  const leadMobileAspect = leadIndex >= 0 ? mobileAspects[leadIndex] : null;
  const smartFrame =
    isSmartFit && isValidAspect(leadAspect)
      ? {
          desktop: leadAspect,
          mobile: isValidAspect(leadMobileAspect) ? leadMobileAspect : leadAspect,
        }
      : null;
  const renderedFrameAspect =
    frameSize && frameSize.w > 0 && frameSize.h > 0
      ? frameSize.w / frameSize.h
      : smartFrame
        ? isMobile
          ? smartFrame.mobile
          : smartFrame.desktop
        : null;

  // Short frames (landscape media on phones) get compact typography.
  const isShortFrame = Boolean(frameSize && frameSize.h > 0 && frameSize.h < 300);
  const isTinyFrame = Boolean(frameSize && frameSize.h > 0 && frameSize.h < 230);
  const dense = desktopHeight === "compact" || isShortFrame;

  // The frame's shape comes from CSS variables so the server render is already
  // correct on both phones and desktops (no JS needed to pick the breakpoint).
  const frameSizingClass = heroFrameSizingClass({
    smartFit: Boolean(smartFrame),
    mobileRatio,
    desktopHeight,
  });

  const outerWrapperClass = isFullBleed
    ? "relative w-full overflow-hidden"
    : "relative mx-auto w-full max-w-7xl px-3 sm:px-6 py-2 sm:py-4";

  const cardContainerClass = isFullBleed
    ? `relative isolate w-full overflow-hidden bg-neutral-950 ${frameSizingClass}`
    : `relative isolate w-full overflow-hidden bg-neutral-950 rounded-2xl shadow-lg ring-1 ring-black/5 [clip-path:inset(0_round_1rem)] ${frameSizingClass}`;

  return (
    <section
      ref={containerRef}
      aria-label={isAr ? "الواجهة الرئيسية" : "Hero Section"}
      className={`relative w-full overflow-hidden ${
        // Tuck 1px under the sticky header on a dark backing so fractional
        // header heights never expose the page background as a light seam.
        isFullBleed ? "-mt-px bg-neutral-950" : ""
      }`}
    >
      <div className={outerWrapperClass}>
        <div
          ref={frameRef}
          dir="ltr"
          className={cardContainerClass}
          style={
            smartFrame
              ? ({
                  "--hero-ar": String(smartFrame.desktop),
                  "--hero-ar-m": String(smartFrame.mobile),
                } as React.CSSProperties)
              : undefined
          }
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
          {resolved.map((item, idx) => {
            const { slide, title, body, button, main, mobile, isVideo, isImage } = item;
            const isActive = activeIdx === idx;
            // Phones get the phone cut when one exists; everything else uses the main file.
            const shown = isMobile && mobile ? mobile : main;
            const shownAspect = isMobile ? mobileAspects[idx] : mainAspects[idx];
            const fit = isSmartFit ? heroMediaFit(shownAspect, renderedFrameAspect) : "cover";
            const objectClass =
              fit === "contain"
                ? "object-contain"
                : "object-cover [object-position:var(--hero-focal)]";

            return (
              <article
                key={slide.id || idx}
                dir={isAr ? "rtl" : "ltr"}
                style={
                  { "--hero-focal": heroFocalPosition(slide, videoFit) } as React.CSSProperties
                }
                aria-hidden={!isActive}
                inert={!isActive ? true : undefined}
                className={`absolute inset-0 size-full transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                  isActive
                    ? "z-10 opacity-100 scale-100 pointer-events-auto"
                    : "z-0 opacity-0 scale-[0.98] pointer-events-none"
                }`}
              >
                {/* Fallback Luxury Geometric Background (Only rendered if no image and no video) */}
                {!isImage && !isVideo && (
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
                )}

                {/* Ambient fill behind letterboxed media: a blurred still, never a second video decode */}
                {fit === "contain" && (isImage || isVideo) && (
                  <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
                    {shown?.posterUrl ? (
                      <img
                        src={cloudflareImageUrl(shown.posterUrl, 380)}
                        alt=""
                        decoding="async"
                        loading={idx === 0 ? "eager" : "lazy"}
                        className="size-full scale-125 object-cover opacity-70 blur-2xl saturate-150"
                      />
                    ) : (
                      <div
                        className="size-full"
                        style={{
                          background: `radial-gradient(circle at 50% 40%, ${accentColor}cc 0%, #0d0407 100%)`,
                        }}
                      />
                    )}
                    <div className="absolute inset-0 bg-black/30" />
                  </div>
                )}

                {/* Media Layer */}
                {isImage && main && (
                  <ResponsiveImage
                    src={main.url}
                    mobileSrc={mobile?.url}
                    preset="hero"
                    sizes={isFullBleed ? "100vw" : "(min-width: 1280px) 1280px, 100vw"}
                    alt={title || ""}
                    className={`absolute inset-0 size-full ${objectClass} transition-transform duration-700 ease-out`}
                    loading={idx === 0 ? "eager" : "lazy"}
                    decoding="async"
                    fetchPriority={idx === 0 ? "high" : "auto"}
                  />
                )}

                {isVideo && main && (
                  <OptimizedVideo
                    src={shown?.url ?? main.url}
                    poster={main.posterUrl}
                    mobilePoster={mobile?.posterUrl}
                    active={isActive && isInViewport}
                    prepare={idx === preparedVideoIndex}
                    wrapperClassName="absolute inset-0 size-full pointer-events-none"
                    className={`size-full ${objectClass}`}
                  />
                )}

                {/* The shade, deepest where the text sits (on a phone, where it sits there). */}
                {(item.headline.positionMobile === item.headline.position
                  ? [{ position: item.headline.position, className: "" }]
                  : [
                      { position: item.headline.positionMobile, className: "sm:hidden" },
                      { position: item.headline.position, className: "hidden sm:block" },
                    ]
                ).map((scrim) => (
                  <div
                    key={scrim.className || "all"}
                    className={`absolute inset-0 pointer-events-none ${scrim.className}`}
                    style={{
                      backgroundImage: heroScrim(
                        scrim.position,
                        item.look.strong,
                        item.look.soft,
                        item.look.tone,
                      ),
                    }}
                  />
                ))}

                {/* Text / Action Content: where the store placed it, aligned as it chose. */}
                <div
                  className={`absolute inset-0 flex flex-col ${
                    item.look.tone === "dark" ? "" : "text-white"
                  } z-10 pointer-events-none px-6 sm:px-10 ${
                    HERO_TEXT_POSITION_CLASS[item.headline.positionMobile]
                  } ${HERO_TEXT_POSITION_CLASS_SM[item.headline.position]} ${HERO_TEXT_ALIGN_CLASS[item.headline.align]} ${
                    dense
                      ? "p-4 sm:px-8 sm:py-4 pb-6 sm:pb-7"
                      : desktopHeight === "cinematic"
                        ? "p-6 sm:p-12 pb-10 sm:pb-16"
                        : "p-4 sm:p-10 pb-8 sm:pb-14"
                  }`}
                  style={item.look.tone === "dark" ? { color: item.look.titleColor } : undefined}
                >
                  <div
                    className={`max-w-2xl pointer-events-auto ${
                      dense ? "space-y-1 sm:space-y-1.5" : "space-y-2"
                    }`}
                  >
                    {item.phrases.length > 0 && (
                      <HeroHeadline
                        phrases={item.phrases}
                        animation={item.headline.animation}
                        seconds={item.headline.seconds}
                        loops={item.headline.loops}
                        active={isActive && isInViewport}
                        dir={isAr ? "rtl" : "ltr"}
                        className={`font-bold tracking-tight text-balance [--hero-text-scale:var(--hero-scale-phone)] sm:[--hero-text-scale:var(--hero-scale-wide)] ${
                          item.look.tone === "dark" ? "" : "text-white drop-shadow-md"
                        }`}
                        style={{
                          fontSize: `calc(${
                            dense
                              ? "clamp(1.15rem, 0.85rem + 1.2vw, 1.85rem)"
                              : desktopHeight === "cinematic"
                                ? "clamp(1.5rem, 1.2rem + 2.4vw, 3.2rem)"
                                : "clamp(1.35rem, 1rem + 2.2vw, 2.75rem)"
                          } * var(--hero-text-scale))`,
                          ["--hero-scale-phone" as string]:
                            HERO_TEXT_SCALE[item.headline.sizeMobile],
                          ["--hero-scale-wide" as string]: HERO_TEXT_SCALE[item.headline.size],
                          lineHeight: 1.18,
                          ...(item.look.titleColor ? { color: item.look.titleColor } : {}),
                        }}
                      />
                    )}
                    {body && !isTinyFrame && (
                      <p
                        className={`line-clamp-2 ${
                          dense
                            ? "text-xs sm:text-sm line-clamp-1 sm:line-clamp-2"
                            : "text-xs sm:text-base"
                        } ${
                          item.look.tone === "dark" ? "opacity-85" : "text-white/90 drop-shadow-sm"
                        } max-w-xl`}
                      >
                        {body}
                      </p>
                    )}
                    <div
                      className={`flex flex-wrap items-center gap-3 ${
                        HERO_ACTIONS_ALIGN_CLASS[item.headline.align]
                      } ${
                        dense
                          ? "pt-3 sm:pt-4"
                          : desktopHeight === "cinematic"
                            ? "pt-4 sm:pt-7"
                            : "pt-4 sm:pt-6"
                      }`}
                    >
                      {button && (
                        <a
                          href={slide.button_href || "#products"}
                          className={`inline-flex ${
                            dense
                              ? "min-h-10 px-4 py-2 text-xs sm:text-sm"
                              : "min-h-11 px-5 py-2.5 sm:px-6 sm:py-3 text-xs sm:text-sm"
                          } items-center justify-center rounded-xl bg-primary font-semibold text-primary-foreground shadow-md transition-all duration-200 hover:scale-[1.03] active:scale-[0.98]`}
                        >
                          {button}
                        </a>
                      )}
                      {(brand as any)?.modules?.made_to_order && (
                        <a
                          href={`/${brand.slug}/custom-order`}
                          className={`inline-flex ${
                            dense
                              ? "min-h-10 px-3.5 py-2 text-xs sm:text-sm"
                              : "min-h-11 px-4 py-2.5 sm:px-5 sm:py-3 text-xs sm:text-sm"
                          } ${
                            item.look.tone === "dark"
                              ? "bg-background/70 hover:bg-background/85 border-border text-foreground"
                              : "bg-white/20 hover:bg-white/30 border-white/30 text-white"
                          } items-center justify-center rounded-xl backdrop-blur-md border font-semibold transition-all duration-200 hover:scale-[1.03] active:scale-[0.98]`}
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

          {/* Luxury Floating Chevron Slide Navigation Arrows (Pure Arrows, No Circles) */}
          {showArrows && (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={isAr ? "الشريحة السابقة" : "Previous slide"}
                onClick={() => goTo(isAr ? activeIdx + 1 : activeIdx - 1)}
                className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-20 hidden md:flex items-center justify-center min-h-11 min-w-11 p-2 text-white/85 hover:text-white transition-all duration-200 hover:scale-120 active:scale-90 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none cursor-pointer bg-transparent hover:bg-transparent border-0 shadow-none"
              >
                <ChevronLeft className="size-9 sm:size-11 text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.85)] filter" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={isAr ? "الشريحة التالية" : "Next slide"}
                onClick={() => goTo(isAr ? activeIdx - 1 : activeIdx + 1)}
                className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-20 hidden md:flex items-center justify-center min-h-11 min-w-11 p-2 text-white/85 hover:text-white transition-all duration-200 hover:scale-120 active:scale-90 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none cursor-pointer bg-transparent hover:bg-transparent border-0 shadow-none"
              >
                <ChevronRight className="size-9 sm:size-11 text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.85)] filter" />
              </Button>
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
              <Button
                key={i}
                type="button"
                variant="ghost"
                size="icon"
                role="tab"
                aria-selected={activeIdx === i}
                aria-label={`${isAr ? "شريحة" : "Slide"} ${i + 1}`}
                onClick={() => goTo(i)}
                className="grid min-h-11 min-w-11 place-items-center bg-transparent hover:bg-transparent border-0 p-0 shadow-none"
              >
                <span
                  aria-hidden="true"
                  className={`block h-2 rounded-full transition-all duration-300 ${
                    activeIdx === i
                      ? "w-8 bg-primary"
                      : "w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50"
                  }`}
                />
              </Button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
