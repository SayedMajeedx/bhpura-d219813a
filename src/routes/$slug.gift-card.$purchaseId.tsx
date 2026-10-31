import { createFileRoute } from "@tanstack/react-router";
import { GiftCardPurchasePage } from "@/features/gift-card-shop/components/GiftCardPurchasePage";

/**
 * A gift card purchase's own page: its code once it is paid. Opened with the purchase's token,
 * which only the buyer's browser was given, and kept out of search engines.
 */
export const Route = createFileRoute("/$slug/gift-card/$purchaseId")({
  validateSearch: (search: Record<string, unknown>): { t?: string; payment?: string } => ({
    ...(typeof search.t === "string" && search.t.length <= 80 ? { t: search.t } : {}),
    ...(search.payment === "failed" ? { payment: "failed" } : {}),
  }),
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  component: PurchaseRoute,
});

function PurchaseRoute() {
  const { purchaseId } = Route.useParams();
  const search = Route.useSearch();
  return (
    <GiftCardPurchasePage
      purchaseId={purchaseId}
      token={search.t ?? ""}
      paymentFailed={search.payment === "failed"}
    />
  );
}
