import React, { useState } from "react";
import { Link } from "@tanstack/react-router";
import { AddonSlot } from "@/components/addons/AddonSlot";
import { Button } from "@/components/ui/button";
import { useIsServicesStore, useStorefront } from "@/lib/storefront-context";
import { NewsletterForm } from "@/components/storefront/NewsletterForm";
import { TrustBar } from "@/components/storefront/TrustBar";
import { StorefrontSocialIcon } from "@/features/storefront-shell/components/StorefrontSocialIcon";
import { footerGroupTitles, footerPageGroups } from "@/features/storefront-shell/lib/footer-pages";
import { ChevronDown } from "lucide-react";

type SectionKey = "shop" | "company" | "help";

const FG = { color: "var(--sf-footer-fg)" } as const;
const DESKTOP_LINK = "opacity-75 hover:opacity-100 hover:translate-x-0.5 transition-all w-fit";
const MOBILE_LINK = "opacity-75 hover:opacity-100 py-1 min-h-11 flex items-center";

/**
 * The columns footer (used by the v2 storefront). The Pages & Policies screen
 * drives it: each page sits in the group the store chose (company or help),
 * under the headings the store wrote, and socials come from the same list.
 */
export function FooterV2() {
  const { brand, settings, lang, t } = useStorefront();
  const isAr = lang === "ar";
  // A services store's footer talks about services and bookings, not products.
  const servicesStore = useIsServicesStore();

  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
    shop: false,
    company: false,
    help: false,
  });
  const toggleSection = (key: SectionKey) =>
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

  const footerLogoSize = Math.max(20, Math.min(120, Number(settings.footer_logo_size ?? 32)));
  const aboutText = isAr
    ? brand.about_ar || settings.footer_note
    : brand.about_en || settings.footer_note;
  const truncatedAbout = aboutText
    ? aboutText.length > 160
      ? `${aboutText.slice(0, 160)}...`
      : aboutText
    : null;

  const socialsList: Array<{ name: string; url: string }> = Array.isArray(settings.socials)
    ? settings.socials
    : [];

  const { companyPages, helpPages } = footerPageGroups(settings.pages ?? [], isAr);
  const titles = footerGroupTitles(settings, isAr);
  const shopTitle = servicesStore ? t("خدماتنا", "Our services") : t("تسوّق", "Shop");
  const brandName = isAr ? brand.name_ar || brand.name_en : brand.name_en;

  const showTrustBarAboveFooter =
    settings.trust_bar_enabled &&
    (settings.trust_bar_position === "above_footer" || settings.trust_bar_position === "both");

  const pageLinks = (pages: typeof companyPages, linkClass: string) =>
    pages.map((p) => (
      <Link
        key={p.idx}
        to="/$slug/$category"
        params={{ slug: brand.slug, category: p.slug }}
        className={linkClass}
        style={FG}
      >
        {p.title}
      </Link>
    ));

  const shopLinks = (linkClass: string) => (
    <>
      <Link to="/$slug" params={{ slug: brand.slug }} className={linkClass} style={FG}>
        {t("الرئيسية", "Home")}
      </Link>
      {servicesStore ? (
        <>
          <Link
            to="/$slug/$category"
            params={{ slug: brand.slug, category: "all" }}
            className={linkClass}
            style={FG}
          >
            {t("كل الخدمات", "All services")}
          </Link>
          <Link
            to="/$slug/book"
            params={{ slug: brand.slug }}
            className={`${linkClass} font-medium`}
            style={FG}
          >
            {t("احجز موعدك", "Book a date")}
          </Link>
        </>
      ) : (
        <>
          <Link
            to="/$slug/$category"
            params={{ slug: brand.slug, category: "all" }}
            className={linkClass}
            style={FG}
          >
            {t("كل المنتجات", "All Products")}
          </Link>
          <Link
            to="/$slug/$category"
            params={{ slug: brand.slug, category: "new" }}
            className={linkClass}
            style={FG}
          >
            {t("وصل حديثاً", "New Arrivals")}
          </Link>
          <Link
            to="/$slug/$category"
            params={{ slug: brand.slug, category: "sale" }}
            className={`${linkClass} text-destructive font-medium`}
          >
            {t("التخفيضات", "Sale")}
          </Link>
        </>
      )}
      {!servicesStore && (brand as any)?.modules?.made_to_order && (
        <Link
          to={"/$slug/custom-order" as any}
          params={{ slug: brand.slug } as any}
          className={linkClass}
          style={FG}
        >
          {t("طلب مخصص", "Custom Order")}
        </Link>
      )}
    </>
  );

  const helpLinks = (linkClass: string) => (
    <>
      <Link to="/$slug/account" params={{ slug: brand.slug }} className={linkClass} style={FG}>
        {servicesStore
          ? t("حجوزاتي وحسابي", "My bookings & account")
          : t("تتبع الطلبات وحسابي", "Track Order & Account")}
      </Link>
      {pageLinks(helpPages, linkClass)}
      <AddonSlot
        placement="storefront.footer.helpLink"
        props={{ className: linkClass, style: FG }}
      />
    </>
  );

  const columnHeading = (title: string) => (
    <h4
      className="text-xs font-semibold uppercase tracking-wider opacity-90 border-b border-white/10 pb-2"
      style={FG}
    >
      {title}
    </h4>
  );

  const accordion = (key: SectionKey, title: string, links: React.ReactNode) => (
    <div className="border-b border-white/10 pb-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => toggleSection(key)}
        aria-expanded={openSections[key]}
        className="h-auto min-h-11 rounded-md w-full flex items-center justify-between py-2 text-xs font-semibold"
        style={FG}
      >
        <span>{title}</span>
        <ChevronDown
          className={`h-4 w-4 transition-transform duration-200 ${
            openSections[key] ? "rotate-180" : ""
          }`}
        />
      </Button>
      {openSections[key] && (
        <nav className="flex flex-col space-y-2 pt-1 pb-2 text-xs ps-2">{links}</nav>
      )}
    </div>
  );

  const logo = (textClass: string) =>
    settings.logo_url ? (
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
      <span className={`${textClass} font-bold font-display`} style={FG}>
        {brandName}
      </span>
    );

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
      {showTrustBarAboveFooter && <TrustBar />}

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
        {/* Desktop columns: brand, shop, company (when it has pages), help, newsletter */}
        <div
          className={`hidden lg:grid gap-8 xl:gap-12 text-start ${
            companyPages.length > 0 ? "grid-cols-5" : "grid-cols-4"
          }`}
        >
          <div className="space-y-4">
            {logo("text-lg")}
            {truncatedAbout && (
              <p className="text-xs leading-relaxed opacity-80" style={FG}>
                {truncatedAbout}
              </p>
            )}
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
                    style={FG}
                  >
                    <StorefrontSocialIcon platform={s.name} />
                  </a>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3">
            {columnHeading(shopTitle)}
            <nav className="flex flex-col space-y-2 text-xs">{shopLinks(DESKTOP_LINK)}</nav>
          </div>

          {companyPages.length > 0 && (
            <div className="space-y-3">
              {columnHeading(titles.company)}
              <nav className="flex flex-col space-y-2 text-xs">
                {pageLinks(companyPages, DESKTOP_LINK)}
              </nav>
            </div>
          )}

          <div className="space-y-3">
            {columnHeading(titles.help)}
            <nav className="flex flex-col space-y-2 text-xs">{helpLinks(DESKTOP_LINK)}</nav>
          </div>

          <div className="space-y-4">
            {columnHeading(t("تواصل معنا", "Stay Connected"))}
            {settings.newsletter_enabled !== false && <NewsletterForm />}
          </div>
        </div>

        {/* Mobile: the same groups as accordions */}
        <div className="block lg:hidden space-y-4 text-start">
          <div className="flex flex-col items-center text-center space-y-2 pb-3 border-b border-white/10">
            {logo("text-base")}
            {truncatedAbout && (
              <p className="text-xs leading-relaxed opacity-75 max-w-sm" style={FG}>
                {truncatedAbout}
              </p>
            )}
          </div>

          {accordion("shop", shopTitle, shopLinks(MOBILE_LINK))}
          {companyPages.length > 0 &&
            accordion("company", titles.company, pageLinks(companyPages, MOBILE_LINK))}
          {accordion("help", titles.help, helpLinks(MOBILE_LINK))}

          {socialsList.length > 0 && (
            <div className="flex flex-wrap justify-center items-center gap-3 py-1">
              {socialsList.map((s, i) => (
                <a
                  key={`${s.name}-${i}`}
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.name}
                  className="h-11 w-11 rounded-full border border-white/15 bg-white/5 flex items-center justify-center hover:bg-white/15 transition-all active:scale-95"
                  style={FG}
                >
                  <StorefrontSocialIcon platform={s.name} />
                </a>
              ))}
            </div>
          )}

          {settings.newsletter_enabled !== false && (
            <div className="pt-2">
              <NewsletterForm />
            </div>
          )}
        </div>

        {/* Bottom bar: payment icons, copyright, privacy choices, powered by */}
        <div className="mt-8 pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs opacity-75">
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

          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-center sm:text-end">
            <span>
              © {new Date().getFullYear()} {brandName}.{" "}
              {t("جميع الحقوق محفوظة", "All rights reserved.")}
            </span>
            {settings.analytics_consent_required && (
              <Button
                type="button"
                variant="link"
                className="inline-flex min-h-11 items-center hover:opacity-100 py-0.5 sm:min-h-0 h-auto p-0 font-normal underline underline-offset-2"
                style={FG}
                onClick={() => window.dispatchEvent(new Event("boutq:privacy-preferences"))}
              >
                {t("خيارات الخصوصية", "Privacy choices")}
              </Button>
            )}
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
