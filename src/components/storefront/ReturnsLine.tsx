import { RotateCcw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { formatPrice, useStorefront } from "@/lib/storefront-context";
import { returnsQueries } from "@/lib/data/returns";
import { deliveryInfo, returnsSentence } from "@/lib/delivery-info";

/**
 * The store's return terms beside the decision to buy, in its own words: on the product page under
 * the buttons and at checkout above the confirmation. "No returns" sat folded in a section that
 * few open. Nothing is shown when the store wrote nothing.
 */
export function ReturnsLine({ className = "" }: { className?: string }) {
  const { brand, lang, settings } = useStorefront();
  const policy = useQuery({ ...returnsQueries.policy(brand.id), staleTime: 5 * 60_000 });
  const text = returnsSentence(
    deliveryInfo({
      settings,
      lang,
      returnPolicy: policy.data ?? null,
      pages: settings?.pages ?? null,
      formatMoney: (amount) => formatPrice(amount, settings?.currency || "BHD", lang),
    }),
  );
  if (!text) return null;
  return (
    <p
      className={`flex items-start gap-2 text-xs leading-relaxed text-muted-foreground ${className}`}
    >
      <RotateCcw className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{text}</span>
    </p>
  );
}
