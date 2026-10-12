import { createFileRoute } from "@tanstack/react-router";
import { IncubatorsPage } from "@/features/incubators/components/IncubatorsPage";

/**
 * Incubators and consignment, for staff who manage inventory (`src/lib/page-access.ts`, held by
 * the admin layout's guard). The page itself is in `src/features/incubators/`; this route only
 * mounts it.
 */
export const Route = createFileRoute("/_authenticated/admin/b/$slug/incubators")({
  component: IncubatorsPage,
});
