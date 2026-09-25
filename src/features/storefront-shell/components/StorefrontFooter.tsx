import { Link } from "@tanstack/react-router";
import React, { useState } from "react";
import { AddonSlot } from "@/components/addons/AddonSlot";
import { useStorefront, useStoreModules } from "@/lib/storefront-context";
import { renderTrustBadgeIcon, resolveStorefrontTrustBadges } from "@/lib/trust-badges";
import { Button } from "@/components/ui/button";
import { ChevronDown, Sparkles } from "lucide-react";
import { FooterV2 } from "@/components/storefront/FooterV2";
import { normalizeVertical } from "@/lib/store-profile";
import { resolveFooterVariant } from "@/lib/storefront-engine";
import { footerPageGroups } from "@/features/storefront-shell/lib/footer-pages";

/** The icon for a social link, by platform name. */
export function StorefrontSocialIcon({ platform }: { platform: string }) {
  const name = platform.toLowerCase();
  if (name.includes("instagram")) {
    return (
      <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 2.156 4.919 5.406.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-2.199-4.919-5.409-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
      </svg>
    );
  }
  if (name.includes("whatsapp")) {
    return (
      <svg className="h-5 w-5 fill-current text-emerald-400" viewBox="0 0 24 24">
        <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.396-.883-.726-1.48-1.623-1.653-1.92-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
      </svg>
    );
  }
  if (name.includes("facebook")) {
    return (
      <svg className="h-5 w-5 fill-current text-blue-500" viewBox="0 0 24 24">
        <path d="M9 8H6v4h3v12h5V12h3.642L18 8h-4V6.333C14 5.374 14.5 5 15.5 5H18V0h-3.808C10.592 0 9 1.812 9 4.885V8z" />
      </svg>
    );
  }
  if (name.includes("tiktok")) {
    return (
      <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24">
        <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.82.56-1.36 1.53-1.37 2.53-.02 1.05.51 2.07 1.38 2.62.87.56 2.01.62 2.96.22 1.04-.42 1.77-1.42 1.83-2.54.04-3.69.01-7.38.02-11.07z" />
      </svg>
    );
  }
  if (name.includes("snapchat")) {
    return (
      <svg className="h-5 w-5 fill-current text-yellow-400" viewBox="0 0 24 24">
        <path d="M12 2.163c-3.12 0-5.717 2.022-6.297 4.908-.182.906-.118 1.884-.118 2.802 0 .428.029.98-.293 1.341-.351.396-1.026.541-1.503.784-.428.218-.838.583-.758 1.112.083.551.629.782 1.109.967 1.042.403 2.12.637 2.71 1.674.322.568.17 1.258.077 1.862-.128.835-.615 1.542-1.332 2.017-.502.333-1.109.529-1.636.837-.361.21-.762.535-.668 1.002.091.503.626.657 1.077.747 2.193.438 4.5.385 6.702.385 2.202 0 4.51.053 6.703-.385.451-.09.986-.244 1.076-.747.095-.467-.306-.792-.667-1.002-.527-.308-1.134-.504-1.637-.837-.717-.475-1.203-1.182-1.331-2.017-.093-.604-.245-1.294.077-1.862.59-1.037 1.668-1.271 2.71-1.674.48-.185 1.026-.416 1.109-.967.08-.529-.33-.894-.758-1.112-.477-.243-1.152-.388-1.503-.784-.322-.361-.293-.913-.293-1.341 0-.918.064-1.896-.118-2.802C17.717 4.185 15.12 2.163 12 2.163z" />
      </svg>
    );
  }
  if (name.includes("x") || name.includes("twitter")) {
    return (
      <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    );
  }
  return <Sparkles className="h-5 w-5" />;
}

/** The storefront footer: the columns footer (FooterV2), or the classic one with pages, socials and trust badges. */
export function StorefrontFooter() {
  const { brand, settings, lang, t } = useStorefront();
  // Hooks must run unconditionally; the v2 footer branch is decided after them.
  const storeModules = useStoreModules();
  const showSizeGuideFooterLink = Boolean(storeModules?.size_guide);
  const isAr = lang === "ar";
  const [openCompany, setOpenCompany] = useState(false);
  const [openHelp, setOpenHelp] = useState(false);

  // Single source of truth, shared with the settings UI so the two can never
  // disagree about which footer a brand is actually getting.
  if (resolveFooterVariant(settings) === "columns") {
    return <FooterV2 />;
  }

  const rawTrustBadges = settings.trust_badges;
  const storeVertical = normalizeVertical(
    settings.store_vertical ?? (brand as any)?.store_vertical ?? "general",
  );
  const activeBadges = resolveStorefrontTrustBadges({
    config: rawTrustBadges,
    vertical: storeVertical,
    settings,
    brandName: isAr ? brand?.name_ar : brand?.name_en,
  });

  const { pageLinks, companyPages, helpPages } = footerPageGroups(settings.pages ?? [], isAr);
  const socials = settings.socials ?? [];

  const companyTitle = isAr
    ? settings.footer_company_title_ar?.trim() || "الشركة"
    : settings.footer_company_title_en?.trim() || "Company";

  const helpTitle = isAr
    ? settings.footer_help_title_ar?.trim() || "المساعدة"
    : settings.footer_help_title_en?.trim() || "Help";

  const footerLogoSize = Math.max(16, Math.min(120, Number(settings.footer_logo_size ?? 28)));

  return (
    <footer
      className="border-t py-5 sm:py-6"
      style={{
        borderColor: "rgba(255,255,255,0.12)",
        backgroundColor: "var(--sf-footer-bg)",
        color: "var(--sf-footer-fg)",
      }}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        {/* =========================================================================
            DESKTOP FOOTER (md:flex) — Unchanged Layout
            ========================================================================= */}
        <div className="hidden md:flex flex-col items-center gap-3 text-center text-xs">
          {settings.logo_url && (
            <div className="pb-1">
              <img
                src={settings.logo_url}
                alt={brand.name_en || "Logo"}
                width={footerLogoSize * 3}
                height={footerLogoSize}
                loading="lazy"
                decoding="async"
                style={{ height: `${footerLogoSize}px`, width: "auto" }}
                className="object-contain"
              />
            </div>
          )}
          {(pageLinks.length > 0 || showSizeGuideFooterLink) && (
            <nav className="flex flex-wrap justify-center items-center gap-x-5 gap-y-1 text-xs font-medium tracking-wide">
              {pageLinks.map((p) => (
                <Link
                  key={p.idx}
                  to="/$slug/$category"
                  params={{ slug: brand.slug, category: p.slug }}
                  className="inline-flex min-h-11 items-center py-0.5 hover:opacity-100 opacity-85 transition-opacity sm:min-h-0"
                  style={{ color: "var(--sf-footer-fg)" }}
                >
                  {p.title}
                </Link>
              ))}
              <AddonSlot
                placement="storefront.footer.helpLink"
                props={{
                  className:
                    "inline-flex min-h-11 items-center py-0.5 hover:opacity-100 opacity-85 transition-opacity sm:min-h-0",
                  style: { color: "var(--sf-footer-fg)" },
                }}
              />
            </nav>
          )}

          {socials.length > 0 && (
            <nav className="flex flex-wrap justify-center items-center gap-x-4 gap-y-1 text-xs opacity-75 uppercase tracking-widest">
              {socials.map((s, i) => (
                <a
                  key={`${s.name}-${i}`}
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center py-0.5 hover:opacity-100 transition-opacity sm:min-h-0"
                  style={{ color: "var(--sf-footer-fg)" }}
                >
                  {s.name}
                </a>
              ))}
            </nav>
          )}

          {/* Custom Boutique Trust & Security Reassurance Bar */}
          {activeBadges.length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 my-2 py-2.5 px-4 text-xs font-medium opacity-90 border-y border-white/10 rounded-xl bg-white/5 backdrop-blur-xs max-w-3xl w-full">
              {activeBadges.map((badge, idx) => (
                <React.Fragment key={badge.id || idx}>
                  {idx > 0 && <div className="hidden sm:inline text-white/20">•</div>}
                  <div className="inline-flex items-center gap-1.5">
                    {renderTrustBadgeIcon(badge.icon, "h-3.5 w-3.5", badge.color)}
                    <span>
                      {isAr ? badge.text_ar || badge.text_en : badge.text_en || badge.text_ar}
                    </span>
                  </div>
                </React.Fragment>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs opacity-70 border-t border-border pt-2 w-full max-w-2xl">
            {settings.show_footer_name && (
              <span className="font-semibold" style={{ color: "var(--sf-footer-fg)" }}>
                {lang === "ar" ? brand.name_ar || brand.name_en : brand.name_en}
              </span>
            )}
            <span>
              © {new Date().getFullYear()} — {t("جميع الحقوق محفوظة", "All rights reserved")}
            </span>
            {settings.analytics_consent_required && (
              <Button
                type="button"
                variant="link"
                className="inline-flex min-h-11 items-center hover:opacity-100 py-0.5 sm:min-h-0 h-auto p-0 font-normal underline underline-offset-2"
                style={{ color: "var(--sf-footer-fg)" }}
                onClick={() => window.dispatchEvent(new Event("boutq:privacy-preferences"))}
              >
                {t("خيارات الخصوصية", "Privacy choices")}
              </Button>
            )}
          </div>
        </div>

        {/* =========================================================================
            MOBILE FOOTER (md:hidden) — Structured Accordions & Scannable Layout
            ========================================================================= */}
        <div className="block md:hidden space-y-4 text-center">
          {/* Section 1: Logo Header */}
          <div className="flex flex-col items-center pb-3 border-b border-white/10">
            {settings.logo_url ? (
              <img
                src={settings.logo_url}
                alt={brand.name_en || "Logo"}
                width={footerLogoSize * 3}
                height={footerLogoSize}
                loading="lazy"
                decoding="async"
                style={{ height: `${footerLogoSize}px`, width: "auto" }}
                className="object-contain"
              />
            ) : (
              <span
                className="font-heading text-base font-bold tracking-tight"
                style={{ color: "var(--sf-footer-fg)" }}
              >
                {lang === "ar" ? brand.name_ar || brand.name_en : brand.name_en}
              </span>
            )}
          </div>

          {/* Section 2: Accordion Link Groups */}
          <div className="space-y-1.5 border-b border-white/10 pb-3 text-start">
            {/* Group A: Company */}
            {companyPages.length > 0 && (
              <div className="border-b border-white/10 last:border-0">
                <button
                  type="button"
                  onClick={() => setOpenCompany(!openCompany)}
                  className="w-full min-h-[44px] flex items-center justify-between py-2.5 px-1 text-sm font-semibold tracking-wide"
                  style={{ color: "var(--sf-footer-fg)" }}
                  aria-expanded={openCompany}
                >
                  <span>{companyTitle}</span>
                  <ChevronDown
                    className={`h-4 w-4 transition-transform duration-200 ${
                      openCompany ? "rotate-180" : ""
                    }`}
                  />
                </button>
                <div
                  className={`grid transition-all duration-200 ease-in-out ${
                    openCompany ? "grid-rows-[1fr] opacity-100 mb-2" : "grid-rows-[0fr] opacity-0"
                  }`}
                >
                  <div className="overflow-hidden space-y-1 px-1">
                    {companyPages.map((p) => (
                      <Link
                        key={p.idx}
                        to="/$slug/$category"
                        params={{ slug: brand.slug, category: p.slug }}
                        className="flex min-h-[44px] items-center text-xs opacity-85 hover:opacity-100 py-1"
                        style={{ color: "var(--sf-footer-fg)" }}
                      >
                        {p.title}
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Group B: Help */}
            {(helpPages.length > 0 || showSizeGuideFooterLink) && (
              <div className="border-b border-white/10 last:border-0">
                <button
                  type="button"
                  onClick={() => setOpenHelp(!openHelp)}
                  className="w-full min-h-[44px] flex items-center justify-between py-2.5 px-1 text-sm font-semibold tracking-wide"
                  style={{ color: "var(--sf-footer-fg)" }}
                  aria-expanded={openHelp}
                >
                  <span>{helpTitle}</span>
                  <ChevronDown
                    className={`h-4 w-4 transition-transform duration-200 ${
                      openHelp ? "rotate-180" : ""
                    }`}
                  />
                </button>
                <div
                  className={`grid transition-all duration-200 ease-in-out ${
                    openHelp ? "grid-rows-[1fr] opacity-100 mb-2" : "grid-rows-[0fr] opacity-0"
                  }`}
                >
                  <div className="overflow-hidden space-y-1 px-1">
                    {helpPages.map((p) => (
                      <Link
                        key={p.idx}
                        to="/$slug/$category"
                        params={{ slug: brand.slug, category: p.slug }}
                        className="flex min-h-[44px] items-center text-xs opacity-85 hover:opacity-100 py-1"
                        style={{ color: "var(--sf-footer-fg)" }}
                      >
                        {p.title}
                      </Link>
                    ))}
                    <AddonSlot
                      placement="storefront.footer.helpLink"
                      props={{
                        className:
                          "flex min-h-[44px] items-center text-xs opacity-85 hover:opacity-100 py-1",
                        style: { color: "var(--sf-footer-fg)" },
                      }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Section 3: Social Icons Row */}
          {socials.length > 0 && (
            <div className="flex flex-wrap justify-center items-center gap-3 py-1">
              {socials.map((s, i) => (
                <a
                  key={`${s.name}-${i}`}
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.name}
                  className="h-11 w-11 rounded-full border border-white/15 bg-white/5 flex items-center justify-center hover:bg-white/15 transition-all active:scale-95"
                  style={{ color: "var(--sf-footer-fg)" }}
                >
                  <StorefrontSocialIcon platform={s.name} />
                </a>
              ))}
            </div>
          )}

          {/* Section 4: Trust Badges Grid */}
          {activeBadges.length > 0 && (
            <div className="grid grid-cols-2 gap-2 my-3 text-xs">
              {activeBadges.map((badge, idx) => (
                <div
                  key={badge.id || idx}
                  className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-xs p-3 flex flex-col items-center justify-center text-center gap-1.5 min-h-[72px]"
                >
                  {renderTrustBadgeIcon(badge.icon, "h-5 w-5", badge.color)}
                  <span className="font-medium text-xs leading-tight">
                    {isAr ? badge.text_ar || badge.text_en : badge.text_en || badge.text_ar}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Section 5: Bottom Bar */}
          <div className="pt-3 border-t border-white/10 flex flex-col items-center gap-1.5 text-xs opacity-75">
            {settings.show_footer_name && (
              <span className="font-semibold" style={{ color: "var(--sf-footer-fg)" }}>
                {lang === "ar" ? brand.name_ar || brand.name_en : brand.name_en}
              </span>
            )}
            <span>
              © {new Date().getFullYear()} — {t("جميع الحقوق محفوظة", "All rights reserved")}
            </span>
            {settings.analytics_consent_required && (
              <Button
                type="button"
                variant="link"
                className="inline-flex min-h-11 items-center hover:opacity-100 py-0.5 sm:min-h-0 h-auto p-0 font-normal underline underline-offset-2"
                style={{ color: "var(--sf-footer-fg)" }}
                onClick={() => window.dispatchEvent(new Event("boutq:privacy-preferences"))}
              >
                {t("خيارات الخصوصية", "Privacy choices")}
              </Button>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
}
