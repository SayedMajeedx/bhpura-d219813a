import { discountLabel, type DiscountResult } from "@/lib/bookings/discounts";

/**
 * A shopper's booking meets two kinds of offer (migration 20261028120000, the owner's decision of
 * 2026-10-27): the store's booking offers (early bird, last minute: `bestDiscount`) and its
 * automatic offers on the services (`store_offers`, priced by `storefront_offers_preview`). The
 * one that saves more is the booking's discount, a booking offer on a tie: the database picks it
 * when the day is held (`apply_booking_discount`), and these are its twins for the booking page
 * and the checkout.
 */

export type BookingOffer = {
  amount: number;
  label: string;
  /** A store's automatic offer, which meets a typed code by the store's rule (`offers_combine`). */
  fromStoreOffer: boolean;
};

export type OffersCombine = "best" | "code_first" | "together";

/** The better of the booking offer and the store's offer, as `apply_booking_discount` picks it. */
export function betterBookingOffer(
  bookingOffer: DiscountResult | null,
  storeOffer: { amount: number; name: string } | null,
  isAr: boolean,
): BookingOffer | null {
  const rule = bookingOffer && bookingOffer.amount > 0 ? bookingOffer.amount : 0;
  const store = storeOffer && storeOffer.amount > 0 ? storeOffer.amount : 0;
  if (store > rule && storeOffer) {
    return {
      amount: store,
      label: storeOffer.name.trim() || (isAr ? "عرض المتجر" : "Store offer"),
      fromStoreOffer: true,
    };
  }
  if (rule > 0 && bookingOffer) {
    return { amount: rule, label: discountLabel(bookingOffer, isAr), fromStoreOffer: false };
  }
  return null;
}

/**
 * The booking's discount and a typed code together, as `place_booking_order` settles them: a
 * booking offer adds to the code; a store offer meets it by the store's rule (whichever saves more,
 * the code on a tie; the code first; or both).
 */
export function bookingWithCode(args: {
  booking: number;
  fromStoreOffer: boolean;
  code: number;
  mode: OffersCombine | null | undefined;
}): { booking: number; code: number; codeDropped: boolean } {
  const booking = Math.max(args.booking, 0);
  const code = Math.max(args.code, 0);
  if (!args.fromStoreOffer || booking === 0 || code === 0) {
    return { booking, code, codeDropped: false };
  }
  const mode = args.mode ?? "best";
  if (mode === "together") return { booking, code, codeDropped: false };
  if (mode === "code_first") return { booking: 0, code, codeDropped: false };
  return booking > code
    ? { booking, code: 0, codeDropped: true }
    : { booking: 0, code, codeDropped: false };
}
