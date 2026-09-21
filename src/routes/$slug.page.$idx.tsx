import { createFileRoute, notFound } from "@tanstack/react-router";
import { useStorefront } from "@/lib/storefront-context";
import { PageMissing, StorefrontPageContent } from "@/components/storefront/StorefrontPageContent";

export const Route = createFileRoute("/$slug/page/$idx")({
  component: PageView,
  notFoundComponent: PageMissing,
});

function PageView() {
  const { idx } = Route.useParams();
  const n = Number(idx);
  const { settings } = useStorefront();
  if (!Number.isInteger(n) || n < 1 || n > settings.pages.length) throw notFound();

  const page = settings.pages[n - 1];
  return <StorefrontPageContent page={page} />;
}
