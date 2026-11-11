import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { giftOrderQueries } from "@/lib/data/gift-orders";
import {
  DEFAULT_GIFT_OPTIONS,
  giftCardFee,
  giftHasCard,
  giftPayload,
  type GiftCardTone,
} from "@/lib/gift-order";

/**
 * The checkout's gift order: what the store offers (`storefront_gift_order_options`), what the
 * shopper chose beside the recipient and the message the form already holds (the message card,
 * its tone, who it is from), what the card adds to the order and what goes to the order builder.
 * The database prices the card and holds the store's switches; this is the checkout's reading.
 */
export function useCheckoutGift({
  slug,
  isGift,
  recipient,
  message,
  enabled,
}: {
  slug: string;
  isGift: boolean;
  recipient: string;
  message: string;
  /** False where an order is a booking: a booking is not a gift parcel. */
  enabled: boolean;
}) {
  const options = useQuery(giftOrderQueries.storefront(slug, enabled)).data ?? DEFAULT_GIFT_OPTIONS;
  const [withCard, setWithCard] = useState(true);
  const [tone, setTone] = useState<GiftCardTone>("brand");
  const [from, setFrom] = useState("");
  const offered = enabled && options.enabled;
  const choice = { isGift: isGift && offered, recipient, message, from, withCard, tone };

  return {
    options,
    /** The store takes gift orders here. */
    offered,
    withCard,
    setWithCard,
    tone,
    setTone,
    from,
    setFrom,
    /** This order carries the message card. */
    hasCard: giftHasCard(choice, options),
    /** What the card adds to the subtotal. */
    fee: giftCardFee(choice, options),
    /** A gift order of a store that asks for gifts to be paid first: no cash on delivery. */
    prepaid: choice.isGift && options.prepaid,
    payload: giftPayload(choice, options),
  };
}

export type CheckoutGift = ReturnType<typeof useCheckoutGift>;
