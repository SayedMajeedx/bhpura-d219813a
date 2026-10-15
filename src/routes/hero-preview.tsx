import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { HeroV2View } from "@/components/storefront/HeroV2";
import { publicSettingsFromPageData } from "@/features/storefront-shell/lib/public-settings";
import { shellTheme } from "@/features/storefront-shell/lib/shell-theme";
import { getGoogleFontsUrl } from "@/lib/typography";
import {
  HERO_PREVIEW_HEIGHT,
  HERO_PREVIEW_READY,
  fromParent,
  readHeroPreviewDraft,
  type HeroPreviewDraft,
} from "@/lib/hero-preview";
import type { Brand, HeroContentSlide } from "@/lib/storefront-context";
import type { HeroBackgroundInput } from "@/lib/hero-media";

/**
 * The hero settings' live preview, drawn in a frame of the settings page: the storefront's own
 * hero (HeroV2View), with the store's settings and font, from the draft the page sends. It fetches
 * nothing and listens only to the page that holds it; it is never indexed.
 */
export const Route = createFileRoute("/hero-preview")({
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  component: HeroPreviewPage,
});

function HeroPreviewPage() {
  const [draft, setDraft] = React.useState<HeroPreviewDraft | null>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!fromParent(event, { origin: window.location.origin, parent: window.parent })) return;
      const next = readHeroPreviewDraft(event.data);
      if (next) setDraft(next);
    };
    window.addEventListener("message", onMessage);
    window.parent?.postMessage({ type: HERO_PREVIEW_READY }, window.location.origin);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // The page sizes the frame to the hero.
  React.useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      window.parent?.postMessage(
        { type: HERO_PREVIEW_HEIGHT, height: Math.ceil(el.getBoundingClientRect().height) },
        window.location.origin,
      );
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const view = React.useMemo(() => {
    if (!draft) return null;
    const brand = {
      ...draft.brand,
      logo_url: null,
      about_ar: null,
      about_en: null,
      meta_title: null,
      meta_description: null,
      hero_media: { background: draft.background, slides: draft.slides },
    } as unknown as Brand;
    const settings = publicSettingsFromPageData(brand, {
      settings: draft.settings,
      benefitSettings: [],
      trackingSettings: {},
    } as unknown as Parameters<typeof publicSettingsFromPageData>[1]);
    const theme = shellTheme({ brand, settings, lang: draft.lang });
    return { brand, settings, theme, fonts: getGoogleFontsUrl(settings.storefront_typography) };
  }, [draft]);

  return (
    <div ref={rootRef} dir={draft?.lang === "en" ? "ltr" : "rtl"} style={view?.theme.style}>
      {view?.fonts && <link rel="stylesheet" href={view.fonts} />}
      {view?.theme.typographyFaces && <style>{view.theme.typographyFaces}</style>}
      {draft && view && (
        <HeroV2View
          key={draft.replay}
          slides={draft.slides as unknown as HeroContentSlide[]}
          background={draft.background as unknown as HeroBackgroundInput}
          settings={view.settings}
          lang={draft.lang}
          brand={view.brand}
        />
      )}
    </div>
  );
}
