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

  return (
    <div>
      <HeroBanner />
      <BookingInvite />

      {services.length > 0 && (
        <section
          className="mx-auto w-full max-w-7xl space-y-4 px-4 py-8 sm:px-6"
          aria-labelledby="services-title"
        >
          <h2 id="services-title" className="font-display text-2xl text-foreground">
            {t("خدماتنا", "Our services")}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((product) => (
              <ServiceCard
                key={product.id}
                product={product}
                addOns={options.filter((o) => o.product_id === product.id && o.is_active)}
              />
            ))}
          </div>
        </section>
      )}

      {offers.length > 0 && (
        <section
          className="mx-auto w-full max-w-7xl space-y-4 px-4 py-8 sm:px-6"
          aria-labelledby="packages-title"
        >
          <h2 id="packages-title" className="font-display text-2xl text-foreground">
            {t("عروض الباقات", "Package offers")}
          </h2>
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
        </section>
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
