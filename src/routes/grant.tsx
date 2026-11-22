import { createFileRoute, notFound } from "@tanstack/react-router";
import { fetchPlatformPage } from "@/lib/data/platform-pages";
import { platformPageHead } from "@/lib/platform-pages/page";
import { PlatformPageView } from "@/features/platform-pages/components/PlatformPageView";

/**
 * The grant survey, the platform page `grant` (migration 20261219100000): its words and form are
 * edited in the super admin (`/admin/super/pages`) and its applications read in the page's inbox.
 * The address stays, as it was shared on Instagram.
 */
export const Route = createFileRoute("/grant")({
  loader: async () => {
    const page = await fetchPlatformPage("grant").catch(() => null);
    if (!page) throw notFound();
    return { page };
  },
  head: ({ loaderData }) => platformPageHead(loaderData?.page ?? null, "ar"),
  component: GrantPage,
});

function GrantPage() {
  const { page } = Route.useLoaderData();
  return <PlatformPageView page={page} lang="ar" />;
}
