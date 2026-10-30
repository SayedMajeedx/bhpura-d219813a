import { lazy, Suspense } from "react";
import { SectionSkeleton } from "@/components/ui/section-skeleton";
import { createFileRoute } from "@tanstack/react-router";

const SizeGuideStandalonePage = lazy(
  () => import("@/addons/size-guides/components/storefront/SizeGuideStandalonePage"),
);

export const Route = createFileRoute("/$slug/size-guide")({
  head: () => ({
    meta: [
      { title: "دليل المقاسات — Size Guide" },
      { name: "description", content: "دليل المقاسات وجداول القياسات المعتمدة" },
    ],
  }),
  component: SizeGuideStandaloneRouteComponent,
});

function SizeGuideStandaloneRouteComponent() {
  return (
    <Suspense fallback={<SectionSkeleton rows={2} className="mx-auto max-w-3xl px-4" />}>
      <SizeGuideStandalonePage />
    </Suspense>
  );
}
