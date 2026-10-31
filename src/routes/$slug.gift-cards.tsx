import { createFileRoute } from "@tanstack/react-router";
import { GiftCardShopPage } from "@/features/gift-card-shop/components/GiftCardShopPage";

/** Buying a gift card from the store (step four of docs/gift-cards-plan.md). */
export const Route = createFileRoute("/$slug/gift-cards")({
  component: GiftCardShopPage,
});
