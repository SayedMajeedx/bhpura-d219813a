import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { giftOrderQueries } from "@/lib/data/gift-orders";
import {
  addonName,
  addonsPayload,
  addonsTotal,
  chosenAddonLines,
  type ChosenAddons,
} from "@/lib/gift-addons";
import {
  DEFAULT_GIFT_OPTIONS,
  giftCardFee,
  giftHasCard,
  giftPayload,
  type GiftCardTone,
} from "@/lib/gift-order";

/**
 * The checkout's gift order: what the store offers (`storefront_gift_order_options` and its
 * add-ons, `storefront_gift_addons`), what the shopper chose beside the recipient and the message
 * the form already holds (the message card, its tone, who it is from, the add-ons), what they add
 * to the order and what goes to the order builder. The database prices the card and the add-ons
 * and holds the store's switches; this is the checkout's reading.
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
  // The store's add-ons, read once the shopper makes the order a gift.
  const addons = useQuery(giftOrderQueries.addons(slug, offered && isGift)).data ?? [];
  const [chosen, setChosen] = useState<ChosenAddons>({});
  const toggleAddon = (id: string) =>
    setChosen((now) => ({ ...now, [id]: (now[id] ?? 0) > 0 ? 0 : 1 }));
  const addonLines = choice.isGift ? chosenAddonLines(chosen, addons) : [];
  const cardFee = giftCardFee(choice, options);
  const addonsFee = choice.isGift ? addonsTotal(chosen, addons) : 0;

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
    /** The store's add-ons (a bouquet), and what was chosen of them. */
    addons,
    chosen,
    toggleAddon,
    /** What the card adds to the subtotal. */
    cardFee,
    /** The chosen add-ons, each with how many. */
    addonLines,
    /** What the card and the add-ons add to the subtotal. */
    fee: Math.round((cardFee + addonsFee) * 1000) / 1000,
    /** A gift order of a store that asks for gifts to be paid first: no cash on delivery. */
    prepaid: choice.isGift && options.prepaid,
    payload: giftPayload(choice, options, choice.isGift ? addonsPayload(chosen, addons) : []),
  };
}

export type CheckoutGift = ReturnType<typeof useCheckoutGift>;

/** What the gift adds, a line each for the order's summary: the card, then each add-on. */
export function giftSummaryLines(gift: CheckoutGift, lang: "ar" | "en") {
  return [
    ...(gift.cardFee > 0
      ? [
          {
            key: "card",
            label: lang === "ar" ? "بطاقة إهداء" : "Gift message card",
            amount: gift.cardFee,
          },
        ]
      : []),
    ...gift.addonLines.map((line) => ({
      key: line.addon.id,
      label:
        line.quantity > 1
          ? `${addonName(line.addon, lang)} × ${line.quantity}`
          : addonName(line.addon, lang),
      amount: line.addon.price * line.quantity,
    })),
  ];
}
