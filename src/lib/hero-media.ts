import { useSyncExternalStore } from "react";
import { isLikelyImageUrl } from "@/lib/media-delivery";
import { isValidAspect } from "@/lib/media-aspect";

/**
 * Single source of truth for which file, poster and aspect a hero slide shows,
 * and for the frame the storefront puts it in. HeroV2 renders with it and the
 * admin preview simulates with it, so the two can never disagree.
 */

export type HeroLang = "ar" | "en";

/** Structural subset shared by the storefront slide and the admin slide types. */
export type HeroSlideMediaFields = {
  type?: "text" | "image" | "video" | string;
  media_url?: string;
  media_url_en?: string;
  media_url_ar?: string;
  media_poster_url?: string;
  media_poster_url_en?: string;
  media_poster_url_ar?: string;
  media_aspect?: number;
  media_aspect_en?: number;
  media_aspect_ar?: number;
  media_url_mobile_en?: string;
  media_url_mobile_ar?: string;
  media_poster_url_mobile_en?: string;
  media_poster_url_mobile_ar?: string;
  media_aspect_mobile_en?: number;
  media_aspect_mobile_ar?: number;
  focal_x?: number;
  focal_y?: number;
};

export type HeroBackgroundInput =
  | {
      type?: string;
      url?: string;
      posterUrl?: string;
      aspect?: number;
      mobileUrl?: string;
      mobilePosterUrl?: string;
      mobileAspect?: number;
    }
  | string
  | null
  | undefined;

export type HeroMediaVariant = {
  url: string;
  /** A still image for the variant: its poster, or the image itself. */
  posterUrl: string | null;
  /** Recorded at upload; null for legacy media until measured. */
  aspect: number | null;
};

export type ResolvedHeroMedia = {
  main: HeroMediaVariant | null;
  /** Phone-specific cut, shown below the mobile breakpoint instead of `main`. */
  mobile: HeroMediaVariant | null;
  isVideo: boolean;
  /** True when the slide has no media of its own and shows the hero background. */
  usesBackground: boolean;
};

const VIDEO_URL = /\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i;

function clean(value: string | undefined | null): string {
  return value?.trim() || "";
}

function still(poster: string | undefined | null, url: string): string | null {
  const candidate = clean(poster);
  if (candidate && isLikelyImageUrl(candidate)) return candidate;
  return isLikelyImageUrl(url) ? url : null;
}

function aspectOrNull(value: unknown): number | null {
  return isValidAspect(value) ? value : null;
}

export function resolveHeroSlideMedia(
  slide: HeroSlideMediaFields,
  lang: HeroLang,
  background?: HeroBackgroundInput,
): ResolvedHeroMedia {
  const own = lang;
  const other: HeroLang = lang === "ar" ? "en" : "ar";
  const urlFor = (l: HeroLang) => clean(l === "ar" ? slide.media_url_ar : slide.media_url_en);
  const aspectFor = (l: HeroLang) => (l === "ar" ? slide.media_aspect_ar : slide.media_aspect_en);
  const posterFor = (l: HeroLang) =>
    l === "ar" ? slide.media_poster_url_ar : slide.media_poster_url_en;

  // Same precedence as before: this language, then the shared URL, then the other language.
  const candidates: Array<{ url: string; aspect: unknown; lang: HeroLang }> = [
    { url: urlFor(own), aspect: aspectFor(own), lang: own },
    { url: clean(slide.media_url), aspect: slide.media_aspect, lang: own },
    { url: urlFor(other), aspect: aspectFor(other), lang: other },
  ];
  const hit = candidates.find((c) => c.url);

  if (hit) {
    const mediaLang = hit.lang;
    const aspect = aspectOrNull(
      candidates.find((c) => c.url === hit.url && isValidAspect(c.aspect))?.aspect,
    );
    const poster =
      clean(posterFor(mediaLang)) ||
      clean(slide.media_poster_url) ||
      clean(posterFor(mediaLang === own ? other : own));
    const isVideo =
      slide.type === "video" ||
      VIDEO_URL.test(hit.url) ||
      hit.url.includes("cloudflarestream") ||
      hit.url.includes("/stream/");

    const mobileUrl = clean(
      mediaLang === "ar" ? slide.media_url_mobile_ar : slide.media_url_mobile_en,
    );
    const mobile: HeroMediaVariant | null = mobileUrl
      ? {
          url: mobileUrl,
          posterUrl: still(
            mediaLang === "ar"
              ? slide.media_poster_url_mobile_ar
              : slide.media_poster_url_mobile_en,
            mobileUrl,
          ),
          aspect: aspectOrNull(
            mediaLang === "ar" ? slide.media_aspect_mobile_ar : slide.media_aspect_mobile_en,
          ),
        }
      : null;

    return {
      main: { url: hit.url, posterUrl: still(poster, hit.url), aspect },
      mobile,
      isVideo,
      usesBackground: false,
    };
  }

  const bg = typeof background === "string" ? { url: background } : background;
  const bgUrl = clean(bg?.url);
  if (!bg || !bgUrl) return { main: null, mobile: null, isVideo: false, usesBackground: false };

  const bgMobileUrl = clean(bg.mobileUrl);
  return {
    main: {
      url: bgUrl,
      posterUrl: still(bg.posterUrl, bgUrl),
      aspect: aspectOrNull(bg.aspect),
    },
    mobile: bgMobileUrl
      ? {
          url: bgMobileUrl,
          posterUrl: still(bg.mobilePosterUrl, bgMobileUrl),
          aspect: aspectOrNull(bg.mobileAspect),
        }
      : null,
    isVideo:
      bg.type === "video" ||
      VIDEO_URL.test(bgUrl) ||
      bgUrl.includes("cloudflarestream") ||
      bgUrl.includes("/stream/"),
    usesBackground: true,
  };
}

/** `object-position` for cropped media; defaults to centre, or top for the top-aligned mode. */
export function heroFocalPosition(slide: HeroSlideMediaFields, fitSetting?: string | null): string {
  const clamp = (value: unknown, fallback: number) =>
    typeof value === "number" && Number.isFinite(value)
      ? Math.min(100, Math.max(0, value))
      : fallback;
  const x = clamp(slide.focal_x, 50);
  const y = clamp(slide.focal_y, fitSetting === "top" ? 0 : 50);
  return `${x}% ${y}%`;
}

export function hasCustomFocal(slide: HeroSlideMediaFields): boolean {
  return typeof slide.focal_x === "number" || typeof slide.focal_y === "number";
}

/* ------------------------------------------------------------------------- */
/* Frame model. HeroV2's Tailwind classes encode these same numbers.         */
/* ------------------------------------------------------------------------- */

export const HERO_MOBILE_QUERY = "(max-width: 639px)";

export const HERO_SMART_FRAME = {
  mobile: { minPx: 180, maxVh: 0.78, maxPx: 680 },
  desktop: {
    minPx: 320,
    max: {
      compact: { vh: 0.7, px: 480 },
      standard: { vh: 0.8, px: 680 },
      cinematic: { vh: 0.88, px: 860 },
    },
  },
} as const;

export const HERO_FILL_MOBILE = {
  portrait_4_5: { ratio: 4 / 5, minPx: 420 },
  story_9_16: { ratio: 9 / 16, minPx: 520 },
  square_1_1: { ratio: 1, minPx: 340 },
  landscape_4_3: { ratio: 4 / 3, minPx: 260 },
} as const;

export const HERO_FILL_DESKTOP_PX = { compact: 420, standard: 520, cinematic: 620 } as const;

/**
 * The hero frame's size classes. Smart Fit follows the media's own shape (CSS
 * variables set by HeroV2) within the HERO_SMART_FRAME limits; Fill uses the
 * merchant's phone ratio and desktop height (HERO_FILL_MOBILE /
 * HERO_FILL_DESKTOP_PX). The classes are written out in full so Tailwind
 * generates them; tests check they match the model's numbers.
 */
export function heroFrameSizingClass(args: {
  smartFit: boolean;
  mobileRatio?: string | null;
  desktopHeight?: string | null;
}) {
  const desktop = args.desktopHeight ?? "standard";
  if (args.smartFit) {
    const desktopMax =
      desktop === "compact"
        ? "sm:max-h-[min(70svh,480px)]"
        : desktop === "cinematic"
          ? "sm:max-h-[min(88svh,860px)]"
          : "sm:max-h-[min(80svh,680px)]";
    return `aspect-[var(--hero-ar-m)] sm:aspect-[var(--hero-ar)] min-h-[180px] max-h-[min(78svh,680px)] sm:min-h-[320px] ${desktopMax}`;
  }
  const mobile = args.mobileRatio ?? "portrait_4_5";
  const mobileClass =
    mobile === "story_9_16"
      ? "aspect-[9/16] min-h-[520px]"
      : mobile === "square_1_1"
        ? "aspect-square min-h-[340px]"
        : mobile === "landscape_4_3"
          ? "aspect-[4/3] min-h-[260px]"
          : "aspect-[4/5] min-h-[420px]";
  const desktopClass =
    desktop === "compact"
      ? "sm:aspect-auto sm:h-[420px] sm:min-h-[420px]"
      : desktop === "cinematic"
        ? "sm:aspect-auto sm:h-[620px] sm:min-h-[620px]"
        : "sm:aspect-auto sm:h-[520px] sm:min-h-[520px]";
  return `${mobileClass} ${desktopClass}`;
}

export const HERO_PREVIEW_VIEWPORTS = {
  mobile: { w: 390, h: 844 },
  desktop: { w: 1440, h: 900 },
} as const;

export type HeroDevice = "mobile" | "desktop";

type DesktopHeightKey = keyof typeof HERO_FILL_DESKTOP_PX;
type MobileRatioKey = keyof typeof HERO_FILL_MOBILE;

function desktopKey(value?: string | null): DesktopHeightKey {
  return value === "compact" || value === "cinematic" ? value : "standard";
}

function mobileKey(value?: string | null): MobileRatioKey {
  return value && value in HERO_FILL_MOBILE ? (value as MobileRatioKey) : "portrait_4_5";
}

export function isSmartFitSetting(fitSetting?: string | null): boolean {
  return fitSetting !== "cover" && fitSetting !== "top";
}

/** Width / height of the full-bleed hero frame on a given device. */
export function heroFrameAspect(options: {
  device: HeroDevice;
  fitSetting?: string | null;
  leadAspect: number | null;
  mobileRatio?: string | null;
  desktopHeight?: string | null;
  viewport?: { w: number; h: number };
}): number {
  const { device, fitSetting, leadAspect, mobileRatio, desktopHeight } = options;
  const viewport = options.viewport ?? HERO_PREVIEW_VIEWPORTS[device];

  if (isSmartFitSetting(fitSetting) && isValidAspect(leadAspect)) {
    const limits =
      device === "mobile"
        ? {
            min: HERO_SMART_FRAME.mobile.minPx,
            max: Math.min(
              HERO_SMART_FRAME.mobile.maxVh * viewport.h,
              HERO_SMART_FRAME.mobile.maxPx,
            ),
          }
        : {
            min: HERO_SMART_FRAME.desktop.minPx,
            max: Math.min(
              HERO_SMART_FRAME.desktop.max[desktopKey(desktopHeight)].vh * viewport.h,
              HERO_SMART_FRAME.desktop.max[desktopKey(desktopHeight)].px,
            ),
          };
    // CSS resolves min-height over max-height when they conflict.
    const height = Math.max(limits.min, Math.min(viewport.w / leadAspect, limits.max));
    return viewport.w / height;
  }

  if (device === "mobile") {
    const fill = HERO_FILL_MOBILE[mobileKey(mobileRatio)];
    return viewport.w / Math.max(viewport.w / fill.ratio, fill.minPx);
  }
  return viewport.w / HERO_FILL_DESKTOP_PX[desktopKey(desktopHeight)];
}

function subscribeMobile(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const query = window.matchMedia(HERO_MOBILE_QUERY);
  query.addEventListener?.("change", onChange);
  return () => query.removeEventListener?.("change", onChange);
}

/**
 * Whether the phone cut of hero media applies. Server-renders as desktop; the
 * mobile poster is still correct before hydration because images use <picture>.
 */
export function useIsHeroMobile(): boolean {
  return useSyncExternalStore(
    subscribeMobile,
    () =>
      (typeof window !== "undefined" && window.matchMedia?.(HERO_MOBILE_QUERY).matches) || false,
    () => false,
  );
}
