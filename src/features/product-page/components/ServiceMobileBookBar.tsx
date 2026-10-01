import { Link } from "@tanstack/react-router";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPrice, useStorefront } from "@/lib/storefront-context";

/** On phones, a service's page keeps "Book" in reach at the bottom of the screen. */
export function ServiceMobileBookBar({
  productId,
  fromPrice,
}: {
  productId: string;
  fromPrice: number;
}) {
  const { brand, lang, currency, t } = useStorefront();
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-3 shadow-lg md:hidden">
      <div className="flex items-center gap-3">
        {fromPrice > 0 && (
          <p className="min-w-0 shrink-0 text-sm">
            <span className="block text-xs text-muted-foreground">{t("يبدأ من", "From")}</span>
            <span className="font-bold text-foreground" dir="ltr">
              {formatPrice(fromPrice, currency, lang)}
            </span>
          </p>
        )}
        <Button asChild size="lg" className="min-w-0 flex-1 gap-2">
          <Link to="/$slug/book" params={{ slug: brand.slug }} search={{ service: productId }}>
            <CalendarDays className="size-5" aria-hidden="true" />
            {t("احجز الآن", "Book now")}
          </Link>
        </Button>
      </div>
    </div>
  );
}
