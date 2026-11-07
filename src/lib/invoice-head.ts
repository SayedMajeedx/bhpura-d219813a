import { orderNumberLabel, type OrderNumberFormat } from "@/lib/order-number";
import { socialImage } from "@/lib/seo/canonical";

/** An invoice's link holds a uuid; anything else cannot be one. */
export const isInvoiceToken = (id: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

type InvoiceHeadData = {
  order?: { invoice_number?: number | null } | null;
  settings?: (OrderNumberFormat & { business_name?: string | null }) | null;
  /** The store's name when its settings hold none. */
  storeName?: string | null;
  /** The picture the store's own shared links show (`storeShareImage`). */
  shareImage?: string | null;
};

/**
 * What a shared invoice link shows: the store's name and picture, never the platform's. A link
 * preview reads the page as it first arrives, so the invoice's data has to be read on the server
 * (the route's `ssr: "data-only"`): with `ssr: false` every store's invoice previewed as
 * "Invoice — Boutq" with Boutq's picture (the owner's report of 2026-11-07).
 */
export function invoiceHead(data: InvoiceHeadData | null | undefined) {
  const store = data?.settings?.business_name?.trim() || data?.storeName?.trim() || "Boutq";
  const number = data?.order?.invoice_number;
  const title = number
    ? `Invoice ${orderNumberLabel(number, data?.settings)} — ${store}`
    : `Invoice — ${store}`;
  const description = `Invoice from ${store}.`;
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
      { property: "og:image", content: image },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
      { name: "twitter:image", content: image },
    ],
  };
}
