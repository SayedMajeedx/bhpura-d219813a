import { offerReaches, type StoreOffer } from "@/lib/offers";
import { postName } from "@/features/content-studio/lib/post-name";

/** One post the studio suggests making today, with why. */
export type TodayPost = {
  key: string;
  templateId: "last-chance" | "price-drop" | "atelier-reveal";
  productId: string;
  /** Why now, in the reader's words. */
  reason: string;
  /** The template's name, as the picker says it. */
  action: string;
};

type ProductLike = {
  id: string;
  name: string;
  name_ar?: string | null;
  name_en?: string | null;
  category?: string | null;
  is_active?: boolean | null;
  created_at?: string | null;
};

const DAY = 86_400_000;

/** Days from `now` to `moment` on the reader's calendar (0 today, 1 tomorrow). */
function daysUntil(moment: Date, now: Date): number {
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((day(moment) - day(now)) / DAY);
}

/**
 * What is worth posting today, from the store's own state, best first and at most three: an offer
 * that ends today or tomorrow (Last Chance), an offer that is on (Price Drop), and a piece added in
 * the last two weeks (a reveal). Each names the piece it would show. Nothing is suggested from a
 * guess: with no offer and nothing new, the list is empty.
 */
export function todayPosts({
  offers,
  products,
  now,
  lang,
}: {
  offers: readonly StoreOffer[];
  products: readonly ProductLike[];
  now: Date;
  lang: "ar" | "en";
}): TodayPost[] {
  const ar = lang === "ar";
  const shown = products.filter((product) => product.is_active !== false);
  const label = (product: ProductLike) =>
    postName(ar ? product.name_ar || product.name : product.name_en || product.name).label;
  const posts: TodayPost[] = [];

  const priceOffers = offers.filter(
    (offer) => offer.kind !== "free_delivery" && offer.discount_type != null,
  );
  for (const offer of priceOffers) {
    const piece = shown.find((product) => offerReaches(offer, product));
    if (!piece) continue;
    const ends = offer.ends_at ? new Date(offer.ends_at) : null;
    const away = ends && !Number.isNaN(ends.getTime()) ? daysUntil(ends, now) : null;
    if (away !== null && away >= 0 && away <= 1 && ends!.getTime() > now.getTime()) {
      posts.push({
        key: `last:${offer.id}`,
        templateId: "last-chance",
        productId: piece.id,
        reason: ar
          ? `العرض ينتهي ${away === 0 ? "اليوم" : "بكرة"}`
          : `The offer ends ${away === 0 ? "today" : "tomorrow"}`,
        action: ar ? "فرصة أخيرة" : "Last chance",
      });
    } else {
      posts.push({
        key: `drop:${offer.id}`,
        templateId: "price-drop",
        productId: piece.id,
        reason: ar ? `العرض شغّال على ${label(piece)}` : `The offer is on for ${label(piece)}`,
        action: ar ? "تخفيض السعر" : "Price drop",
      });
    }
    break;
  }

  const newest = shown
    .filter((product) => {
      const added = product.created_at ? new Date(product.created_at).getTime() : NaN;
      return !Number.isNaN(added) && now.getTime() - added <= 14 * DAY && added <= now.getTime();
    })
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
  if (newest) {
    posts.push({
      key: `new:${newest.id}`,
      templateId: "atelier-reveal",
      productId: newest.id,
      reason: ar ? `جديد في المتجر: ${label(newest)}` : `New in the store: ${label(newest)}`,
      action: ar ? "كشف الأتيليه" : "Atelier reveal",
    });
  }
  return posts.slice(0, 3);
}
