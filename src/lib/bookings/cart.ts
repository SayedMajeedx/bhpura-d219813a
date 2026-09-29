import type { CartItem } from "@/lib/storefront-context";

/**
 * A booking on its way through checkout. The storefront holds the day
 * (hold_booking), puts the booked services in the cart carrying this, and the
 * checkout finishes the booking with the order (place_booking_order).
 */
export type CartBooking = {
  id: string;
  /** The secret the checkout finishes the booking with. */
  token: string;
  reference: string;
  day: string;
  start: string;
  durationMinutes: number;
  /** When the day stops being held for the customer. */
  expiresAt: string;
};

/** What hold_booking returns. */
export type BookingHold = {
  booking_id: string;
  hold_token: string;
  reference: string;
  event_date: string;
  hold_expires_at: string;
  total: number;
  items: Array<{ product_id: string; variant_id: string; quantity: number; unit_price: number }>;
};

/** The booking the cart is finishing, if any (one at a time). */
export function bookingOfCart(cart: readonly CartItem[]): CartBooking | null {
  return cart.find((line) => line.booking)?.booking ?? null;
}

type ServiceForCart = {
  id: string;
  name: string;
  name_ar: string | null;
  name_en: string | null;
  image_url: string | null;
};

/**
 * The cart lines for a held booking: each booked service at the price the
 * database set, carrying the booking. Services are made to order, so their
 * lines are never limited by stock.
 */
export function bookingCartLines(
  hold: BookingHold,
  booking: Omit<CartBooking, "id" | "token" | "reference" | "expiresAt">,
  services: readonly ServiceForCart[],
): CartItem[] {
  const cartBooking: CartBooking = {
    ...booking,
    id: hold.booking_id,
    token: hold.hold_token,
    reference: hold.reference,
    expiresAt: hold.hold_expires_at,
  };
  return hold.items.map((item) => {
    const service = services.find((candidate) => candidate.id === item.product_id);
    return {
      cart_line_id: `booking:${hold.booking_id}:${item.variant_id}`,
      variant_id: item.variant_id,
      product_id: item.product_id,
      name: service?.name ?? "",
      name_ar: service?.name_ar ?? null,
      name_en: service?.name_en ?? null,
      image: service?.image_url ?? null,
      price: Number(item.unit_price),
      size: null,
      color: null,
      qty: item.quantity,
      max_stock: item.quantity,
      booking: cartBooking,
    };
  });
}

/** Seconds left on the hold (0 once it has run out). */
export function holdSecondsLeft(expiresAt: string, now: Date = new Date()): number {
  return Math.max(0, Math.floor((new Date(expiresAt).getTime() - now.getTime()) / 1000));
}
