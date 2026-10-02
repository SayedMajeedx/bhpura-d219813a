import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useStorefront } from "@/lib/storefront-context";
import { packageLinesById, servicePackagesQueries } from "@/lib/data/service-packages";
import { bookingPageOptionsQueries } from "@/lib/data/booking-page-options";
import { DEFAULT_PACKAGE_STYLE } from "@/lib/bookings/package-style";
import { serviceOptionsQueries } from "@/lib/data/service-options";
import type { ProductRow } from "@/lib/data/storefront";
import { HeroBanner } from "@/features/storefront-home/components/HeroBanner";
import { BookingInvite } from "@/features/storefront-booking/components/BookingEntryPoints";
import { StoreFaq } from "@/features/store-content/components/StoreFaq";
import { StoreGallery } from "@/features/store-content/components/StoreGallery";
import { PackageOfferCard, ServiceCard } from "@/features/services-home/components/ServiceCards";
import { RentalCard } from "@/features/services-home/components/RentalCard";
import { SERVICE_KIND_LABELS, groupByKind, type ServiceKind } from "@/lib/bookings/service-kind";
import {
  extraHourPriceOf,
  packageOffer,
  splitServices,
} from "@/features/services-home/lib/services-home";

/**
 * The home page of a services store, as one page: the hero, the way to the
 * free dates, the services, the package offers, pictures of past events, the
 * booking call to action and the questions. The WhatsApp button floats over
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
  const { brand, lang, t } = useStorefront();
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
      <BookingInvite />

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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {kinds.rental.map((product) => (
              <RentalCard key={product.id} product={product} addOns={addOnsOf(product.id)} />
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
              <ServiceCard key={product.id} product={product} addOns={addOnsOf(product.id)} />
            ))}
          </div>
        </Section>
      )}

      <div className="mx-auto w-full max-w-7xl space-y-10 px-4 py-6 sm:px-6">
        <StoreGallery brandId={brand.id} isAr={isAr} />
      </div>
      <BookingInvite />
      <div className="mx-auto w-full max-w-3xl px-4 pb-12 pt-4 sm:px-6">
        <StoreFaq brandId={brand.id} isAr={isAr} />
      </div>
    </div>
  );
}
