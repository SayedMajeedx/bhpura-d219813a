import { Link } from "@tanstack/react-router";
import React, { useState } from "react";
import { AddonSlot } from "@/components/addons/AddonSlot";
import { useStorefront, useStoreModules } from "@/lib/storefront-context";
import { renderTrustBadgeIcon, resolveStorefrontTrustBadges } from "@/lib/trust-badges";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
import { FooterV2 } from "@/components/storefront/FooterV2";
import { normalizeVertical } from "@/lib/store-profile";
import { resolveFooterVariant } from "@/lib/storefront-engine";
import { footerGroupTitles, footerPageGroups } from "@/features/storefront-shell/lib/footer-pages";
import { StorefrontSocialIcon } from "./StorefrontSocialIcon";

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

  const { company: companyTitle, help: helpTitle } = footerGroupTitles(settings, isAr);

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
