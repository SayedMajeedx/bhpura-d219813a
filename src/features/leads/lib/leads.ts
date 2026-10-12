import { normalizeWhatsAppDigits } from "@/lib/storefront-mode";
import { productAvailability, type AvailabilityProduct } from "@/lib/product-availability";

/**
 * Pure rules for the sign-ups page: the waiting list (who asked to be told when a product is
 * back, grouped by what they are waiting for), the message a member of staff sends them, and
 * the newsletter list as a file. Nothing here is sent by the system: there is no WhatsApp
 * connection that sends by itself, so a person opens the chat or the email and presses send.
 */

export type LeadChannel = "whatsapp" | "email";

export type WaitingRequest = {
  id: string;
  product_id: string;
  variant_id: string | null;
  channel: string;
  contact: string;
  lang: string | null;
  notified_at: string | null;
  created_at: string;
};

export type WaitedProduct = AvailabilityProduct & {
  id: string;
  name: string | null;
  name_ar?: string | null;
  name_en?: string | null;
  image_url?: string | null;
  is_active?: boolean | null;
};

export type WaitedVariant = {
  id: string;
  product_id: string;
  size?: string | null;
  color?: string | null;
  stock_main?: number | string | null;
  stock_incubator?: number | string | null;
};

export type WaitingGroup = {
  key: string;
  productId: string;
  variantId: string | null;
  /** The product as it is now; null when it was deleted since. */
  product: WaitedProduct | null;
  /** The size and colour asked for ("M · Black"), empty for the product as a whole. */
  option: string;
  /** Pieces that can be bought now: of the variant asked for, or of the product. */
  ready: number;
  /** Ready to buy, and visible on the storefront: these people can be told. */
  backInStock: boolean;
  requests: WaitingRequest[];
};

const units = (variant: WaitedVariant) =>
  Math.max(0, Number(variant.stock_main) || 0) + Math.max(0, Number(variant.stock_incubator) || 0);

/** A placeholder size a single-option product carries: not something a shopper chose. */
const isPlaceholder = (value: string | null | undefined) =>
  !value || ["standard", "قياسي", "one size"].includes(value.trim().toLowerCase());

export function optionLabel(variant: WaitedVariant | null | undefined): string {
  if (!variant) return "";
  return [variant.size, variant.color].filter((value) => !isPlaceholder(value)).join(" · ");
}

/**
 * The people still waiting, grouped by what they wait for. What is back in stock comes first
 * (those can be told now), then the most asked for, then the longest waited.
 */
export function waitingGroups(
  requests: readonly WaitingRequest[],
  products: readonly WaitedProduct[],
  variants: readonly WaitedVariant[],
): WaitingGroup[] {
  const productById = new Map(products.map((product) => [product.id, product]));
  const variantById = new Map(variants.map((variant) => [variant.id, variant]));
  const readyByProduct = new Map<string, number>();
  for (const variant of variants) {
    readyByProduct.set(
      variant.product_id,
      (readyByProduct.get(variant.product_id) ?? 0) + units(variant),
    );
  }

  const groups = new Map<string, WaitingGroup>();
  for (const request of requests) {
    if (request.notified_at) continue;
    const key = `${request.product_id}:${request.variant_id ?? ""}`;
    let group = groups.get(key);
    if (!group) {
      const product = productById.get(request.product_id) ?? null;
      const variant = request.variant_id ? (variantById.get(request.variant_id) ?? null) : null;
      // A request for a variant that was deleted waits for the product as a whole.
      const ready = variant ? units(variant) : (readyByProduct.get(request.product_id) ?? 0);
      // The size asked for must have a piece; a product asked for as a whole follows the one
      // availability rule (a made-to-order piece can be bought with no ready stock).
      const buyable = variant ? ready > 0 : productAvailability(product ?? {}, ready).sellable;
      group = {
        key,
        productId: request.product_id,
        variantId: request.variant_id,
        product,
        option: optionLabel(variant),
        ready,
        backInStock: Boolean(product) && product?.is_active !== false && buyable,
        requests: [],
      };
      groups.set(key, group);
    }
    group.requests.push(request);
  }

  const oldest = (group: WaitingGroup) =>
    group.requests.reduce(
      (first, request) => (request.created_at < first ? request.created_at : first),
      group.requests[0].created_at,
    );
  return [...groups.values()].sort(
    (a, b) =>
      Number(b.backInStock) - Number(a.backInStock) ||
      b.requests.length - a.requests.length ||
      oldest(a).localeCompare(oldest(b)),
  );
}

/** The requests already answered, newest first. */
export function toldRequests(requests: readonly WaitingRequest[]): WaitingRequest[] {
  return requests
    .filter((request) => request.notified_at)
    .sort((a, b) => String(b.notified_at).localeCompare(String(a.notified_at)));
}

export function productName(product: WaitedProduct | null, lang: "ar" | "en"): string {
  if (!product) return lang === "ar" ? "منتج محذوف" : "Deleted product";
  return (
    (lang === "ar" ? product.name_ar || product.name : product.name_en || product.name) ||
    product.name ||
    ""
  );
}

/** The message a member of staff sends, in the language the shopper used on the storefront. */
export function backInStockMessage({
  storeName,
  name,
  option,
  link,
  lang,
}: {
  storeName: string;
  name: string;
  option: string;
  link: string;
  lang: "ar" | "en";
}): string {
  const piece = option ? `${name} (${option})` : name;
  return lang === "ar"
    ? `مرحباً، معك ${storeName}. طلبت منا إشعارك عند توفر «${piece}»، وهو متوفر الآن:\n${link}`
    : `Hello from ${storeName}. You asked to be told when "${piece}" is back, and it is in stock now:\n${link}`;
}

/** Where pressing "Tell them" goes: the shopper's WhatsApp chat or a new email, message ready. */
export function contactLink(
  request: Pick<WaitingRequest, "channel" | "contact">,
  message: string,
  subject: string,
): string | null {
  if (request.channel === "email") {
    const address = request.contact.trim();
    if (!address.includes("@")) return null;
    return `mailto:${address}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
  }
  const digits = normalizeWhatsAppDigits(request.contact);
  if (digits.length < 8) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export type Subscriber = {
  id: string;
  channel: string;
  contact: string;
  lang: string | null;
  source: string | null;
  created_at: string;
};

export function subscriberCounts(rows: readonly Subscriber[]) {
  const email = rows.filter((row) => row.channel === "email").length;
  return { total: rows.length, email, whatsapp: rows.length - email };
}

const csvCell = (value: string) => {
  // A cell that starts like a formula is text, not something a spreadsheet should run.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** The newsletter list as a CSV file (with a mark so Arabic opens right in a spreadsheet). */
export function subscribersCsv(rows: readonly Subscriber[]): string {
  const lines = [
    ["contact", "channel", "language", "source", "signed_up"],
    ...rows.map((row) => [
      row.contact,
      row.channel,
      row.lang ?? "",
      row.source ?? "",
      row.created_at.slice(0, 10),
    ]),
  ];
  return `\uFEFF${lines.map((line) => line.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
