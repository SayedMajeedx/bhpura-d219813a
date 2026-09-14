import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

const SizeGuidesStudioPage = lazy(
  () => import("@/addons/size-guides/components/admin/SizeGuideStudioPage"),
);

export const Route = createFileRoute("/_authenticated/admin/b/$slug/size-guides")({
  component: SizeGuidesRouteComponent,
});

function SizeGuidesRouteComponent() {
  return (
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <SizeGuidesStudioPage />
    </Suspense>
  );
}
