import { useStorefront, type HeroContentSlide } from "@/lib/storefront-context";
import { OptimizedVideo, ResponsiveImage } from "@/components/responsive-media";
import { HeroV2 } from "@/components/storefront/HeroV2";
import { HeroContentCarousel } from "@/features/storefront-home/components/HeroContentCarousel";

/** The home page hero: V2 cinematic hero, or the V1 background media with its content slides. */
export function HeroBanner() {
  const { brand, settings } = useStorefront();
  const prioritizeHero = !settings.home_promo_cards.some((card) => Boolean(card?.image_url));
  const background = brand.hero_media?.background;
  const bgUrl = typeof background === "string" ? background : background?.url;
  const bgType: HeroContentSlide["type"] =
    typeof background === "object" && background?.type === "video"
      ? "video"
      : bgUrl && /\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(bgUrl)
        ? "video"
        : bgUrl
          ? "image"
          : "text";
  const bgPoster = typeof background === "object" ? background?.posterUrl : undefined;
  const bgAspect = typeof background === "object" ? background?.aspect : undefined;
  // The background is language-neutral, so its phone cut serves both languages.
  const bgMobile =
    typeof background === "object" && background?.mobileUrl
      ? {
          media_url_mobile_ar: background.mobileUrl,
          media_url_mobile_en: background.mobileUrl,
          media_poster_url_mobile_ar: background.mobilePosterUrl,
          media_poster_url_mobile_en: background.mobilePosterUrl,
          media_aspect_mobile_ar: background.mobileAspect,
          media_aspect_mobile_en: background.mobileAspect,
        }
      : {};

  const slides = brand.hero_media?.slides?.length
    ? brand.hero_media.slides.map((s) => {
        const hasOwnMedia = Boolean(
          s.media_url?.trim() || s.media_url_ar?.trim() || s.media_url_en?.trim(),
        );
        if (!hasOwnMedia && bgUrl) {
          return {
            ...s,
            type: s.type === "text" ? bgType : s.type,
            media_url: bgUrl,
            media_url_ar: s.media_url_ar || bgUrl,
            media_url_en: s.media_url_en || bgUrl,
            media_poster_url: s.media_poster_url || bgPoster,
            media_poster_url_ar: s.media_poster_url_ar || bgPoster,
            media_poster_url_en: s.media_poster_url_en || bgPoster,
            media_aspect: s.media_aspect ?? bgAspect,
            media_aspect_ar: s.media_aspect_ar ?? bgAspect,
            media_aspect_en: s.media_aspect_en ?? bgAspect,
            ...bgMobile,
          };
        }
        return s;
      })
    : [
        {
          id: "hero-slide-default",
          type: bgType,
          title_en: settings.hero_title_en || brand.name_en,
          title_ar: settings.hero_title_ar || brand.name_ar || brand.name_en,
          body_en: brand.about_en || "A curated collection made for you.",
          body_ar: brand.about_ar || "مجموعة مختارة بعناية لك.",
          media_url: bgUrl || "",
          media_poster_url_ar: bgPoster,
          media_poster_url_en: bgPoster,
          media_aspect: bgAspect,
          ...bgMobile,
          button_en: "Shop now",
          button_ar: "تسوّق الآن",
          button_href: "#products",
        },
      ];

  if (settings.storefront_design_version === 2) {
    return <HeroV2 slides={slides} background={background} />;
  }

  return (
    <section className="relative w-full overflow-hidden min-h-[220px] py-3 sm:min-h-[55vh] sm:max-h-[640px] sm:py-0">
      {background && background.url ? (
        <div className="absolute inset-0 h-full w-full">
          {background.type === "video" ? (
            <OptimizedVideo
              src={background.url}
              poster={background.posterUrl}
              active
              wrapperClassName="h-full w-full"
              className="h-full w-full object-cover"
            />
          ) : (
            <ResponsiveImage
              src={background.url}
              preset="hero"
              sizes="100vw"
              alt=""
              className="h-full w-full object-cover"
              decoding="async"
              fetchPriority={prioritizeHero ? "high" : "auto"}
              loading="eager"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/30 to-black/20" />
        </div>
      ) : (
        <div
          className="absolute inset-0 h-full w-full"
          style={{
            background: `linear-gradient(135deg, ${settings.primary_color}22, ${settings.primary_color}66)`,
          }}
        />
      )}

      <div className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-center sm:justify-start px-3 py-1 sm:px-6 sm:py-0 min-h-[220px] sm:min-h-[55vh]">
        <HeroContentCarousel slides={slides} />
      </div>
    </section>
  );
}
