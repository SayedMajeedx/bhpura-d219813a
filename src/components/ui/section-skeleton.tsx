import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { pageLanguage } from "@/lib/page-language";

/**
 * A section's shape while it loads: a heading line and a few cards of lines where its rows will
 * sit, so the page keeps its layout and nothing jumps when the content arrives. A spinner in an
 * empty box said only "wait" (the shopper's account, the booking pages, a return's page).
 * Spinners stay for a button that is working and an import that reports its progress.
 */
export function SectionSkeleton({
  rows = 3,
  heading = true,
  className,
}: {
  /** How many cards of lines stand in for the content. */
  rows?: number;
  /** A line for the section's heading above the cards. */
  heading?: boolean;
  className?: string;
}) {
  const ar = pageLanguage() === "ar";
  return (
    <div
      role="status"
      aria-label={ar ? "جارٍ التحميل" : "Loading"}
      className={cn("w-full space-y-3 py-4", className)}
    >
      {heading && <Skeleton className="h-5 w-40" />}
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="space-y-2 rounded-xl border border-border-subtle p-4">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      ))}
    </div>
  );
}
