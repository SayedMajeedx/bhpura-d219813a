import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { SectionSkeleton } from "@/components/ui/section-skeleton";

const PostKitPage = lazy(() => import("@/addons/post-kit/components/PostKitPage"));

export const Route = createFileRoute("/_authenticated/admin/b/$slug/content-studio/posts")({
  component: PostKitRoute,
});

/** A private add-on's page: it sends a store without the add-on back to the studio. */
function PostKitRoute() {
  const { slug } = Route.useParams();
  return (
    <Suspense fallback={<SectionSkeleton rows={4} />}>
      <PostKitPage slug={slug} />
    </Suspense>
  );
}
