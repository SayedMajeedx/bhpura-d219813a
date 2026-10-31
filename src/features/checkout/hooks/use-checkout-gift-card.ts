import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { checkGiftCard, storeTakesGiftCards } from "@/lib/gift-card-checkout.functions";
import { type AppliedGiftCard, typedGiftCode } from "@/features/checkout/lib/gift-card-pay";

export type GiftCardRefusal = "not_found" | "currency" | "tries" | null;

/**
 * The checkout's gift card: the code typed, the card once its balance is known (`checkGiftCard`),
 * and why one was refused. Nothing is taken until the order is placed (`usePlaceOrder`).
 */
export function useCheckoutGiftCard(brand: { id: string; slug: string }, currency: string) {
  const slug = brand.slug;
  const offered = useQuery({
    queryKey: ["storefront", "gift-cards-offered", brand.id],
    queryFn: () => storeTakesGiftCards({ data: { brandId: brand.id } }),
    staleTime: 5 * 60_000,
  });
  const [input, setInputRaw] = useState("");
  const [card, setCard] = useState<AppliedGiftCard | null>(null);
  const [checking, setChecking] = useState(false);
  const [refusal, setRefusal] = useState<GiftCardRefusal>(null);

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
      const found = await checkGiftCard({ data: { slug, code } });
      if (!found.found) {
        setRefusal(found.limited ? "tries" : "not_found");
        return;
      }
      if (found.currency && found.currency.toUpperCase() !== currency.toUpperCase()) {
        setRefusal("currency");
        return;
      }
      setCard({ code, balance: found.balance, currency: found.currency || currency });
    } catch (error) {
      console.warn("[checkout] gift card lookup failed", error);
      setRefusal("not_found");
    } finally {
      setChecking(false);
    }
  };

  const remove = () => {
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
