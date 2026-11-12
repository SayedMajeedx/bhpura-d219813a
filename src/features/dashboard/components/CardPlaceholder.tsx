import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * A dashboard card's place while its own data comes: the card's frame at its usual height with
 * two lines, so the cards under it do not move when it arrives. The visits and the store's
 * status once drew nothing until then, and each pushed the page down as it landed (the admin
 * audit of 2026-11-12: a layout shift of 0.13 on a phone).
 */
export function CardPlaceholder({ label, className }: { label: string; className: string }) {
  return (
    <div
      role="status"
      aria-label={label}
      className={cn(
        "space-y-2 rounded-2xl border border-border bg-card px-4 py-3.5 shadow-2xs",
        className,
      )}
    >
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  );
}
