import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useStorefront } from "@/lib/storefront-context";
import { packageLinesById, servicePackagesQueries } from "@/lib/data/service-packages";
import { bookingPageOptionsQueries } from "@/lib/data/booking-page-options";
import { DEFAULT_PACKAGE_STYLE } from "@/lib/bookings/package-style";
import { serviceOptionsQueries } from "@/lib/data/service-options";
import { reviewsQueries } from "@/lib/data/reviews";
import { ProductReviews } from "@/features/product-page/components/ProductReviews";
import type { ProductRow } from "@/lib/data/storefront";
import { HeroBanner } from "@/features/storefront-home/components/HeroBanner";
import { TrustBar } from "@/components/storefront/TrustBar";
import { trustBarBelowHero } from "@/features/storefront-home/lib/home-products";
import { BookingInvite } from "@/features/storefront-booking/components/BookingEntryPoints";
import { BookingOffersList } from "@/features/storefront-booking/components/BookingOffersList";
import { StoreFaq } from "@/features/store-content/components/StoreFaq";
import { StoreGallery } from "@/features/store-content/components/StoreGallery";
import { PackageOfferCard, ServiceCard } from "@/features/services-home/components/ServiceCards";
import { RentalCard } from "@/features/services-home/components/RentalCard";
import { SERVICE_KIND_LABELS, groupByKind, type ServiceKind } from "@/lib/bookings/service-kind";
import {
  extraHourPriceOf,
  packageOffer,
  reservesPicture,
  splitServices,
} from "@/features/services-home/lib/services-home";

/**
 * The home page of a services store, as one page: the hero, the way to the
 * free dates, the services, the package offers, pictures of past events, what
 * customers said (the store's reviews, when it has any), the booking call to
 * action and the questions. The WhatsApp button floats over
 * it (WhatsAppFab, in the shell).
 */
function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="mx-auto w-full max-w-7xl space-y-4 px-4 py-8 sm:px-6" aria-labelledby={id}>
      <h2 id={id} className="font-display text-2xl text-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function ServicesHome({ products }: { products: readonly ProductRow[] }) {
  const { brand, lang, t, settings } = useStorefront();
  const isAr = lang === "ar";
  const { services, packages } = splitServices(products);
  const items = useQuery({
    ...servicePackagesQueries.items(brand.id),
    enabled: packages.length > 0,
  }).data;
  const options = useQuery(serviceOptionsQueries.list(brand.id)).data ?? [];
  const look =
    useQuery({ ...bookingPageOptionsQueries.options(brand.id), enabled: packages.length > 0 }).data
      ?.package_style ?? DEFAULT_PACKAGE_STYLE;
  // What customers said about the store: the strongest reason to book an event service.
  const reviews = useQuery(reviewsQueries.store(brand.slug)).data;
  const lines = packageLinesById(items ?? []);
  const nameOf = (product: ProductRow) =>
    (isAr ? product.name_ar || product.name : product.name_en || product.name) ?? "";
  const offers = packages.flatMap((pkg) => {
    const offer = packageOffer(pkg, lines.get(pkg.id) ?? [], products, nameOf);
    return offer ? [{ pkg, offer }] : [];
  });
  // Rentals and other services are told apart by category; packages come first.
  const kinds = groupByKind(services);
  const kindCount = [offers.length, kinds.rental.length, kinds.service.length].filter(
    (count) => count > 0,
  ).length;
  const labelOf = (kind: ServiceKind) =>
    isAr ? SERVICE_KIND_LABELS[kind].headingAr : SERVICE_KIND_LABELS[kind].headingEn;
  const addOnsOf = (productId: string) =>
    options.filter((o) => o.product_id === productId && o.is_active);

  return (
    <div>
      <HeroBanner />
      {trustBarBelowHero(settings) && <TrustBar />}
      <BookingInvite />
      {/* The store's offers, once, before its services. */}
      <BookingOffersList className="mx-auto max-w-3xl px-4 pt-4 sm:px-6" />

      {offers.length > 0 && (
        <Section
          id="packages-title"
          title={kindCount > 1 ? labelOf("package") : t("خدماتنا", "Our services")}
        >
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {offers.map(({ pkg, offer }) => (
              <PackageOfferCard
                key={pkg.id}
                product={pkg}
                offer={offer}
                extraHour={extraHourPriceOf(pkg)}
                look={look}
              />
            ))}
          </div>
        </Section>
      )}

      {kinds.rental.length > 0 && (
        <Section
          id="rentals-title"
          title={kindCount > 1 ? labelOf("rental") : t("خدماتنا", "Our services")}
        >
          {/* One wide card a row, the photo alternating sides on a wide screen. */}
          <div className="grid gap-6">
            {kinds.rental.map((product, index) => (
              <RentalCard
                key={product.id}
                product={product}
                addOns={addOnsOf(product.id)}
                flip={index % 2 === 1}
              />
            ))}
          </div>
        </Section>
      )}

      {kinds.service.length > 0 && (
        <Section
          id="services-title"
          title={kindCount > 1 ? labelOf("service") : t("خدماتنا", "Our services")}
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {kinds.service.map((product) => (
              <ServiceCard
                key={product.id}
                product={product}
                addOns={addOnsOf(product.id)}
                reservePicture={reservesPicture(kinds.service)}
              />
            ))}
          </div>
        </Section>
      )}

      <div className="mx-auto w-full max-w-7xl space-y-10 px-4 py-6 sm:px-6">
        <StoreGallery brandId={brand.id} isAr={isAr} />
        {reviews && <ProductReviews reviews={reviews} lang={isAr ? "ar" : "en"} />}
      </div>
      <BookingInvite />
      <div className="mx-auto w-full max-w-3xl px-4 pb-12 pt-4 sm:px-6">
        {/* One row per group with its count, as on the booking page: a long list of questions
            once ran past the services and the gallery. */}
        <StoreFaq brandId={brand.id} isAr={isAr} folded />
      </div>
    </div>
  );
}
