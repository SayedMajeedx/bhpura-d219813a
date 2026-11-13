import { useEffect, useRef } from "react";
import { recordCheckoutProgress } from "@/lib/storefront-analytics";
import { checkoutProgress } from "@/features/checkout/lib/checkout-progress";

type Input = Parameters<typeof checkoutProgress>[0];

/** How long the shopper's typing settles before checkout's progress is sent again. */
export const PROGRESS_SETTLE_MS = 1500;

/**
 * Sends how far into checkout the shopper is and what stands in the way of ordering, so the store
 * can see where checkout loses people (`record_checkout_step`): at once when the page opens, then
 * once the typing settles whenever either changes. Nothing the shopper typed is sent.
 */
export function useCheckoutProgress(input: Input, deliveryTimeMissing: boolean, active: boolean) {
  const { part, problem } = checkoutProgress(input, deliveryTimeMissing);
  const sent = useRef<string | null>(null);
  useEffect(() => {
    if (!active) return;
    const key = `${part}:${problem ?? ""}`;
    if (sent.current === key) return;
    const send = () => {
      sent.current = key;
      recordCheckoutProgress(part, problem);
    };
    if (sent.current === null) {
      send();
      return;
    }
    const timer = window.setTimeout(send, PROGRESS_SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [active, part, problem]);
}
