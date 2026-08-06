import * as React from "react";
import { type LucideIcon, PackageOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { OsSurface } from "./os-surface";

export interface OsEmptyStateProps {
  icon?: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}

export function OsEmptyState({
  icon: Icon = PackageOpen,
  title,
  description,
  action,
  className,
  compact = false,
}: OsEmptyStateProps) {
  return (
    <OsSurface
      variant="glass"
      radius="panel"
      className={cn(
        "flex flex-col items-center justify-center text-center mx-auto border border-dashed border-border/70 bg-card/50 shadow-xs",
        compact ? "p-6 sm:p-8 max-w-sm my-3" : "p-8 sm:p-12 max-w-md my-6",
        className,
      )}
    >
      <div
        className={cn(
          "flex items-center justify-center rounded-2xl bg-muted/60 text-muted-foreground border border-border/50 shadow-xs",
          compact ? "h-11 w-11 mb-3" : "h-14 w-14 mb-4",
        )}
      >
        <Icon className={compact ? "h-5 w-5 stroke-[1.5]" : "h-7 w-7 stroke-[1.5]"} />
      </div>

      <h3
        className={cn(
          "font-bold font-heading text-foreground tracking-tight",
          compact ? "text-base mb-1" : "text-lg mb-1.5",
        )}
      >
        {title}
      </h3>

      {description && (
        <p
          className={cn(
            "text-muted-foreground leading-relaxed max-w-xs",
            compact ? "text-xs mb-3" : "text-xs sm:text-sm mb-5",
          )}
        >
          {description}
        </p>
      )}

      {action && <div className="mt-1 flex items-center justify-center">{action}</div>}
    </OsSurface>
  );
}
