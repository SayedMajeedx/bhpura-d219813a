import { createFileRoute } from "@tanstack/react-router";
import { GiftPage } from "@/features/gift-card-shop/components/GiftPage";
import { giftHead } from "@/lib/gift-link";

/**
 * A gift card's own page for the person it is given to, opened with the card's share token. Its
 * preview in a chat names the store and nothing of the card; kept out of search engines.
 */
export const Route = createFileRoute("/$slug/gift/$token")({
  head: ({ matches }) => giftHead({ matches }),
  component: GiftRoute,
});

function GiftRoute() {
  const { token } = Route.useParams();
  return <GiftPage token={token} />;
}
