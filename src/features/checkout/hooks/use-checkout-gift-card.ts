import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { checkGiftCard, storeTakesGiftCards } from "@/lib/gift-card-checkout.functions";
import { type AppliedGiftCard, typedGiftCode } from "@/features/checkout/lib/gift-card-pay";
import { forgetGiftCode, rememberedGiftCode } from "@/lib/gift-link";

export type GiftCardRefusal = "not_found" | "currency" | "tries" | null;

/** A code looked up with the store: the card and its balance, or why it was refused. */
async function lookUp(
  slug: string,
  code: string,
  currency: string,
): Promise<{ card: AppliedGiftCard } | { refusal: Exclude<GiftCardRefusal, null> }> {
  const found = await checkGiftCard({ data: { slug, code } });
  if (!found.found) return { refusal: found.limited ? "tries" : "not_found" };
  if (found.currency && found.currency.toUpperCase() !== currency.toUpperCase()) {
    return { refusal: "currency" };
  }
  return { card: { code, balance: found.balance, currency: found.currency || currency } };
}

/**
 * The checkout's gift card: the code typed, the card once its balance is known (`checkGiftCard`),
 * and why one was refused. Nothing is taken until the order is placed (`usePlaceOrder`). A gift
 * opened in this tab ("Shop with your card" on its page, `rememberGiftCode`) is filled in and
 * applied by itself once the store is known to take cards.
 */
export function useCheckoutGiftCard(brand: { id: string; slug: string }, currency: string) {
  const slug = brand.slug;
  const offered = useQuery({
    queryKey: ["storefront", "gift-cards-offered", brand.id],
    queryFn: () => storeTakesGiftCards({ data: { brandId: brand.id } }),
    staleTime: 5 * 60_000,
  });
  const [remembered] = useState(() => typedGiftCode(rememberedGiftCode(slug) ?? ""));
  const [input, setInputRaw] = useState(remembered);
  const [card, setCard] = useState<AppliedGiftCard | null>(null);
  const [checking, setChecking] = useState(false);
  const [refusal, setRefusal] = useState<GiftCardRefusal>(null);

  const takesCards = offered.data === true;
  useEffect(() => {
    if (!takesCards || !remembered) return;
    let live = true;
    lookUp(slug, remembered, currency)
      .then((result) => {
        if (live && "card" in result) setCard(result.card);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [takesCards, remembered, slug, currency]);

  const setInput = (value: string) => {
    setInputRaw(typedGiftCode(value));
    setRefusal(null);
  };

  const apply = async () => {
    const code = typedGiftCode(input);
    if (code.replace(/-/g, "").length < 4 || checking) return;
    setChecking(true);
    setRefusal(null);
    try {
      const result = await lookUp(slug, code, currency);
      if ("card" in result) setCard(result.card);
      else setRefusal(result.refusal);
    } catch (error) {
      console.warn("[checkout] gift card lookup failed", error);
      setRefusal("not_found");
    } finally {
      setChecking(false);
    }
  };

  const remove = () => {
    forgetGiftCode(slug);
    setCard(null);
    setInputRaw("");
    setRefusal(null);
  };

  return {
    offered: offered.data === true,
    input,
    setInput,
    card,
    checking,
    refusal,
    apply,
    remove,
  };
}

export type CheckoutGiftCard = ReturnType<typeof useCheckoutGiftCard>;
