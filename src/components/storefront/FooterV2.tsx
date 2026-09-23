import React, { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useStorefront, pickName } from "@/lib/storefront-context";
import { NewsletterForm } from "@/components/storefront/NewsletterForm";
import { TrustBar } from "@/components/storefront/TrustBar";
import {
  Instagram,
  Phone,
  Mail,
  MapPin,
  Clock,
  MessageCircle,
  ChevronDown,
  CreditCard,
  ShieldCheck,
} from "lucide-react";

export function FooterV2() {
  const { brand, settings, lang, t } = useStorefront();
  const isAr = lang === "ar";

  // Mobile accordion state
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    shop: false,
    help: false,
    contact: false,
  });

  const toggleSection = (key: string) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const footerLogoSize = Math.max(20, Math.min(120, Number(settings.footer_logo_size ?? 32)));
  const aboutText = isAr
    ? brand.about_ar || settings.footer_note
    : brand.about_en || settings.footer_note;
  const truncatedAbout = aboutText
    ? aboutText.length > 160
      ? `${aboutText.slice(0, 160)}...`
      : aboutText
    : null;

  // Socials
  const rawSocials = settings.socials;
  const socialsList: Array<{ name: string; url: string }> = Array.isArray(rawSocials)
    ? rawSocials
    : rawSocials && typeof rawSocials === "object"
      ? Object.entries(rawSocials).map(([name, url]) => ({ name, url: String(url) }))
      : [];

  // Navigation pages
  const pageLinks = (settings.pages || [])
    .filter((p: any) => p && (p.title_ar || p.title_en))
    .map((p: any, idx: number) => ({
      idx: idx + 1,
      slug: p.slug || `page-${idx + 1}`,
      title: isAr ? p.title_ar || p.title_en : p.title_en || p.title_ar,
    }));

  const showTrustBarAboveFooter =
    settings.trust_bar_enabled &&
    (settings.trust_bar_position === "above_footer" || settings.trust_bar_position === "both");

  return (
    <footer
      role="contentinfo"
      aria-label={isAr ? "تذييل الموقع" : "Website Footer"}
      className="border-t transition-colors duration-200"
      style={{
        borderColor: "rgba(255,255,255,0.12)",
        backgroundColor: "var(--sf-footer-bg)",
        color: "var(--sf-footer-fg)",
      }}
    >
      {/* Optional TrustBar above footer */}
      {showTrustBarAboveFooter && <TrustBar />}

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
        {/* =========================================================================
            DESKTOP 4-COLUMN GRID (hidden on mobile, lg:grid)
            ========================================================================= */}
        <div className="hidden lg:grid grid-cols-4 gap-8 xl:gap-12 text-start">
          {/* Column 1: Brand & About */}
          <div className="space-y-4">
            {settings.logo_url ? (
              <img
                src={settings.logo_url}
                alt={brand.name_en || "Brand Logo"}
                width={footerLogoSize * 3}
                height={footerLogoSize}
                loading="lazy"
                decoding="async"
                style={{ height: `${footerLogoSize}px`, width: "auto" }}
                className="object-contain"
              />
            ) : (
              <span
                className="text-lg font-bold font-display"
                style={{ color: "var(--sf-footer-fg)" }}
              >
                {isAr ? brand.name_ar || brand.name_en : brand.name_en}
              </span>
            )}

            {truncatedAbout && (
              <p
                className="text-xs leading-relaxed opacity-80"
                style={{ color: "var(--sf-footer-fg)" }}
              >
                {truncatedAbout}
              </p>
            )}

            {/* Social Channels */}
            {socialsList.length > 0 && (
              <div className="flex items-center gap-2 pt-1 flex-wrap">
                {socialsList.map((s, i) => (
                  <a
                    key={`${s.name}-${i}`}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={s.name}
                    className="h-8 w-8 rounded-full border border-white/15 bg-white/5 flex items-center justify-center hover:bg-white/15 transition-all text-xs opacity-80 hover:opacity-100"
                    style={{ color: "var(--sf-footer-fg)" }}
                  >
                    {s.name.toLowerCase().includes("insta") ? (
                      <Instagram className="h-3.5 w-3.5" />
                    ) : (
                      <span>{s.name.charAt(0).toUpperCase()}</span>
                    )}
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Column 2: Shop Navigation */}
          <div className="space-y-3">
            <h4
              className="text-xs font-semibold uppercase tracking-wider opacity-90 border-b border-white/10 pb-2"
              style={{ color: "var(--sf-footer-fg)" }}
            >
              {t("تسوّق", "Shop")}
            </h4>
            <nav className="flex flex-col space-y-2 text-xs">
              <Link
                to="/$slug"
                params={{ slug: brand.slug }}
                className="opacity-75 hover:opacity-100 hover:translate-x-0.5 transition-all w-fit"
                style={{ color: "var(--sf-footer-fg)" }}
              >
                {t("الرئيسية", "Home")}
              </Link>
              <Link
                to="/$slug/$category"
                params={{ slug: brand.slug, category: "all" }}
                className="opacity-75 hover:opacity-100 hover:translate-x-0.5 transition-all w-fit"
                style={{ color: "var(--sf-footer-fg)" }}
              >
                {t("كل المنتجات", "All Products")}
              </Link>
              <Link
                to="/$slug/$category"
                params={{ slug: brand.slug, category: "new" }}
                className="opacity-75 hover:opacity-100 hover:translate-x-0.5 transition-all w-fit"
                style={{ color: "var(--sf-footer-fg)" }}
              >
                {t("وصل حديثاً", "New Arrivals")}
              </Link>
              <Link
                to="/$slug/$category"
                params={{ slug: brand.slug, category: "sale" }}
                className="opacity-75 hover:opacity-100 hover:translate-x-0.5 transition-all w-fit text-destructive font-medium"
              >
                {t("التخفيضات", "Sale")}
              </Link>
              {(brand as any)?.modules?.made_to_order && (
                <Link
                  to={"/$slug/custom-order" as any}
                  params={{ slug: brand.slug } as any}
                  className="opacity-75 hover:opacity-100 hover:translate-x-0.5 transition-all w-fit"
                  style={{ color: "var(--sf-footer-fg)" }}
                >
                  {t("طلب مخصص", "Custom Order")}
                </Link>
              )}
            </nav>
          </div>

          {/* Column 3: Customer Care & Pages */}
          <div className="space-y-3">
            <h4
              className="text-xs font-semibold uppercase tracking-wider opacity-90 border-b border-white/10 pb-2"
              style={{ color: "var(--sf-footer-fg)" }}
            >
              {t("المساعدة وخدمة العملاء", "Customer Care")}
            </h4>
            <nav className="flex flex-col space-y-2 text-xs">
              <Link
                to="/$slug/account"
                params={{ slug: brand.slug }}
                className="opacity-75 hover:opacity-100 hover:translate-x-0.5 transition-all w-fit"
                style={{ color: "var(--sf-footer-fg)" }}
              >
                {t("تتبع الطلبات وحسابي", "Track Order & Account")}
              </Link>
              {pageLinks.map((p) => (
                <Link
                  key={p.idx}
                  to="/$slug/page/$idx"
                  params={{ slug: brand.slug, idx: String(p.idx) }}
                  className="opacity-75 hover:opacity-100 hover:translate-x-0.5 transition-all w-fit"
                  style={{ color: "var(--sf-footer-fg)" }}
                >
                  {p.title}
                </Link>
              ))}
            </nav>
          </div>

          {/* Column 4: Contact & Newsletter */}
          <div className="space-y-4">
            <h4
              className="text-xs font-semibold uppercase tracking-wider opacity-90 border-b border-white/10 pb-2"
              style={{ color: "var(--sf-footer-fg)" }}
            >
              {t("تواصلي معنا", "Stay Connected")}
            </h4>

            {settings.newsletter_enabled !== false && <NewsletterForm />}
          </div>
        </div>

        {/* =========================================================================
            MOBILE ACCORDIONS (lg:hidden)
            ========================================================================= */}
        <div className="block lg:hidden space-y-4 text-start">
          {/* Logo & About */}
          <div className="flex flex-col items-center text-center space-y-2 pb-3 border-b border-white/10">
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
                className="text-base font-bold font-display"
                style={{ color: "var(--sf-footer-fg)" }}
              >
                {isAr ? brand.name_ar || brand.name_en : brand.name_en}
              </span>
            )}
            {truncatedAbout && (
              <p
                className="text-xs leading-relaxed opacity-75 max-w-sm"
                style={{ color: "var(--sf-footer-fg)" }}
              >
                {truncatedAbout}
              </p>
            )}
          </div>

          {/* Accordion 1: Shop */}
          <div className="border-b border-white/10 pb-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => toggleSection("shop")}
              className="h-auto min-h-11 rounded-md w-full flex items-center justify-between py-2 text-xs font-semibold"
              style={{ color: "var(--sf-footer-fg)" }}
            >
              <span>{t("تسوّق", "Shop")}</span>
              <ChevronDown
                className={`h-4 w-4 transition-transform duration-200 ${
                  openSections.shop ? "rotate-180" : ""
                }`}
              />
            </Button>
            {openSections.shop && (
              <nav className="flex flex-col space-y-2 pt-1 pb-2 text-xs ps-2">
                <Link
                  to="/$slug/$category"
                  params={{ slug: brand.slug, category: "all" }}
                  className="opacity-75 hover:opacity-100 py-1 min-h-11 flex items-center"
                  style={{ color: "var(--sf-footer-fg)" }}
                >
                  {t("كل المنتجات", "All Products")}
                </Link>
                <Link
                  to="/$slug/$category"
                  params={{ slug: brand.slug, category: "new" }}
                  className="opacity-75 hover:opacity-100 py-1 min-h-11 flex items-center"
                  style={{ color: "var(--sf-footer-fg)" }}
                >
                  {t("وصل حديثاً", "New Arrivals")}
                </Link>
                <Link
                  to="/$slug/$category"
                  params={{ slug: brand.slug, category: "sale" }}
                  className="opacity-75 hover:opacity-100 py-1 text-destructive font-medium"
                >
                  {t("التخفيضات", "Sale")}
                </Link>
              </nav>
            )}
          </div>

          {/* Accordion 2: Help */}
          <div className="border-b border-white/10 pb-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => toggleSection("help")}
              className="h-auto min-h-11 rounded-md w-full flex items-center justify-between py-2 text-xs font-semibold"
              style={{ color: "var(--sf-footer-fg)" }}
            >
              <span>{t("المساعدة وخدمة العملاء", "Customer Care")}</span>
              <ChevronDown
                className={`h-4 w-4 transition-transform duration-200 ${
                  openSections.help ? "rotate-180" : ""
                }`}
              />
            </Button>
            {openSections.help && (
              <nav className="flex flex-col space-y-2 pt-1 pb-2 text-xs ps-2">
                <Link
                  to="/$slug/account"
                  params={{ slug: brand.slug }}
                  className="opacity-75 hover:opacity-100 py-1 min-h-11 flex items-center"
                  style={{ color: "var(--sf-footer-fg)" }}
                >
                  {t("تتبع الطلبات وحسابي", "Track Order & Account")}
                </Link>
                {pageLinks.map((p) => (
                  <Link
                    key={p.idx}
                    to="/$slug/page/$idx"
                    params={{ slug: brand.slug, idx: String(p.idx) }}
                    className="opacity-75 hover:opacity-100 py-1 min-h-11 flex items-center"
                    style={{ color: "var(--sf-footer-fg)" }}
                  >
                    {p.title}
                  </Link>
                ))}
              </nav>
            )}
          </div>

          {/* Newsletter on Mobile */}
          {settings.newsletter_enabled !== false && (
            <div className="pt-2">
              <NewsletterForm />
            </div>
          )}
        </div>

        {/* =========================================================================
            BOTTOM BAR: Payment Icons, Copyright & Powered by Boutq
            ========================================================================= */}
        <div className="mt-8 pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs opacity-75">
          {/* Payment Method Badges */}
          {settings.footer_show_payment_methods !== false && (
            <div
              className="flex items-center gap-2 flex-wrap justify-center sm:justify-start"
              aria-label={isAr ? "طرق الدفع المدعومة" : "Accepted payment methods"}
            >
              {settings.benefit_enabled && (
                <span className="px-2 py-0.5 rounded-md border border-white/15 bg-white/5 text-xs font-bold">
                  BenefitPay
                </span>
              )}
              {settings.card_enabled && (
                <>
                  <span className="px-2 py-0.5 rounded-md border border-white/15 bg-white/5 text-xs font-medium">
                    Visa / Mastercard
                  </span>
                  <span className="px-2 py-0.5 rounded-md border border-white/15 bg-white/5 text-xs font-medium">
                    Apple Pay
                  </span>
                </>
              )}
              {settings.cod_enabled && (
                <span className="px-2 py-0.5 rounded-md border border-white/15 bg-white/5 text-xs">
                  {t("الدفع عند الاستلام", "COD")}
                </span>
              )}
            </div>
          )}

          {/* Copyright & Branding */}
          <div className="flex items-center gap-3 text-xs text-center sm:text-end">
            <span>
              © {new Date().getFullYear()} {isAr ? brand.name_ar || brand.name_en : brand.name_en}.{" "}
              {t("جميع الحقوق محفوظة", "All rights reserved.")}
            </span>
            <span className="opacity-40">•</span>
            <a
              href="https://boutq.store"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:opacity-100 transition-opacity font-medium"
            >
              {t("مدعوم من Boutq OS", "Powered by Boutq OS")}
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
