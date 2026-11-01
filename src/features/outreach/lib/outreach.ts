import { normalizePhoneForWhatsApp } from "@/lib/whatsapp-phone";
import { countsAsSold } from "@/lib/data/orders/sold-orders";
import { isOpenCart } from "@/lib/abandoned-cart-recovery";
import { madeToOrderLimit } from "@/lib/product-availability";
import { sizeWorthNaming } from "@/lib/default-variant";
import {
  waitingGroups,
  type WaitedProduct,
  type WaitedVariant,
  type WaitingRequest,
} from "@/features/leads/lib/leads";

/**
 * Who is worth a message today, and why: the store's own knowledge of its clients, read from
 * what Boutq already holds (orders and their sizes, the waiting list, carts, new pieces). Nobody
 * types anything in for it, and nothing is sent by the system: a member of staff opens the chat
 * with the message written and presses send.
 *
 * Two kinds of reason, because the rules differ:
 * - what the client asked for (a size back in stock, the cart they left, how their first order
 *   went): no marketing consent is needed, the client started it;
 * - suggestions (new pieces in their size, coming back after their usual gap): only for a client
 *   who agreed to hear from the store (`marketing_consent`), never one who opted out.
 *
 * A client is offered once a week at most, whatever the reason, and "not now" puts one reason
 * away for a week.
 */

export type OutreachReason =
  "back_in_stock" | "cart" | "aftercare" | "new_in_size" | "due_back" | "ask_consent";

/** Suggestions: only for a client who agreed to hear from the store. */
export const SUGGESTION_REASONS: readonly OutreachReason[] = ["new_in_size", "due_back"];

/** The order a client's reasons are offered in: what they asked for first. */
const PRIORITY: Record<OutreachReason, number> = {
  back_in_stock: 0,
  cart: 1,
  aftercare: 2,
  new_in_size: 3,
  due_back: 4,
  ask_consent: 5,
};

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
/** A client is offered once a week at most; "not now" puts a reason away for a week. */
export const QUIET_DAYS = 7;
/** Asking for consent is not repeated for three months. */
export const ASK_AGAIN_DAYS = 90;
/** A cart is worth a word between an hour and three days after it was left. */
const CART_FROM = HOUR;
const CART_UNTIL = 3 * DAY;
/** A first order is followed up three to ten days after it was handed over. */
const AFTERCARE_FROM = 3 * DAY;
const AFTERCARE_UNTIL = 10 * DAY;
/** Pieces added in the last two weeks are new. */
const NEW_PIECE_DAYS = 14;
/** A client is due back past one and a half times their usual gap, never under a month or after a year. */
const DUE_FACTOR = 1.5;
const DUE_MIN_DAYS = 30;
const DUE_MAX_DAYS = 365;
/** At most this many new pieces are named in one message. */
const NEW_PIECES_NAMED = 3;

export type OutreachCustomer = {
  id: string;
  name: string | null;
  phone: string | null;
  marketing_consent: boolean | null;
  opted_out_at: string | null;
};

export type OutreachOrderItem = {
  product_id: string | null;
  variant_id: string | null;
  size: string | null;
};

export type OutreachOrder = {
  id: string;
  customer_id: string | null;
  created_at: string;
  status: string | null;
  delivered_at: string | null;
  completed_at: string | null;
  items: OutreachOrderItem[];
};

export type OutreachCartLine = { name: string; size: string | null; quantity: number };

export type OutreachCart = {
  id: string;
  customer_id: string | null;
  guest_name: string | null;
  guest_phone: string | null;
  marketing_consent: boolean | null;
  last_activity_at: string | null;
  recovered_at: string | null;
  status: string | null;
  cart_items: unknown;
  subtotal: number | string | null;
  currency: string | null;
  recovery_token: string | null;
  customers?: { name?: string | null; phone?: string | null } | null;
};

export type OutreachProduct = WaitedProduct & { created_at?: string | null };

/** A message that was sent, or a reason put away ("not now"), as the activity log keeps it. */
export type OutreachLogEntry = {
  contact: string;
  reason: OutreachReason;
  kind: "sent" | "skipped";
  at: string;
};

export type OutreachDetail =
  | {
      reason: "back_in_stock";
      requestId: string;
      product: OutreachProduct;
      option: string;
    }
  | {
      reason: "cart";
      cartId: string;
      lines: OutreachCartLine[];
      subtotal: number;
      currency: string | null;
      token: string;
    }
  | { reason: "aftercare"; orderId: string; handedOverAt: string }
  | { reason: "new_in_size"; size: string; products: OutreachProduct[] }
  | { reason: "due_back"; lastOrderAt: string; usualGapDays: number; orders: number }
  | { reason: "ask_consent"; orders: number };

export type OutreachCard = {
  /** Stable across reloads: the reason and what it is about. */
  key: string;
  reason: OutreachReason;
  /** The WhatsApp number, digits with the country code. */
  contact: string;
  customerId: string | null;
  name: string | null;
  /** The language to write in, guessed; staff can switch it. */
  lang: "ar" | "en";
  /** When the reason began: the request, the cart, the hand-over, the newest piece, the last order. */
  since: string;
  detail: OutreachDetail;
};

export type OutreachInput = {
  now: number;
  customers: readonly OutreachCustomer[];
  orders: readonly OutreachOrder[];
  carts: readonly OutreachCart[];
  requests: readonly WaitingRequest[];
  products: readonly OutreachProduct[];
  variants: readonly WaitedVariant[];
  log: readonly OutreachLogEntry[];
};

/** A number WhatsApp can reach, or "" when there is none. */
export function outreachContact(phone: string | null | undefined): string {
  const digits = normalizePhoneForWhatsApp(phone);
  return digits.length >= 8 ? digits : "";
}

/** Arabic for a name written in Arabic, English for one in Latin letters, else Arabic. */
export function guessLang(
  name: string | null | undefined,
  fallback: "ar" | "en" = "ar",
): "ar" | "en" {
  const text = name ?? "";
  if (/[؀-ۿ]/.test(text)) return "ar";
  if (/[A-Za-z]/.test(text)) return "en";
  return fallback;
}

const time = (value: string | null | undefined) => (value ? Date.parse(value) : NaN);

export function cartLines(items: unknown): OutreachCartLine[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((raw) => {
      const item = (raw ?? {}) as Record<string, unknown>;
      const name = String(item.title ?? item.name ?? "").trim();
      const size = typeof item.size === "string" ? sizeWorthNaming(item.size) : null;
      const quantity = Math.max(1, Number(item.quantity ?? item.qty ?? 1) || 1);
      return { name, size, quantity };
    })
    .filter((line) => line.name);
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/**
 * Today's list (one card per client, the reason they asked for first) and, apart, the clients a
 * suggestion could reach once they agree: past buyers who never said yes or no.
 */
export function outreachToday(input: OutreachInput): {
  today: OutreachCard[];
  askConsent: OutreachCard[];
} {
  const { now } = input;
  const byContact = new Map<string, OutreachCustomer>();
  const byId = new Map<string, OutreachCustomer>();
  for (const customer of input.customers) {
    byId.set(customer.id, customer);
    const contact = outreachContact(customer.phone);
    if (contact && !byContact.has(contact)) byContact.set(contact, customer);
  }

  const sentRecently = new Set<string>();
  const putAway = new Set<string>();
  const askedRecently = new Set<string>();
  for (const entry of input.log) {
    const age = now - time(entry.at);
    if (!(age >= 0)) continue;
    if (entry.kind === "sent" && entry.reason === "ask_consent" && age < ASK_AGAIN_DAYS * DAY) {
      askedRecently.add(entry.contact);
    }
    if (entry.kind === "sent" && age < QUIET_DAYS * DAY) sentRecently.add(entry.contact);
    if (entry.kind === "skipped" && age < QUIET_DAYS * DAY) {
      putAway.add(`${entry.contact}:${entry.reason}`);
    }
  }

  const candidates: OutreachCard[] = [];
  const offer = (card: OutreachCard) => {
    if (!card.contact) return;
    const customer =
      byContact.get(card.contact) ?? (card.customerId ? byId.get(card.customerId) : undefined);
    if (customer?.opted_out_at) return;
    if (SUGGESTION_REASONS.includes(card.reason) && customer?.marketing_consent !== true) return;
    if (putAway.has(`${card.contact}:${card.reason}`)) return;
    candidates.push(card);
  };

  // 1. A size they asked to be told about is back.
  for (const group of waitingGroups(input.requests, input.products, input.variants)) {
    if (!group.backInStock || !group.product) continue;
    for (const request of group.requests) {
      if (request.channel !== "whatsapp" || request.notified_at) continue;
      const contact = outreachContact(request.contact);
      const customer = byContact.get(contact);
      offer({
        key: `back_in_stock:${request.id}`,
        reason: "back_in_stock",
        contact,
        customerId: customer?.id ?? null,
        name: customer?.name ?? null,
        lang: request.lang === "en" ? "en" : "ar",
        since: request.created_at,
        detail: {
          reason: "back_in_stock",
          requestId: request.id,
          product: group.product as OutreachProduct,
          option: group.option,
        },
      });
    }
  }

  // 2. The cart they left, while they agreed to hear about it.
  for (const cart of input.carts) {
    // Only a cart still open: not ordered (recovered, converted), not emptied by the shopper
    // (expired), not stopped (unsubscribed).
    if (cart.recovered_at || !isOpenCart(cart) || !cart.recovery_token) continue;
    const age = now - time(cart.last_activity_at);
    if (!(age >= CART_FROM && age <= CART_UNTIL)) continue;
    const customer = cart.customer_id ? byId.get(cart.customer_id) : undefined;
    const agreed = cart.marketing_consent === true || customer?.marketing_consent === true;
    const lines = cartLines(cart.cart_items);
    if (!agreed || lines.length === 0) continue;
    const contact = outreachContact(cart.guest_phone || customer?.phone || cart.customers?.phone);
    const name = cart.guest_name || customer?.name || cart.customers?.name || null;
    offer({
      key: `cart:${cart.id}`,
      reason: "cart",
      contact,
      customerId: customer?.id ?? null,
      name,
      lang: guessLang(name),
      since: cart.last_activity_at as string,
      detail: {
        reason: "cart",
        cartId: cart.id,
        lines,
        subtotal: Number(cart.subtotal) || 0,
        currency: cart.currency,
        token: cart.recovery_token,
      },
    });
  }

  // Each client's orders that count as sold, oldest first.
  const ordersOf = new Map<string, OutreachOrder[]>();
  for (const order of input.orders) {
    if (!order.customer_id || !countsAsSold(order.status)) continue;
    const list = ordersOf.get(order.customer_id) ?? [];
    list.push(order);
    ordersOf.set(order.customer_id, list);
  }
  for (const list of ordersOf.values())
    list.sort((a, b) => time(a.created_at) - time(b.created_at));

  const newPieces = input.products
    .filter((product) => {
      const age = now - time(product.created_at);
      return product.is_active !== false && age >= 0 && age <= NEW_PIECE_DAYS * DAY;
    })
    .sort((a, b) => time(b.created_at) - time(a.created_at));
  const variantsOf = new Map<string, WaitedVariant[]>();
  for (const variant of input.variants) {
    const list = variantsOf.get(variant.product_id) ?? [];
    list.push(variant);
    variantsOf.set(variant.product_id, list);
  }
  /** A new piece that can be had in this size now: a ready piece, or made to order while open. */
  const inSize = (product: OutreachProduct, size: string) =>
    (variantsOf.get(product.id) ?? []).some(
      (variant) =>
        variant.size?.trim() === size &&
        ((Number(variant.stock_main) || 0) + (Number(variant.stock_incubator) || 0) > 0 ||
          (product.is_made_to_order === true && !madeToOrderLimit(product).closed)),
    );

  for (const [customerId, orders] of ordersOf) {
    const customer = byId.get(customerId);
    if (!customer) continue;
    const contact = outreachContact(customer.phone);
    const lang = guessLang(customer.name);
    const base = { contact, customerId, name: customer.name, lang };
    const first = orders[0];
    const last = orders[orders.length - 1];

    // 3. How their first order went.
    const handedOver = first.delivered_at || first.completed_at;
    const sinceHandOver = now - time(handedOver);
    if (
      orders.length === 1 &&
      handedOver &&
      sinceHandOver >= AFTERCARE_FROM &&
      sinceHandOver <= AFTERCARE_UNTIL
    ) {
      offer({
        ...base,
        key: `aftercare:${first.id}`,
        reason: "aftercare",
        since: handedOver,
        detail: { reason: "aftercare", orderId: first.id, handedOverAt: handedOver },
      });
    }

    // 4. New pieces in a size they wear (the size they bought most).
    const sizeCounts = new Map<string, number>();
    const bought = new Set<string>();
    for (const order of orders) {
      for (const item of order.items) {
        if (item.product_id) bought.add(item.product_id);
        const size = sizeWorthNaming(item.size);
        if (size) sizeCounts.set(size, (sizeCounts.get(size) ?? 0) + 1);
      }
    }
    const sizes = [...sizeCounts.entries()].sort((a, b) => b[1] - a[1]).map(([size]) => size);
    for (const size of sizes) {
      const products = newPieces
        .filter((product) => !bought.has(product.id) && inSize(product, size))
        .slice(0, NEW_PIECES_NAMED);
      if (products.length === 0) continue;
      offer({
        ...base,
        key: `new_in_size:${customerId}:${size}`,
        reason: "new_in_size",
        since: products[0].created_at as string,
        detail: { reason: "new_in_size", size, products },
      });
      break;
    }

    // 5. Past their own usual gap between orders.
    if (orders.length >= 2) {
      const gaps = orders
        .slice(1)
        .map((order, i) => (time(order.created_at) - time(orders[i].created_at)) / DAY);
      const usual = median(gaps);
      const away = (now - time(last.created_at)) / DAY;
      if (away >= Math.max(usual * DUE_FACTOR, DUE_MIN_DAYS) && away <= DUE_MAX_DAYS) {
        offer({
          ...base,
          key: `due_back:${customerId}:${last.id}`,
          reason: "due_back",
          since: last.created_at,
          detail: {
            reason: "due_back",
            lastOrderAt: last.created_at,
            usualGapDays: Math.round(usual),
            orders: orders.length,
          },
        });
      }
    }
  }

  // One card per client: the reason they asked for first, the longest waiting first.
  const best = new Map<string, OutreachCard>();
  for (const card of candidates) {
    if (sentRecently.has(card.contact)) continue;
    const held = best.get(card.contact);
    if (
      !held ||
      PRIORITY[card.reason] < PRIORITY[held.reason] ||
      (PRIORITY[card.reason] === PRIORITY[held.reason] && time(card.since) < time(held.since))
    ) {
      best.set(card.contact, card);
    }
  }
  const today = [...best.values()].sort(
    (a, b) => PRIORITY[a.reason] - PRIORITY[b.reason] || time(a.since) - time(b.since),
  );

  // Past buyers in the last year who never said yes or no, newest buyers first.
  const askConsent: OutreachCard[] = [];
  for (const [customerId, orders] of ordersOf) {
    const customer = byId.get(customerId);
    if (!customer || customer.marketing_consent === true || customer.opted_out_at) continue;
    const contact = outreachContact(customer.phone);
    const last = orders[orders.length - 1];
    if (!contact || best.has(contact) || sentRecently.has(contact) || askedRecently.has(contact))
      continue;
    if (putAway.has(`${contact}:ask_consent`)) continue;
    if (now - time(last.created_at) > DUE_MAX_DAYS * DAY) continue;
    askConsent.push({
      key: `ask_consent:${customerId}`,
      reason: "ask_consent",
      contact,
      customerId,
      name: customer.name,
      lang: guessLang(customer.name),
      since: last.created_at,
      detail: { reason: "ask_consent", orders: orders.length },
    });
  }
  askConsent.sort((a, b) => time(b.since) - time(a.since));

  return { today, askConsent };
}
