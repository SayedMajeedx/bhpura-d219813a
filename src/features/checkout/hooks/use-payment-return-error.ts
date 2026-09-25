import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { Storefront } from "@/features/checkout/types";

/**
 * A failed card payment sends the shopper back with ?payment_error (and the
 * order id when the order exists, so paying again reuses it). Reads it once
 * and clears it from the URL.
 */
export function usePaymentReturnError(t: Storefront["t"]) {
  const [paymentErrorState, setPaymentErrorState] = useState<{
    status: string;
    orderId: string;
  } | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const searchParams = new URLSearchParams(window.location.search);
      const paymentError = searchParams.get("payment_error");
      const orderId = searchParams.get("order_id");
      if (paymentError) {
        if (orderId) {
          setPaymentErrorState({ status: paymentError, orderId });
        } else {
          toast.error(
            t(
              "فشلت عملية الدفع بالبطاقة. يرجى التحقق من بيانات البطاقة والمحاولة مرة أخرى.",
              "Card payment failed. Please check your card details and try again.",
            ),
            { duration: 6000 },
          );
        }
        // Clear the query parameter so it doesn't fire again on refresh
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
      }
    }
  }, [mounted, t]);

  return {
    paymentErrorState,
    mounted,
  };
}
