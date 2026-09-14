import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

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
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <SizeGuideStandalonePage />
    </Suspense>
  );
}
