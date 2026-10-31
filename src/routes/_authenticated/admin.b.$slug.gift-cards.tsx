import { createFileRoute } from "@tanstack/react-router";
import { GiftCardsPage } from "@/features/gift-cards/components/GiftCardsPage";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/gift-cards")({
  component: GiftCardsPage,
});
