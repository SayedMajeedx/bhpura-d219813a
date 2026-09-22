import React, { useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SettingsCollapsibleCardProps {
  id?: string;
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  headerActions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}

export function SettingsCollapsibleCard({
  id,
  title,
  description,
  icon: Icon,
  badge,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange: setControlledOpen,
  headerActions,
  children,
  className,
  contentClassName,
}: SettingsCollapsibleCardProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isOpen = controlledOpen !== undefined ? controlledOpen : uncontrolledOpen;
  const setIsOpen = setControlledOpen !== undefined ? setControlledOpen : setUncontrolledOpen;

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className={cn(
        "rounded-xl border border-border bg-card overflow-hidden shadow-xs transition-all duration-200",
        isOpen ? "ring-1 ring-primary/20 border-primary/30" : "hover:border-border",
        className,
      )}
      id={id}
    >
      <div className="flex items-center justify-between p-3.5 sm:p-4.5 gap-3 select-none">
        <CollapsibleTrigger asChild>
          <div className="flex items-center gap-3 sm:gap-3.5 flex-1 min-w-0 cursor-pointer">
            {Icon && (
              <div
                className={cn(
                  "h-9 w-9 rounded-lg flex items-center justify-center shrink-0 transition-colors",
                  isOpen ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary",
                )}
              >
                <Icon className="h-4 w-4" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-medium text-foreground tracking-tight">
                  {title}
                </h3>
                {badge && <div className="shrink-0">{badge}</div>}
              </div>
              {description && (
                <p className="text-xs text-muted-foreground font-normal line-clamp-1 sm:line-clamp-none mt-0.5">
                  {description}
                </p>
              )}
            </div>
          </div>
        </CollapsibleTrigger>

        <div className="flex items-center gap-2 shrink-0">
          {headerActions}
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              aria-label={isOpen ? "Collapse" : "Expand"}
            >
              <ChevronDown
                className={cn("h-4 w-4 transition-transform duration-200", isOpen && "rotate-180")}
              />
            </button>
          </CollapsibleTrigger>
        </div>
      </div>

      <CollapsibleContent className="data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down overflow-hidden">
        <div className="border-t border-border-subtle" />
        <div className={cn("p-4 sm:p-6", contentClassName)}>{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}
