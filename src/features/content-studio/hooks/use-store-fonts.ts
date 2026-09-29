import { useEffect, useMemo, useState } from "react";
import {
  getGoogleFontsUrl,
  resolveStorefrontTypography,
  type StorefrontFontSettings,
} from "@/lib/typography";

type Families = { en: string; ar: string };

/** The family name a store's uploaded display font is registered under in the studio. */
const customFamily = (lang: "en" | "ar") => `BoutqStudioDisplay${lang === "ar" ? "Ar" : "En"}`;

/**
 * The store's headline fonts, as its storefront shows them (the same
 * resolver), for the templates to use instead of the studio's: loaded on
 * demand (self-hosted faces are already in the app; Google faces through
 * their stylesheet; an uploaded font through @font-face) and handed over
 * only once the browser has them, so a frame never draws in a fallback.
 */
export function useStoreFonts(
  settings: StorefrontFontSettings | null | undefined,
  wanted: boolean,
) {
  const typography = useMemo(() => resolveStorefrontTypography(settings), [settings]);
  const families = useMemo<Families>(
    () => ({
      en: typography.display.en.url ? customFamily("en") : typography.display.en.family,
      ar: typography.display.ar.url ? customFamily("ar") : typography.display.ar.family,
    }),
    [typography],
  );
  // What the merchant sees in the switch: the fonts' own names.
  const label = `${typography.display.ar.family} · ${typography.display.en.family}`;
  const [loaded, setLoaded] = useState<string | null>(null);
  const key = `${families.en}|${families.ar}`;

  useEffect(() => {
    if (!wanted || typeof document === "undefined" || !document.fonts) return;
    let alive = true;
    const google = getGoogleFontsUrl({ ...typography, body: typography.display });
    if (google && !document.querySelector(`link[data-studio-fonts="${google}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = google;
      link.dataset.studioFonts = google;
      document.head.appendChild(link);
    }
    for (const lang of ["en", "ar"] as const) {
      const url = typography.display[lang].url;
      if (!url || document.querySelector(`style[data-studio-font="${customFamily(lang)}"]`)) {
        continue;
      }
      const style = document.createElement("style");
      style.dataset.studioFont = customFamily(lang);
      style.textContent = `@font-face{font-family:'${customFamily(lang)}';src:url('${url.replace(/["'()\\]/g, "")}');font-weight:100 900;font-display:swap;}`;
      document.head.appendChild(style);
    }
    void Promise.all(
      (["en", "ar"] as const).map((lang) =>
        document.fonts.load(`600 64px "${families[lang]}"`).catch(() => []),
      ),
    ).then(() => {
      if (alive) setLoaded(key);
    });
    return () => {
      alive = false;
    };
  }, [wanted, typography, families, key]);

  return {
    storeFontsLabel: label,
    /** The families to draw with, once loaded; null while loading or when not wanted. */
    storeFamilies: wanted && loaded === key ? families : null,
  };
}
