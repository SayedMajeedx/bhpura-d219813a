import { useStorefront } from "@/lib/storefront-context";
import { ResponsiveImage } from "@/components/responsive-media";
import { StorefrontLink } from "@/features/storefront-home/components/StorefrontLink";

/** The home page promo cards (image, title and link), the first image loaded eagerly. */
export function PromoCards() {
  const { settings, lang } = useStorefront();
  const cards = settings.home_promo_cards.filter(
    (card) => card && (card.image_url || card.title_en || card.title_ar),
  );
  const firstImageIndex = cards.findIndex((card) => Boolean(card.image_url));
  if (!cards.length) return null;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
      {cards.map((card, index) => {
        const title =
          lang === "ar" ? card.title_ar || card.title_en : card.title_en || card.title_ar;
        const subtitle =
          lang === "ar"
            ? card.subtitle_ar || card.subtitle_en
            : card.subtitle_en || card.subtitle_ar;
        return (
          <StorefrontLink
            key={index}
            href={card.href || "#products"}
            aria-label={title || subtitle ? undefined : lang === "ar" ? "عرض خاص" : "Special offer"}
            className="group relative aspect-[2/1] overflow-hidden rounded-2xl border shadow-sm"
            style={{
              backgroundColor: card.background_color || "#f4f4f4",
              color: card.text_color || "#ffffff",
            }}
          >
            {card.image_url && (
              <ResponsiveImage
                src={card.image_url}
                preset="hero"
                sizes="(min-width: 640px) 50vw, 100vw"
                alt=""
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                fetchPriority={index === firstImageIndex ? "high" : "auto"}
                loading={index === firstImageIndex ? "eager" : "lazy"}
                decoding={index === firstImageIndex ? "sync" : "async"}
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-r from-black/65 via-black/30 to-transparent" />
            <div className="relative flex h-full flex-col justify-end p-6 text-white">
              {title && <h2 className="text-2xl font-semibold sm:text-3xl">{title}</h2>}
              {subtitle && <p className="mt-1 max-w-md text-sm opacity-90">{subtitle}</p>}
            </div>
          </StorefrontLink>
        );
      })}
    </div>
  );
}
