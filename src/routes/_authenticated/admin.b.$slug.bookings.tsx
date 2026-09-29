import { createFileRoute } from "@tanstack/react-router";
import { BookingsPageView } from "@/features/bookings/components/BookingsPageView";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/bookings")({
  component: BookingsPageView,
});
