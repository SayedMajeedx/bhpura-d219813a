import { createFileRoute, redirect } from "@tanstack/react-router";
import { getStorefrontUrl } from "@/lib/storefront-url";

export const Route = createFileRoute("/b/$slug")({
  beforeLoad: ({ params }) => {
    const targetUrl = getStorefrontUrl(params.slug);
    if (typeof window !== "undefined") {
      window.location.replace(targetUrl);
    }
    throw redirect({
      href: targetUrl,
    });
  },
  component: () => null,
});
