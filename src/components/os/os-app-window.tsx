import * as React from "react";
import { type LucideIcon, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface OsAppWindowProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  icon?: LucideIcon;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  badge?: React.ReactNode;
  workspaceTabs?: React.ReactNode;
  isFocusMode?: boolean;
  onToggleFocusMode?: () => void;
  pageKey?: string;
  showTitlebar?: boolean;
}

export const OsAppWindow = React.forwardRef<HTMLDivElement, OsAppWindowProps>(
  (
    {
      icon: Icon,
      title,
      subtitle,
      actions,
      badge,
      workspaceTabs,
      isFocusMode = false,
      onToggleFocusMode,
      pageKey,
      showTitlebar = false,
      className,
      children,
      ...props
    },
    ref,
  ) => {
    // The scroll container persists across navigations (only the inner wrapper is keyed),
    // so reset its scroll position when the page changes.
    const scrollerRef = React.useRef<HTMLDivElement>(null);
    React.useEffect(() => {
      scrollerRef.current?.scrollTo({ top: 0 });
    }, [pageKey]);

    return (
      <div
        ref={ref}
        className={cn(
          "os-window-frame relative flex flex-col flex-1 min-w-0 overflow-hidden transition-colors duration-200",
          className,
        )}
        {...props}
      >
        {workspaceTabs}
        {/* Optional Titlebar Region (only if explicitly opted-in) */}
        {showTitlebar && (
          <div className="no-print h-11 px-4 border-b border-border bg-card flex items-center justify-between gap-3 shrink-0 select-none">
            <div className="flex items-center gap-2.5 min-w-0">
              {Icon && (
                <div className="h-6 w-6 rounded-md bg-primary/10 text-primary border border-primary/20 flex items-center justify-center shrink-0 shadow-2xs">
                  <Icon className="h-3.5 w-3.5" />
                </div>
              )}
              <div className="min-w-0 flex items-center gap-2">
                <span className="text-xs font-semibold text-foreground truncate">{title}</span>
                {subtitle && (
                  <span className="hidden md:inline text-xs text-muted-foreground truncate">
                    — {subtitle}
                  </span>
                )}
                {badge}
              </div>
            </div>
            {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
          </div>
        )}

        {/* Floating Focus Mode Exit Pill */}
        {isFocusMode && onToggleFocusMode && (
          <div className="no-print absolute top-3 end-5 z-40 animate-in fade-in duration-200">
            <Button
              variant="outline"
              size="sm"
              onClick={onToggleFocusMode}
              className="h-8 px-3 gap-1.5 text-xs font-semibold shadow-md bg-background border-border hover:bg-muted"
            >
              <Minimize2 className="h-3.5 w-3.5" />
              <span>خروج من وضع التركيز / Exit</span>
            </Button>
          </div>
        )}

        {/* Opaque Readable Content Area with Butter-Smooth Page Transition */}
        <div
          ref={scrollerRef}
          className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden overscroll-contain os-scrollbar bg-card text-card-foreground"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {/* The transition runs on an inner wrapper so the scroll container itself never
              carries a transform or will-change (both defeat composited scrolling). */}
          <div
            key={pageKey}
            className="os-page-transition p-3 pb-32 sm:p-5 sm:pb-28 md:pb-24 lg:pb-20"
          >
            {children}
          </div>
        </div>
      </div>
    );
  },
);

OsAppWindow.displayName = "OsAppWindow";
