import { createFileRoute } from "@tanstack/react-router";
import { StorefrontBookingPage } from "@/features/storefront-booking/components/StorefrontBookingPage";

/** The service to book and, from its page, the length the customer picked. */
type BookSearch = { service?: string; minutes?: number };

export const Route = createFileRoute("/$slug/book")({
  validateSearch: (search): BookSearch => {
    const minutes = Number(search.minutes);
    return {
      service: typeof search.service === "string" ? search.service : undefined,
      minutes: Number.isInteger(minutes) && minutes >= 15 && minutes <= 1440 ? minutes : undefined,
    };
  },
  component: BookRoute,
});

function BookRoute() {
  const { service, minutes } = Route.useSearch();
  return <StorefrontBookingPage initialService={service} initialMinutes={minutes} />;
}
