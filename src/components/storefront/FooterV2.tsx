import { useQuery } from "@tanstack/react-query";
import { giftCardOnlineQueries } from "@/lib/data/gift-cards/online";
import React, { useId, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AddonSlot } from "@/components/addons/AddonSlot";
import { Button } from "@/components/ui/button";
import { useIsServicesStore, useStorefront } from "@/lib/storefront-context";
import { PaymentMarks } from "@/components/storefront/PaymentMarks";
import { TrustBar } from "@/components/storefront/TrustBar";
import { StorefrontSocialIcon } from "@/features/storefront-shell/components/StorefrontSocialIcon";
import { footerGroupTitles, footerPageGroups } from "@/features/storefront-shell/lib/footer-pages";
import { footerCollections } from "@/features/storefront-shell/lib/footer-collections";
import { hoursLines, paymentMarks } from "@/features/storefront-shell/lib/footer-care";
import { useStorefrontCategories } from "@/lib/use-storefront-categories";
import { whatsappChatUrl } from "@/lib/whatsapp-phone";
import { displayPhone } from "@/lib/invoice-display";
import { ChevronDown, MessageCircle } from "lucide-react";

const FG = { color: "var(--sf-footer-fg)" } as const;
const LINK =
  "flex min-h-11 w-fit items-center text-sm opacity-75 transition-opacity duration-(--motion-quick) hover:opacity-100 lg:min-h-0 lg:py-1";

/**
 * A group of the footer's links: a column under its heading on a laptop, a fold on a phone (one
 * piece of markup for both; the footer once drew everything twice, its description too).
 * Its heading is a level-2 heading: the page's sections are h2. Not an <h2>: the storefront sets
 * every h1-h3 in the store's heading font with !important, and these small labels are in its text
 * font.
 */
function FooterGroup({
  title,
  folds = true,
  children,
}: {
  title: string;
  /** Short groups stay open on a phone. */
  folds?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className={folds ? "border-b border-current/10 lg:border-0" : ""}>
      {folds && (
        <Button
          type="button"
          variant="bar"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={id}
          className="flex h-auto min-h-12 w-full items-center justify-between rounded-none bg-transparent px-0 text-sm font-semibold text-inherit hover:bg-transparent lg:hidden"
          style={FG}
        >
          <span>{title}</span>
          <ChevronDown
            aria-hidden
            className={`h-4 w-4 opacity-70 transition-transform duration-(--motion-fast) ${open ? "rotate-180" : ""}`}
          />
        </Button>
      )}
      <p
        role="heading"
        aria-level={2}
        className={`text-xs font-semibold uppercase opacity-90 ltr:tracking-wider ${
          folds ? "hidden lg:block" : "pb-1 lg:pb-0"
        }`}
        style={FG}
      >
        {title}
      </p>
      <div
        id={id}
        className={`flex-col pb-3 lg:flex lg:pt-4 lg:pb-0 ${folds && !open ? "hidden" : "flex"}`}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * The store's footer (the footer review of 2026-11-15): the store and its links in columns on a
 * laptop and folds on a phone; how to reach the store (its WhatsApp and opening hours,
 * `footer-care.ts`) when it set them; then its socials, its
 * payment marks and the copyright. The Pages & Policies screen drives the links: each page sits
 * in the group the store chose (company or help), under the headings the store wrote.
 */
export function FooterV2() {
  const { brand, settings, lang, t } = useStorefront();
  const isAr = lang === "ar";
  // A services store's footer talks about services and bookings, not products.
  const servicesStore = useIsServicesStore();
  // Shown while the store sells gift cards online (step four).
  const sellsGiftCards = Boolean(useQuery(giftCardOnlineQueries.offer(brand.slug)).data);
  // New arrivals and sale only while the store shows those categories, as the header does.
  const { data: categories = [] } = useStorefrontCategories({ menu: true });
  const collections = footerCollections(categories, isAr);

  const footerLogoSize = Math.max(20, Math.min(120, Number(settings.footer_logo_size ?? 32)));
  const aboutText = isAr
    ? brand.about_ar || settings.footer_note
    : brand.about_en || settings.footer_note;

  const socialsList: Array<{ name: string; url: string }> = Array.isArray(settings.socials)
    ? settings.socials
    : [];

  const { companyPages, helpPages } = footerPageGroups(settings.pages ?? [], isAr);
  const titles = footerGroupTitles(settings, isAr);
  const shopTitle = servicesStore ? t("خدماتنا", "Our services") : t("تسوّق", "Shop");
  const brandName = isAr ? brand.name_ar || brand.name_en : brand.name_en;

  const whatsapp =
    settings.whatsapp_enabled && settings.whatsapp_number
      ? {
          url: whatsappChatUrl(settings.whatsapp_number),
          number: displayPhone(settings.whatsapp_number),
        }
      : null;
  const hours = hoursLines(settings.opening_hours, isAr ? "ar" : "en");
  const showCare = Boolean(whatsapp?.url) || hours.length > 0;
  const marks = settings.footer_show_payment_methods !== false ? paymentMarks(settings) : [];

  const showTrustBarAboveFooter =
    settings.trust_bar_enabled &&
    (settings.trust_bar_position === "above_footer" || settings.trust_bar_position === "both");

  const linkGroups = 2 + (companyPages.length > 0 ? 1 : 0) + (showCare ? 1 : 0);

  const pageLinks = (pages: typeof companyPages) =>
    pages.map((p) => (
      <Link
        key={p.idx}
        to="/$slug/$category"
        params={{ slug: brand.slug, category: p.slug }}
        className={LINK}
        style={FG}
      >
        {p.title}
      </Link>
    ));

  return (
    <footer
      role="contentinfo"
      aria-label={isAr ? "تذييل الموقع" : "Website Footer"}
      className="border-t transition-colors duration-(--motion-fast)"
      style={{
        borderColor: "rgba(255,255,255,0.12)",
        backgroundColor: "var(--sf-footer-bg)",
        color: "var(--sf-footer-fg)",
      }}
    >
      {showTrustBarAboveFooter && <TrustBar />}

      <div className="mx-auto max-w-7xl px-4 py-8 text-start sm:px-6 lg:px-8 lg:py-12">
        <div
          className="grid grid-cols-1 gap-y-2 lg:grid-cols-(--footer-cols) lg:gap-x-10 xl:gap-x-14"
          style={
            {
              "--footer-cols": `minmax(0,1.5fr) repeat(${linkGroups}, minmax(0,1fr))`,
            } as React.CSSProperties
          }
        >
          {/* On a phone the logo stands alone, centred, as the closing block does; on a laptop it
              leads its column. */}
          <div className="flex flex-col items-center space-y-3 pb-3 lg:items-start lg:pb-0">
            {settings.logo_url ? (
              <img
                src={settings.logo_url}
                alt={brandName || "Logo"}
                width={footerLogoSize * 3}
                height={footerLogoSize}
                loading="lazy"
                decoding="async"
                style={
                  {
                    "--logo-h": `${footerLogoSize}px`,
                    "--logo-h-phone": `${Math.min(footerLogoSize, 48)}px`,
                  } as React.CSSProperties
                }
                className="h-(--logo-h-phone) w-auto object-contain lg:h-(--logo-h)"
              />
            ) : (
              <span className="font-display text-lg font-bold" style={FG}>
                {brandName}
              </span>
            )}
            {aboutText && (
              <p
                className="hidden max-w-sm text-sm leading-relaxed opacity-75 line-clamp-4 lg:block"
                style={FG}
              >
                {aboutText}
              </p>
            )}
          </div>

          <FooterGroup title={shopTitle}>
            {servicesStore ? (
              <>
                <Link
                  to="/$slug/$category"
                  params={{ slug: brand.slug, category: "all" }}
                  className={LINK}
                  style={FG}
                >
                  {t("كل الخدمات", "All services")}
                </Link>
                <Link
                  preload="viewport"
                  to="/$slug/book"
                  params={{ slug: brand.slug }}
                  className={`${LINK} font-medium`}
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
                  className={LINK}
                  style={FG}
                >
                  {t("كل المنتجات", "All Products")}
                </Link>
                {collections.map((c) => (
                  <Link
                    key={c.slug}
                    to="/$slug/$category"
                    params={{ slug: brand.slug, category: c.slug }}
                    className={c.sale ? `${LINK} font-semibold` : LINK}
                    style={FG}
                  >
                    {c.name}
                  </Link>
                ))}
              </>
            )}
          </FooterGroup>

          {companyPages.length > 0 && (
            <FooterGroup title={titles.company}>{pageLinks(companyPages)}</FooterGroup>
          )}

          <FooterGroup title={titles.help}>
            {/* Tracking needs no account: an order's number and phone open it. */}
            {!servicesStore && (
              <Link
                preload="viewport"
                to="/$slug/track-order"
                params={{ slug: brand.slug }}
                className={LINK}
                style={FG}
              >
                {t("تتبّع طلبك", "Track your order")}
              </Link>
            )}
            {sellsGiftCards && (
              <Link
                preload="viewport"
                to="/$slug/gift-cards"
                params={{ slug: brand.slug }}
                className={LINK}
                style={FG}
              >
                {t("بطاقات الهدايا", "Gift cards")}
              </Link>
            )}
            <Link
              preload="viewport"
              to="/$slug/account"
              params={{ slug: brand.slug }}
              className={LINK}
              style={FG}
            >
              {servicesStore
                ? t("حجوزاتي وحسابي", "My bookings & account")
                : t("حسابي", "My account")}
            </Link>
            {pageLinks(helpPages)}
            <AddonSlot
              placement="storefront.footer.helpLink"
              props={{ className: LINK, style: FG }}
            />
          </FooterGroup>

          {/* How to reach the store, from its own settings; short, so open on a phone too. */}
          {showCare && (
            <div className="pt-4 lg:pt-0">
              <FooterGroup title={t("خدمة العملاء", "Customer care")} folds={false}>
                {whatsapp?.url && (
                  <a
                    href={whatsapp.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${LINK} gap-2`}
                    style={FG}
                  >
                    <MessageCircle aria-hidden className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                    <span dir="ltr">{whatsapp.number}</span>
                  </a>
                )}
                {hours.length > 0 && (
                  <dl className="mt-2 space-y-1 text-sm opacity-75" style={FG}>
                    {hours.map((line) => (
                      <div key={line.days} className="flex flex-wrap gap-x-2">
                        <dt>{line.days}</dt>
                        <dd dir="ltr" className="tabular-nums">
                          {line.hours}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </FooterGroup>
            </div>
          )}
        </div>

        {/* Socials and payment marks, then the copyright. */}
        <div className="mt-6 flex flex-col items-center gap-5 border-t border-current/10 pt-6 text-center lg:mt-10 lg:flex-row lg:items-center lg:justify-between lg:text-start">
          <div className="flex flex-col items-center gap-4 lg:flex-row lg:flex-wrap lg:gap-x-6">
            {socialsList.length > 0 && (
              <ul className="flex items-center gap-1" aria-label={t("حساباتنا", "Follow us")}>
                {socialsList.map((s, i) => (
                  <li key={`${s.name}-${i}`}>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={s.name}
                      className="flex h-11 w-11 items-center justify-center rounded-full opacity-80 transition-opacity duration-(--motion-quick) hover:bg-current/10 hover:opacity-100"
                      style={FG}
                    >
                      <StorefrontSocialIcon platform={s.name} />
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <PaymentMarks
              marks={marks}
              lang={isAr ? "ar" : "en"}
              className="justify-center lg:justify-start"
            />
          </div>

          <div className="flex flex-col items-center gap-1 text-xs opacity-75 sm:flex-row sm:flex-wrap sm:justify-center sm:gap-x-3 lg:justify-start">
            <span>
              © {new Date().getFullYear()} {brandName}.{" "}
              {t("جميع الحقوق محفوظة", "All rights reserved.")}
            </span>
            {settings.analytics_consent_required && (
              <Button
                type="button"
                variant="link"
                className="inline-flex h-auto min-h-11 w-fit items-center p-0 py-0.5 font-normal underline underline-offset-2 hover:opacity-100 sm:min-h-0"
                style={FG}
                onClick={() => window.dispatchEvent(new Event("boutq:privacy-preferences"))}
              >
                {t("خيارات الخصوصية", "Privacy choices")}
              </Button>
            )}
            <span aria-hidden className="hidden opacity-40 sm:inline">
              •
            </span>
            <a
              href="https://boutq.store"
              target="_blank"
              rel="noopener noreferrer"
              className="w-fit font-medium transition-opacity hover:opacity-100"
            >
              {t("مدعوم من Boutq OS", "Powered by Boutq OS")}
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
