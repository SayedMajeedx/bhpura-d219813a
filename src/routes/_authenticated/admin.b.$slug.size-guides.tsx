import { lazy, Suspense } from "react";
import { SectionSkeleton } from "@/components/ui/section-skeleton";
import { createFileRoute } from "@tanstack/react-router";

const SizeGuidesStudioPage = lazy(
  () => import("@/addons/size-guides/components/admin/SizeGuideStudioPage"),
);

export const Route = createFileRoute("/_authenticated/admin/b/$slug/size-guides")({
  component: SizeGuidesRouteComponent,
});

function SizeGuidesRouteComponent() {
  return (
    <Suspense fallback={<SectionSkeleton rows={3} />}>
      <SizeGuidesStudioPage />
    </Suspense>
  );
}
