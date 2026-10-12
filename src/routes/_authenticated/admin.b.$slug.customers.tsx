import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { CustomersPage } from "@/features/customers/components/CustomersPage";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/customers")({
  component: CustomersRoute,
});

function CustomersRoute() {
  const { slug } = Route.useParams();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const listPath = `/admin/b/${encodeURIComponent(slug)}/customers`;
  if (pathname.replace(/\/+$/, "") !== listPath) return <Outlet />;
  return <CustomersPage slug={slug} />;
}
