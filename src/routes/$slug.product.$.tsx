import { createFileRoute } from "@tanstack/react-router";
import { ProductDetail } from "./$slug.product.$id";

export const Route = createFileRoute("/$slug/product/$")({
  component: SplatProductDetail,
});

function SplatProductDetail() {
  const params = Route.useParams() as { _splat?: string };
  return <ProductDetail splatId={params?._splat} />;
}
