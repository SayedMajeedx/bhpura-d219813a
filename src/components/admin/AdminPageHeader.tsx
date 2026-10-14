import React from "react";
import { Loader2, type LucideIcon } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The heading of an admin page: its title with its counts, a line saying what
 * the page is for, and its actions. On a phone it is one row (title and counts
 * at the reading start, actions at the end) and the line is left out: stacked,
 * a page's heading took 121 to 167px before its first order, product or
 * customer. From `sm` up it is the card it always was.
 */
export function AdminPageHeader({
  icon: Icon,
  title,
  headingProps,
  badges,
  description,
  actions,
}: {
  icon: LucideIcon;
  title: React.ReactNode;
  /** The h1's own attributes (`data-route-heading`, `tabIndex` for focus after navigation). */
  headingProps?: React.HTMLAttributes<HTMLHeadingElement> & Record<`data-${string}`, string>;
  /** Counts and marks beside the title. */
  badges?: React.ReactNode;
  description?: React.ReactNode;
  /** The page's main action first, then any more. */
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-border-subtle bg-card p-3 shadow-2xs sm:p-4">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary sm:flex">
          <Icon className="h-4.5 w-4.5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <h1
              {...headingProps}
              className="min-w-0 break-words text-lg font-bold tracking-tight text-foreground sm:text-2xl"
            >
              {title}
            </h1>
            {badges}
          </div>
          {description && (
            <p className="hidden text-xs leading-relaxed text-muted-foreground sm:block">
              {description}
            </p>
          )}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

/** A count beside a page's title ("7 orders"). */
export function AdminPageCount({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
      {children}
    </span>
  );
}

/**
 * An action in a page's heading. On a phone it shares the row with the title,
 * so the main action takes a short label (`short`, "New") and a secondary one
 * shows only its icon (`iconOnPhone`); the full label stays its name for a
 * screen reader, and is what a wider screen shows.
 */
export function AdminPageAction({
  icon: Icon,
  label,
  short,
  iconOnPhone = false,
  busy = false,
  className,
  ...props
}: {
  icon: LucideIcon;
  label: string;
  short?: string;
  iconOnPhone?: boolean;
  /** Shows a spinner in place of the icon while the action runs. */
  busy?: boolean;
} & Omit<ButtonProps, "children">) {
  const compact = iconOnPhone || Boolean(short);
  return (
    <Button
      type="button"
      aria-label={compact ? label : undefined}
      className={cn(
        "h-9 gap-1.5 px-3 text-xs font-bold shadow-2xs sm:px-3.5",
        iconOnPhone && "w-9 px-0 sm:w-auto sm:px-3.5",
        className,
      )}
      {...props}
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <Icon className="h-4 w-4" aria-hidden="true" />
      )}
      {iconOnPhone ? (
        <span className="hidden sm:inline">{label}</span>
      ) : short ? (
        <>
          <span className="sm:hidden">{short}</span>
          <span className="hidden sm:inline">{label}</span>
        </>
      ) : (
        <span>{label}</span>
      )}
    </Button>
  );
}
