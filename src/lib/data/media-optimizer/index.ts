import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { updateBrand } from "@/lib/data/brands";
import { updateProduct } from "@/lib/data/catalog";

/**
 * The super admin's video re-optimizer: every brand's hero videos (background
 * and slides) and every product video, and the writes that swap a video for
 * its optimized copy.
 *
 * Bug backlog #26: the list used to select and order brands by a `name`
 * column that does not exist, so it failed every time; the writes ignored
 * their errors, and a failed hero read overwrote the hero with only the new
 * video.
 */

export const mediaOptimizerKeys = {
  sources: () => ["media-optimizer", "sources"] as const,
};

/** Every brand's hero media and every product's media, for the super admin. */
export async function fetchVideoSources() {
  const [brands, products] = await Promise.all([
    supabase
      .from("brands")
      .select("id, slug, name_en, name_ar, hero_media")
      .order("name_en", { ascending: true }),
    supabase
      .from("products")
      .select("id, brand_id, name, name_ar, name_en, media")
      .order("created_at", { ascending: false }),
  ]);
  if (brands.error) throw brands.error;
  if (products.error) throw products.error;
  return { brands: brands.data ?? [], products: products.data ?? [] };
}
export type VideoSources = Awaited<ReturnType<typeof fetchVideoSources>>;

export const mediaOptimizerQueries = {
  sources: () =>
    queryOptions({
      queryKey: mediaOptimizerKeys.sources(),
      queryFn: fetchVideoSources,
      staleTime: 60_000,
    }),
};

export function invalidateVideoSources(qc: QueryClient) {
  return qc.invalidateQueries({ queryKey: mediaOptimizerKeys.sources() });
}

// ── Listing ─────────────────────────────────────────────────────────────────

type HeroBackground = { type?: string; url?: string; posterUrl?: string };
type HeroSlide = {
  type?: string;
  title_ar?: string;
  title_en?: string;
  media_url?: string;
  media_poster_url?: string;
  media_url_ar?: string;
  media_poster_url_ar?: string;
  media_url_en?: string;
  media_poster_url_en?: string;
  [key: string]: unknown;
};
type HeroMedia = { background?: HeroBackground; slides?: HeroSlide[]; [key: string]: unknown };
type ProductMediaItem = {
  type?: string;
  url?: string;
  poster_url?: string;
  [key: string]: unknown;
};

export type VideoEntry = {
  id: string;
  brandId: string;
  brandName: string;
  brandSlug: string;
  sourceType: "hero_background" | "hero_slide" | "product";
  title: string;
  videoUrl: string;
  posterUrl?: string;
  meta: {
    slideIndex?: number;
    slideLang?: "ar" | "en";
    productId?: string;
    mediaIndex?: number;
  };
};

const VIDEO_FILE = /\.(mp4|webm|mov|m4v)$/i;

const asHero = (value: Json | null): HeroMedia | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as HeroMedia) : null;

/** Every video of the sources, hero videos by brand name first, then product videos. */
export function listVideoEntries(sources: VideoSources, lang: "ar" | "en"): VideoEntry[] {
  const isAr = lang === "ar";
  const brandName = (brand: { name_en: string; name_ar: string | null }) =>
    (isAr ? brand.name_ar : null) || brand.name_en;
  const entries: VideoEntry[] = [];

  for (const brand of sources.brands) {
    const hero = asHero(brand.hero_media);
    if (!hero) continue;
    const base = { brandId: brand.id, brandName: brandName(brand), brandSlug: brand.slug };

    if (hero.background?.type === "video" && hero.background.url) {
      entries.push({
        ...base,
        id: `brand-${brand.id}-bg`,
        sourceType: "hero_background",
        title: isAr ? "فيديو خلفية الواجهة" : "Hero Background Video",
        videoUrl: hero.background.url,
        posterUrl: hero.background.posterUrl,
        meta: {},
      });
    }

    (Array.isArray(hero.slides) ? hero.slides : []).forEach((slide, idx) => {
      if (slide.media_url && (slide.type === "video" || VIDEO_FILE.test(slide.media_url))) {
        entries.push({
          ...base,
          id: `brand-${brand.id}-slide-${idx}-def`,
          sourceType: "hero_slide",
          title: `${isAr ? "شريحة واجهة" : "Hero Slide"} #${idx + 1} (${slide.title_ar || slide.title_en || "Slide"})`,
          videoUrl: slide.media_url,
          posterUrl: slide.media_poster_url,
          meta: { slideIndex: idx },
        });
        return;
      }
      if (slide.media_url_ar && VIDEO_FILE.test(slide.media_url_ar)) {
        entries.push({
          ...base,
          id: `brand-${brand.id}-slide-${idx}-ar`,
          sourceType: "hero_slide",
          title: `${isAr ? "شريحة واجهة (عربي)" : "Hero Slide (AR)"} #${idx + 1}`,
          videoUrl: slide.media_url_ar,
          posterUrl: slide.media_poster_url_ar,
          meta: { slideIndex: idx, slideLang: "ar" },
        });
      }
      if (slide.media_url_en && VIDEO_FILE.test(slide.media_url_en)) {
        entries.push({
          ...base,
          id: `brand-${brand.id}-slide-${idx}-en`,
          sourceType: "hero_slide",
          title: `${isAr ? "شريحة واجهة (إنجليزي)" : "Hero Slide (EN)"} #${idx + 1}`,
          videoUrl: slide.media_url_en,
          posterUrl: slide.media_poster_url_en,
          meta: { slideIndex: idx, slideLang: "en" },
        });
      }
    });
  }

  const brandsById = new Map(sources.brands.map((brand) => [brand.id, brand]));
  for (const product of sources.products) {
    if (!Array.isArray(product.media)) continue;
    const brand = brandsById.get(product.brand_id);
    (product.media as ProductMediaItem[]).forEach((item, mIdx) => {
      if (item?.type !== "video" || !item.url) return;
      entries.push({
        id: `prod-${product.id}-media-${mIdx}`,
        brandId: product.brand_id,
        brandName: brand ? brandName(brand) : "Unknown Brand",
        brandSlug: brand?.slug || "",
        sourceType: "product",
        title: `${isAr ? "منتج:" : "Product:"} ${product.name_ar || product.name_en || product.name || "Untitled"} (#${mIdx + 1})`,
        videoUrl: item.url,
        posterUrl: item.poster_url,
        meta: { productId: product.id, mediaIndex: mIdx },
      });
    });
  }
  return entries;
}

// ── Replacing a video with its optimized copy ───────────────────────────────

export type OptimizedVideo = { videoUrl: string; posterUrl: string | null };

/**
 * The hero with the entry's video swapped for the optimized one; null when the
 * slide no longer exists (nothing to write).
 */
export function heroWithOptimizedVideo(
  hero: HeroMedia,
  entry: Pick<VideoEntry, "sourceType" | "meta">,
  video: OptimizedVideo,
): HeroMedia | null {
  const poster = video.posterUrl;
  if (entry.sourceType === "hero_background") {
    return {
      ...hero,
      background: { type: "video", url: video.videoUrl, ...(poster ? { posterUrl: poster } : {}) },
    };
  }
  const idx = entry.meta.slideIndex;
  const slides = Array.isArray(hero.slides) ? [...hero.slides] : [];
  if (idx === undefined || !slides[idx]) return null;
  const lang = entry.meta.slideLang;
  slides[idx] = {
    ...slides[idx],
    media_url: video.videoUrl,
    ...(lang ? { [`media_url_${lang}`]: video.videoUrl } : {}),
    ...(poster
      ? {
          media_poster_url: poster,
          ...(lang ? { [`media_poster_url_${lang}`]: poster } : {}),
        }
      : {}),
  };
  return { ...hero, slides };
}

/** Swaps a brand hero video (background or slide) for its optimized copy. */
export async function replaceHeroVideo(entry: VideoEntry, video: OptimizedVideo) {
  const { data, error } = await supabase
    .from("brands")
    .select("hero_media")
    .eq("id", entry.brandId)
    .single();
  if (error) throw error;
  const next = heroWithOptimizedVideo(asHero(data.hero_media) ?? {}, entry, video);
  if (!next) return;
  await updateBrand(entry.brandId, { hero_media: next as unknown as Json });
}

/** Swaps a product video for its optimized copy (within the product's brand). */
export async function replaceProductVideo(entry: VideoEntry, video: OptimizedVideo) {
  const productId = entry.meta.productId;
  const mIdx = entry.meta.mediaIndex;
  if (!productId || mIdx === undefined) return;
  const { data, error } = await supabase
    .from("products")
    .select("media")
    .eq("id", productId)
    .eq("brand_id", entry.brandId)
    .single();
  if (error) throw error;
  const media = Array.isArray(data.media) ? [...(data.media as ProductMediaItem[])] : [];
  if (!media[mIdx]) return;
  media[mIdx] = {
    ...media[mIdx],
    url: video.videoUrl,
    ...(video.posterUrl ? { poster_url: video.posterUrl } : {}),
  };
  await updateProduct(entry.brandId, productId, { media: media as unknown as Json });
}
