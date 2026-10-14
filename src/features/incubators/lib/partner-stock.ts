/**
 * Pieces held at partners: what an order has taken from them, and whether the totals agree.
 *
 * When the store's own stock runs out, an order takes a piece that a partner holds. The order
 * engine picks the partner and lowers its count; the piece is still physically there until
 * someone collects it. These rules say what staff read: on the order ("collect 2 from Souq
 * Box") and on the partner's page ("to hand back for order #1104").
 *
 * The database keeps the total on a product equal to what its partners hold. If the two ever
 * differ (stock from before that rule, or a fault), the partners' page says so plainly.
 */

type Lang = "ar" | "en";
type Name = { name?: string | null; name_ar?: string | null } | null | undefined;

export type PartnerHold = {
  order_id: string;
  variant_id: string;
  incubator_id: string;
  quantity: number;
  incubators?: { name?: string | null; phone?: string | null } | null;
  product_variants?: {
    sku?: string | null;
    size?: string | null;
    color?: string | null;
    products?: Name;
  } | null;
  orders?: {
    invoice_number?: number | string | null;
    status?: string | null;
    fulfillment_status?: string | null;
    /** The partner whose shop the shopper collects the order at (migration 20261014130000). */
    pickup_incubator_id?: string | null;
    customer_name_snapshot?: string | null;
  } | null;
};

const lower = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

/** The piece is still to be handed over: the order is neither finished nor cancelled. */
export function holdIsOpen(hold: PartnerHold): boolean {
  const status = lower(hold.orders?.status);
  const fulfillment = lower(hold.orders?.fulfillment_status);
  if (["completed", "delivered", "cancelled", "canceled", "returned"].includes(status)) {
    return false;
  }
  return !["completed", "delivered", "picked_up", "cancelled", "canceled"].includes(fulfillment);
}

/** A piece in words: its product, then the options that tell it apart (never "Standard"). */
export function pieceName(variant: PartnerHold["product_variants"], lang: Lang): string {
  const product = variant?.products;
  const name =
    (lang === "ar" ? product?.name_ar || product?.name : product?.name || product?.name_ar) ||
    variant?.sku ||
    (lang === "ar" ? "قطعة" : "Piece");
  const options = [variant?.size, variant?.color]
    .map((option) => String(option ?? "").trim())
    .filter((option) => option && option.toLowerCase() !== "standard");
  return options.length > 0 ? `${name} · ${options.join(" / ")}` : name;
}

export type PickupLine = {
  key: string;
  orderId: string;
  /** The order's number, for the partner's page. */
  orderNumber: string;
  partner: string;
  phone: string | null;
  piece: string;
  quantity: number;
  /** The shopper collects the order at this partner's shop, rather than the store fetching it. */
  customerCollects: boolean;
  customer: string | null;
};

/** What is still to be collected, largest first: one line per partner and piece. */
export function pickupLines(holds: readonly PartnerHold[], lang: Lang): PickupLine[] {
  return holds
    .filter((hold) => holdIsOpen(hold) && Number(hold.quantity) > 0)
    .map((hold) => ({
      key: `${hold.order_id}:${hold.variant_id}:${hold.incubator_id}`,
      orderId: hold.order_id,
      orderNumber: String(hold.orders?.invoice_number ?? "").trim(),
      partner: String(hold.incubators?.name ?? "").trim() || (lang === "ar" ? "حاضنة" : "Partner"),
      phone: String(hold.incubators?.phone ?? "").trim() || null,
      piece: pieceName(hold.product_variants, lang),
      quantity: Number(hold.quantity),
      customerCollects: Boolean(
        hold.orders?.pickup_incubator_id && hold.orders.pickup_incubator_id === hold.incubator_id,
      ),
      customer: String(hold.orders?.customer_name_snapshot ?? "").trim() || null,
    }))
    .sort((a, b) => b.quantity - a.quantity || a.partner.localeCompare(b.partner));
}

/** One partner's share of what orders have taken and not yet collected. */
export function partnerPickupLines(
  holds: readonly PartnerHold[],
  incubatorId: string | null | undefined,
  lang: Lang,
): PickupLine[] {
  return pickupLines(
    holds.filter((hold) => hold.incubator_id === incubatorId),
    lang,
  );
}

export type PartnerTotalRow = {
  id: string;
  sku?: string | null;
  size?: string | null;
  color?: string | null;
  stock_incubator?: number | string | null;
  products?: Name;
};
/** A partner's stock line, with its variant when the page loaded it. */
export type PartnerStockRow = {
  variant_id: string;
  quantity: number | string | null;
  product_variants?: Omit<PartnerTotalRow, "id"> | null;
};
export type PartnerStockMismatch = {
  variantId: string;
  piece: string;
  /** What the product says is at partners. */
  onProduct: number;
  /** What the partners hold between them. */
  atPartners: number;
};

/**
 * Variants whose total at partners differs from what the partners hold. `held` is every
 * partner's stock line; `totals` the variants that say they have pieces at partners.
 */
export function partnerStockMismatches(
  held: readonly PartnerStockRow[],
  totals: readonly PartnerTotalRow[],
  lang: Lang,
): PartnerStockMismatch[] {
  const atPartners = new Map<string, number>();
  // A variant is described by the totals list, or by a partner's line that carries it.
  const byVariant = new Map<string, Omit<PartnerTotalRow, "id">>();
  for (const row of held) {
    atPartners.set(
      row.variant_id,
      (atPartners.get(row.variant_id) ?? 0) + Number(row.quantity ?? 0),
    );
    if (row.product_variants) byVariant.set(row.variant_id, row.product_variants);
  }
  for (const row of totals) byVariant.set(row.id, row);
  const ids = new Set([...atPartners.keys(), ...byVariant.keys()]);
  const mismatches: PartnerStockMismatch[] = [];
  for (const id of ids) {
    const variant = byVariant.get(id);
    const onProduct = Number(variant?.stock_incubator ?? 0);
    const holding = atPartners.get(id) ?? 0;
    if (onProduct === holding) continue;
    mismatches.push({
      variantId: id,
      piece: pieceName(variant, lang),
      onProduct,
      atPartners: holding,
    });
  }
  return mismatches.sort((a, b) => a.piece.localeCompare(b.piece));
}

/**
 * The message a member of staff sends a partner about an order collected at the partner's shop.
 * Partners do not use the system: a person sends it on WhatsApp. It names the order, the
 * customer and the pieces, and asks the partner to hand them over.
 */
export function partnerPickupMessage(
  lines: readonly Pick<PickupLine, "orderNumber" | "customer" | "piece" | "quantity">[],
  store: string,
  lang: Lang,
): string {
  const first = lines[0];
  if (!first) return "";
  const pieces = lines.map((line) => `- ${line.quantity} × ${line.piece}`).join("\n");
  const order = first.orderNumber ? `#${first.orderNumber}` : "";
  const customer = first.customer;
  if (lang === "ar") {
    return [
      `مرحباً، معكم ${store}.`,
      `طلب أونلاين ${order} سيستلمه الزبون من محلكم${customer ? `: ${customer}` : ""}.`,
      "القطع:",
      pieces,
      "نرجو تجهيزها وتسليمها له عند حضوره، وشكراً لكم.",
    ].join("\n");
  }
  return [
    `Hello, this is ${store}.`,
    `Online order ${order} will be collected at your shop${customer ? ` by ${customer}` : ""}.`,
    "Pieces:",
    pieces,
    "Please have them ready to hand over when they arrive. Thank you.",
  ].join("\n");
}
