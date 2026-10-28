import { cn } from "@/lib/utils";
import type { Order } from "@/features/orders/types";
import type { OrderDetailData } from "@/features/orders/hooks/use-order-detail-data";
import type { useBenefitReview } from "@/features/orders/hooks/use-benefit-review";
import { useExpectedAdvance } from "@/features/orders/hooks/use-expected-advance";
import { receiptOnTop } from "@/features/orders/lib/transfer-approval";
import { BenefitReceiptReview } from "@/features/orders/components/BenefitReceiptReview";

/**
 * A transfer receipt still to be checked, at the top of the order: it is the one thing the team
 * must decide on, and below a long list of lines it sat out of sight. Once the payment is
 * approved the receipt goes down to the order's money card, where it is only a record.
 */
export function PendingTransferReview({
  benefit,
  currency,
  lang,
  mobileTab,
  order,
  productsQ,
  receiptViewQ,
}: {
  benefit: ReturnType<typeof useBenefitReview>;
  currency: string;
  lang: "ar" | "en";
  mobileTab: "items" | "customer" | "activity";
  order: Order;
  productsQ: OrderDetailData["productsQ"];
  receiptViewQ: OrderDetailData["receiptViewQ"];
}) {
  const expected = useExpectedAdvance(order, productsQ.data);
  if (!receiptOnTop(order)) return null;
  return (
    <div className={cn(mobileTab !== "items" && "hidden sm:block")}>
      <BenefitReceiptReview
        {...benefit}
        currency={currency}
        expected={expected}
        lang={lang}
        order={order}
        receiptViewQ={receiptViewQ}
      />
    </div>
  );
}
