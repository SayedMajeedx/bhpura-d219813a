import * as React from "react";
import { Button } from "@/components/ui/button";
import { publicSettingsFromPageData } from "@/features/storefront-shell/lib/public-settings";
import { shellTheme } from "@/features/storefront-shell/lib/shell-theme";
import { getGoogleFontsUrl } from "@/lib/typography";
import type { Brand } from "@/lib/storefront-context";

/**
 * The store's look as it is being edited: its header, a heading and a line of text, a product's
 * title and price with its sale badge, its buttons and a link, in its own colours, corners and
 * fonts. Drawn with the storefront's own theme (`publicSettingsFromPageData`, `shellTheme`), so
 * what changes here is what changes there. A sample, not the page: the hero and the products are
 * the store's own on the storefront.
 */
export function LookSample({
  brand,
  settings,
  isAr,
}: {
  brand: {
    id?: string;
    slug?: string;
    name_en?: string | null;
    name_ar?: string | null;
    primary_color?: string | null;
  };
  settings: Record<string, unknown>;
  isAr: boolean;
}) {
  const [lang, setLang] = React.useState<"ar" | "en">(isAr ? "ar" : "en");
  const look = React.useMemo(() => {
    const storeBrand = { ...brand, hero_media: null } as unknown as Brand;
    const publicSettings = publicSettingsFromPageData(storeBrand, {
      settings,
      benefitSettings: [],
      trackingSettings: {},
    } as unknown as Parameters<typeof publicSettingsFromPageData>[1]);
    const theme = shellTheme({ brand: storeBrand, settings: publicSettings, lang });
    return { theme, fonts: getGoogleFontsUrl(publicSettings.storefront_typography) };
  }, [brand, settings, lang]);
  const name =
    (lang === "ar" ? brand.name_ar || brand.name_en : brand.name_en || brand.name_ar) || "";
  const t = (ar: string, en: string) => (lang === "ar" ? ar : en);

  return (
    <div className="min-w-0 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">
          {isAr ? "معاينة الألوان والخطوط" : "Colours and fonts, live"}
        </p>
        <div
          className="flex gap-1"
          role="group"
          aria-label={isAr ? "لغة المعاينة" : "Preview language"}
        >
          {(["ar", "en"] as const).map((code) => (
            <Button
              key={code}
              type="button"
              size="sm"
              variant={lang === code ? "default" : "outline"}
              aria-pressed={lang === code}
              onClick={() => setLang(code)}
              className="h-8 min-w-9 px-2 text-xs"
            >
              {code === "ar" ? "ع" : "EN"}
            </Button>
          ))}
        </div>
      </div>
      {look.fonts && <link rel="stylesheet" href={look.fonts} />}
      {look.theme.typographyFaces && <style>{look.theme.typographyFaces}</style>}
      <div
        dir={lang === "ar" ? "rtl" : "ltr"}
        data-testid="look-sample"
        // The storefront's own type rules (`.storefront-shell` in styles.css: the text font on
        // everything, the heading font on headings) apply inside, as on the store.
        className="storefront-shell overflow-hidden rounded-xl border border-border"
        style={look.theme.style}
      >
        <div
          className="flex items-center justify-between px-4 py-3 text-sm font-semibold"
          style={{ background: "var(--sf-header-bg)", color: "var(--sf-header-fg)" }}
        >
          <span>{name}</span>
          <span className="text-xs opacity-80">{t("السلة", "Cart")}</span>
        </div>
        <div className="space-y-4 p-4 sm:p-5">
          <div className="space-y-1">
            <h2 className="text-2xl" style={{ color: "var(--sf-heading)" }}>
              {t("مجموعة الصيف", "The summer edit")}
            </h2>
            <p className="text-sm">
              {t(
                "خامات ناعمة وتفاصيل مدروسة، صُنعت لتُلبس كل يوم.",
                "Soft fabrics and careful details, made to be worn every day.",
              )}{" "}
              <span style={{ color: "var(--sf-link)", textDecoration: "underline" }}>
                {t("اعرف المزيد", "Learn more")}
              </span>
            </p>
          </div>
          <div className="flex items-start gap-3">
            <div
              className="relative aspect-[3/4] w-24 shrink-0 bg-black/5"
              style={{ borderRadius: "var(--radius-sf)" }}
            >
              <span
                className="absolute start-1.5 top-1.5 px-1.5 py-0.5 text-xs font-semibold text-white"
                style={{ background: "var(--badge-accent-bg)", borderRadius: "var(--radius-sf)" }}
              >
                -20%
              </span>
            </div>
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-medium" style={{ color: "var(--sf-product-title)" }}>
                {t("عباية الكتان", "Linen abaya")}
              </p>
              <p className="text-sm font-semibold" style={{ color: "var(--sf-price)" }}>
                24.00
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <span
              className="inline-flex h-10 items-center px-4 text-sm font-semibold"
              style={{
                background: "var(--sf-btn-primary-bg)",
                color: "var(--sf-btn-primary-fg)",
                borderRadius: "var(--radius-sf)",
              }}
            >
              {t("أضف إلى السلة", "Add to cart")}
            </span>
            <span
              className="inline-flex h-10 items-center px-4 text-sm font-semibold"
              style={{
                background: "var(--sf-btn-secondary-bg)",
                color: "var(--sf-btn-secondary-fg)",
                borderRadius: "var(--radius-sf)",
              }}
            >
              {t("اشترِ الآن", "Buy now")}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
