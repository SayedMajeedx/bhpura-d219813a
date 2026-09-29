import { createFileRoute } from "@tanstack/react-router";
import { StorefrontBookingPage } from "@/features/storefront-booking/components/StorefrontBookingPage";

type BookSearch = { service?: string };

export const Route = createFileRoute("/$slug/book")({
  validateSearch: (search): BookSearch => ({
    service: typeof search.service === "string" ? search.service : undefined,
  }),
  component: BookRoute,
});

function BookRoute() {
  const { service } = Route.useSearch();
  return <StorefrontBookingPage initialService={service} />;
}
