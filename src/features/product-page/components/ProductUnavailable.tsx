import { Link } from "@tanstack/react-router";
import { useIsServicesStore, useStorefront } from "@/lib/storefront-context";

/**
 * A product's address that leads nowhere (an old link, a piece taken off the store), drawn inside
 * the store. Without it the store's layout drew its own screen, in English with no header: "This
 * brand doesn't have an active storefront yet", on Pura's live store the day before it opened.
 */
export function ProductUnavailable() {
  const { brand, t } = useStorefront();
  const servicesStore = useIsServicesStore();
  return (
    <div className="mx-auto max-w-3xl px-4 py-20 text-center">
      <h1 className="text-3xl font-display">
        {servicesStore
          ? t("هذه الخدمة غير متاحة", "This service is not available")
          : t("هذا المنتج غير متاح", "This product is not available")}
      </h1>
      <p className="mt-3 text-muted-foreground">
        {t(
          "ربما تغيّر الرابط، أو لم يعد ضمن معروضات المتجر.",
          "The link may have changed, or it is no longer on the store.",
        )}
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
        <Link
          to="/$slug/$category"
          params={{ slug: brand.slug, category: "all" }}
          className="underline underline-offset-4"
        >
          {servicesStore
            ? t("تصفّح كل الخدمات", "Browse all services")
            : t("تصفّح كل المنتجات", "Browse all products")}
        </Link>
        <Link to="/$slug" params={{ slug: brand.slug }} className="underline underline-offset-4">
          {t("العودة للرئيسية", "Back to home")}
        </Link>
      </div>
    </div>
  );
}
