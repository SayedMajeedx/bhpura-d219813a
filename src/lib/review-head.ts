import { orderNumberLabel, type OrderNumberFormat } from "@/lib/order-number";
import { socialImage } from "@/lib/seo/canonical";

/** A review link holds a uuid; anything else cannot be one. */
export const isReviewToken = (token: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token);

export type ReviewHeadData = {
  invoiceNumber?: number | null;
  settings?: (OrderNumberFormat & { business_name?: string | null }) | null;
  /** The store's name when its settings hold none. */
  storeName?: string | null;
  /** The picture the store's own shared links show (`storeShareImage`). */
  shareImage?: string | null;
};

/**
 * What a shared review link shows: the store's name and picture, never the platform's, as a
 * shared invoice does (`invoiceHead`). A link preview reads the page as it first arrives, so the
 * route reads this on the server (`ssr: "data-only"`). The page asks in Arabic, so does its preview.
 */
export function reviewHead(data: ReviewHeadData | null | undefined) {
  const store = data?.settings?.business_name?.trim() || data?.storeName?.trim() || "Boutq";
  const number = data?.invoiceNumber;
  const title = `قيّم طلبك من ${store}`;
  const description = number
    ? `رأيك في طلبك ${orderNumberLabel(number, data?.settings)} يهمنا، وما ياخذ إلا 30 ثانية.`
    : "رأيك في طلبك يهمنا، وما ياخذ إلا 30 ثانية.";
  const image = socialImage(data?.shareImage);
  return {
    meta: [
      { title },
      { name: "description", content: description },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: store },
      { property: "og:locale", content: "ar_AR" },
      { property: "og:image", content: image },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
      { name: "twitter:image", content: image },
    ],
  };
}
