import * as React from "react";
import { cn } from "@/lib/utils";
import { segmentTab, storeSegmentTab } from "@/components/ui/segmented";

/**
 * One tab of a tab bar built by hand (segmented.ts), in the admin's look or the store's. It is a
 * plain button with the bar's classes for its state: the bar says which state attribute it reads
 * (`aria-pressed`, `aria-selected` with `role="tab"`, `aria-current`, `data-active`), as
 * `TabsPill` finds the chosen tab by it. A bar of Radix tabs is `TabsList` / `TabsTrigger`.
 */
export const SegmentTab = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    /** The chosen tab. */
    active: boolean;
    /** The admin's look, or the store's own on a storefront page. */
    look?: "admin" | "store";
    /** The admin's tab holding work waiting on the team (segmented.ts). */
    urgent?: boolean;
  }
>(({ active, look = "admin", urgent = false, className, type = "button", ...props }, ref) => (
  <button
    ref={ref}
    type={type}
    className={cn(
      look === "store" ? storeSegmentTab(active) : segmentTab(active, urgent),
      className,
    )}
    {...props}
  />
));
SegmentTab.displayName = "SegmentTab";
