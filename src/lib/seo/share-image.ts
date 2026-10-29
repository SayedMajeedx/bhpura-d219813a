import { socialImage } from "@/lib/seo/canonical";

/**
 * The picture a store's pages show when their link is shared (WhatsApp, Instagram, search): the
 * home page, the booking page and a listing with no picture of its own. They once shared the
 * store's logo, and a store whose logo is an SVG (which link previews do not draw) or that had
 * none shared Boutq's placeholder: every Aurora link showed Boutq's picture, not Aurora's.
 *
 * The store may choose the picture itself (Settings > SEO, `homepage_editorial_sections.share_image_url`):
 * a hero video's first frame is often a flat dark colour, and that is what a shared link then showed.
 * Without a chosen one, in order: the first hero slide's still (its poster, or its picture), the hero's background
 * still, the brand story's picture, the logo; else the platform's placeholder (`socialImage`).
 */

type Media = {
  type?: string | null;
  url?: string | null;
  posterUrl?: string | null;
} | null;

type Slide = {
  type?: string | null;
  media_url?: string | null;
  media_url_ar?: string | null;
  media_url_en?: string | null;
  media_poster_url?: string | null;
  media_poster_url_ar?: string | null;
  media_poster_url_en?: string | null;
};

export type ShareImageStore = {
  brand: {
    logo_url?: string | null;
    hero_media?: { background?: Media | string; slides?: readonly Slide[] } | null;
  };
  settings?: {
    logo_url?: string | null;
    brand_story_image_url?: string | null;
    /** The picture the store chose for shared links, as the shell reads it (`shareImageSetting`). */
    share_image_url?: string | null;
    /** The raw settings row's sections, where that choice is kept. */
    homepage_editorial_sections?: unknown;
  } | null;
};

const isVideo = (url: string) => /\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(url);

/** A slide's still: its poster, else its media when that is a picture. */
function slideStill(slide: Slide | undefined): string | null {
  if (!slide) return null;
  const poster = slide.media_poster_url || slide.media_poster_url_ar || slide.media_poster_url_en;
  if (poster) return poster;
  const media = slide.media_url || slide.media_url_ar || slide.media_url_en;
  return media && slide.type !== "video" && !isVideo(media) ? media : null;
}

function backgroundStill(background: Media | string | undefined): string | null {
  if (!background) return null;
  if (typeof background === "string") return isVideo(background) ? null : background;
  if (background.posterUrl) return background.posterUrl;
  const url = background.url;
  return url && background.type !== "video" && !isVideo(url) ? url : null;
}

/** The share picture the store chose (`homepage_editorial_sections.share_image_url`), or null. */
export function shareImageSetting(editorialSections: unknown): string | null {
  const raw =
    editorialSections && typeof editorialSections === "object"
      ? (editorialSections as { share_image_url?: unknown }).share_image_url
      : null;
  return typeof raw === "string" && /^https:\/\//i.test(raw.trim()) ? raw.trim() : null;
}

export function storeShareImage({ brand, settings }: ShareImageStore): string {
  const candidates = [
    settings?.share_image_url,
    shareImageSetting(settings?.homepage_editorial_sections),
    slideStill(brand.hero_media?.slides?.[0]),
    backgroundStill(brand.hero_media?.background ?? undefined),
    settings?.brand_story_image_url,
    settings?.logo_url,
    brand.logo_url,
  ];
  const placeholder = socialImage(null);
  for (const candidate of candidates) {
    const image = socialImage(candidate);
    if (image !== placeholder) return image;
  }
  return placeholder;
}
