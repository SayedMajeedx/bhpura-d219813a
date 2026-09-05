import * as React from "react";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface OsIslandDockItem {
  id: string;
  icon: LucideIcon | React.ComponentType<{ className?: string }>;
  label: string;
  active?: boolean;
  onClick?: () => void;
  badge?: string | number;
}

export interface OsIslandDockProps {
  items: OsIslandDockItem[];
  className?: string;
  lang?: "en" | "ar";
  isHidden?: boolean;
}

export function OsIslandDock({
  items,
  className,
  lang = "ar",
  isHidden = false,
}: OsIslandDockProps) {
  return (
    <nav
      role="navigation"
      aria-label={lang === "ar" ? "شريط التنقل السريع" : "Island Dock Navigation"}
      aria-hidden={isHidden}
      className={cn(
        // Viewport fixed positioning & safe area clearance
        "no-print fixed z-40 md:hidden",
        "inset-x-0 mx-auto w-fit max-w-[calc(100vw-1.5rem)]",
        "bottom-[max(0.85rem,calc(env(safe-area-inset-bottom,0px)+0.5rem))]",
        // World-Class 2026 Seamless Frosted Glass (Enhanced Translucency)
        "bg-background/45 dark:bg-zinc-950/45",
        "backdrop-blur-3xl backdrop-saturate-200",
        "border border-white/40 dark:border-white/10",
        "shadow-[0_12px_32px_-6px_rgba(0,0,0,0.1),0_4px_12px_-2px_rgba(0,0,0,0.04)]",
        "dark:shadow-[0_16px_40px_-8px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.08)]",
        // Sleek ergonomic pill layout
        "flex items-center gap-1 p-1.5 rounded-full select-none touch-manipulation",
        // Smooth slide-in / slide-out when hidden on detail pages
        "transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
        "motion-reduce:transition-none motion-reduce:transform-none",
        isHidden
          ? "translate-y-[calc(100%+2.5rem)] opacity-0 pointer-events-none scale-95"
          : "translate-y-0 opacity-100 pointer-events-auto scale-100",
        className,
      )}
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            onClick={item.onClick}
            aria-current={item.active ? "page" : undefined}
            aria-label={item.label}
            className={cn(
              // Apple touch target compliance & ergonomic pill sizing
              "relative flex flex-col items-center justify-center min-w-[54px] sm:min-w-[62px] h-[52px] px-2 pt-1.5 pb-2 rounded-full outline-none select-none",
              // Refined native touch feedback
              "transition-all duration-200 ease-out active:scale-95",
              "motion-reduce:transition-none motion-reduce:transform-none motion-reduce:active:scale-100",
              // Accessible focus
              "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background",
              // Active vs Inactive state
              item.active
                ? "bg-primary/10 dark:bg-primary/20 text-primary"
                : "text-muted-foreground/75 hover:text-foreground hover:bg-foreground/[0.04] dark:hover:bg-white/[0.06] active:bg-foreground/[0.08] dark:active:bg-white/[0.1]",
            )}
          >
            <div className="relative flex items-center justify-center">
              <Icon
                className={cn(
                  "size-[18px] transition-transform duration-200",
                  item.active
                    ? "stroke-[2.2] scale-105 text-primary"
                    : "stroke-[1.8] text-current",
                )}
              />
              {item.badge !== undefined && (
                <span className="absolute -top-1 -end-2 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground shadow-xs border-2 border-background">
                  {item.badge}
                </span>
              )}
            </div>

            <span
              className={cn(
                "text-[10px] tracking-tight leading-normal whitespace-nowrap mt-0.5 transition-colors duration-200",
                item.active
                  ? "font-semibold text-primary"
                  : "font-medium text-muted-foreground/80",
              )}
            >
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
