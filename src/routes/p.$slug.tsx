import { createFileRoute, notFound } from "@tanstack/react-router";
import { fetchPlatformPage } from "@/lib/data/platform-pages";
import { platformPageHead, type Lang } from "@/lib/platform-pages/page";
import { PlatformPageView } from "@/features/platform-pages/components/PlatformPageView";

/**
 * A page of Boutq's own, made in the super admin (`boutq.store/p/<slug>`): a campaign, a survey,
 * a form. Read on the server, so a shared link previews with its own title and picture.
 */
export const Route = createFileRoute("/p/$slug")({
  validateSearch: (search: Record<string, unknown>): { lang?: "en" } =>
    search.lang === "en" ? { lang: "en" } : {},
  loaderDeps: ({ search }) => ({ lang: search.lang }),
  loader: async ({ params, deps }) => {
    const page = await fetchPlatformPage(params.slug.toLowerCase()).catch(() => null);
    if (!page) throw notFound();
    return { page, lang: (deps.lang ?? "ar") as Lang };
  },
  head: ({ loaderData }) => platformPageHead(loaderData?.page ?? null, loaderData?.lang ?? "ar"),
  component: PlatformPageRoute,
});

function PlatformPageRoute() {
  const { page, lang } = Route.useLoaderData();
  return <PlatformPageView page={page} lang={lang} />;
}
