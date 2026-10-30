import { useIsServicesStore, useStorefront, type HeroContentSlide } from "@/lib/storefront-context";
import { heroButtonHref, newSlideButton, bookingPageHref } from "@/lib/hero-link";
import { HeroV2 } from "@/components/storefront/HeroV2";

/** The home page hero: the store's slides (or its background with its name) in the cinematic hero. */
export function HeroBanner() {
  const { brand, settings } = useStorefront();
  const servicesStore = useIsServicesStore();
  const linkStore = { slug: brand.slug, servicesStore };
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
            button_href: heroButtonHref(s.button_href, linkStore),
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
        return { ...s, button_href: heroButtonHref(s.button_href, linkStore) };
      })
    : [
        {
          id: "hero-slide-default",
          type: bgType,
          title_en: settings.hero_title_en || brand.name_en,
          title_ar: settings.hero_title_ar || brand.name_ar || brand.name_en,
          // The store's own words, or none: a sentence the store never wrote is not shown in its name.
          body_en: brand.about_en || "",
          body_ar: brand.about_ar || "",
          media_url: bgUrl || "",
          media_poster_url_ar: bgPoster,
          media_poster_url_en: bgPoster,
          media_aspect: bgAspect,
          ...bgMobile,
          ...newSlideButton(servicesStore ? bookingPageHref(brand.slug) : null),
        },
      ];

  return <HeroV2 slides={slides} background={background} />;
}
