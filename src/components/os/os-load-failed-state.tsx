import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OsEmptyState } from "./os-empty-state";

type LoadableQuery = {
  isLoading: boolean;
  isError: boolean;
  refetch: () => Promise<unknown>;
};

/**
 * One state for the queries a screen needs: loading until all have loaded, and
 * failed when any failed, so a failed load is never shown as empty data.
 */
export function combinedLoadState(queries: LoadableQuery[]): "loading" | "failed" | "ready" {
  if (queries.some((query) => query.isLoading)) return "loading";
  if (queries.some((query) => query.isError)) return "failed";
  return "ready";
}

/** Shown when a screen's data could not be loaded; "Try again" reloads every query. */
export function OsLoadFailedState({
  isAr,
  title,
  description,
  queries,
}: {
  isAr: boolean;
  title: string;
  description: string;
  queries: LoadableQuery[];
}) {
  return (
    <OsEmptyState
      icon={AlertTriangle}
      title={title}
      description={description}
      action={
        <Button
          type="button"
          variant="outline"
          onClick={() => void Promise.all(queries.map((query) => query.refetch()))}
        >
          <RefreshCw className="h-4 w-4 me-1.5" />
          {isAr ? "إعادة المحاولة" : "Try again"}
        </Button>
      }
    />
  );
}
