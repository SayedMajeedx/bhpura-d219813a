import { createFileRoute } from "@tanstack/react-router";
import { AccountPage } from "@/features/storefront-account/components/AccountPage";

export const Route = createFileRoute("/$slug/account")({
  component: AccountPage,
});
