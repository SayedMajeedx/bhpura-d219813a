import { createFileRoute } from "@tanstack/react-router";
import { GiveawaysPageView } from "@/features/giveaways/components/GiveawaysPageView";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/giveaways")({
  component: GiveawaysPageView,
});
