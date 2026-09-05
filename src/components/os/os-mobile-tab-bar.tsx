import * as React from "react";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface OsMobileTabItem {
  id: string;
  icon: LucideIcon;
  label: string;
  active?: boolean;
  onClick?: () => void;
  badge?: string | number;
}

export interface OsMobileTabBarProps {
  items: OsMobileTabItem[];
  className?: string;
}

export function OsMobileTabBar({ items, className }: OsMobileTabBarProps) {
  return (
    <nav
      className={cn(
        "no-print fixed bottom-0 inset-x-0 z-40 md:hidden flex items-center justify-around px-2 py-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] border-t border-white/60 dark:border-white/20 bg-white/40 dark:bg-black/45 shadow-[0_-8px_32px_rgba(0,0,0,0.12),inset_0_1px_1.5px_rgba(255,255,255,0.7)] backdrop-blur-2xl backdrop-saturate-200",
        className,
      )}
      aria-label="Mobile Navigation"
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            onClick={item.onClick}
            className={cn(
              "relative flex flex-col items-center justify-center gap-1 min-w-[56px] min-h-[44px] py-1 px-2.5 rounded-xl transition-all duration-200 outline-none select-none",
              item.active
                ? "bg-gradient-to-b from-primary/80 to-primary/60 dark:from-primary/75 dark:to-primary/55 backdrop-blur-xl border border-white/50 dark:border-white/35 text-primary-foreground font-bold shadow-[0_4px_16px_rgba(0,0,0,0.22),inset_0_1.5px_1.5px_rgba(255,255,255,0.7)] scale-105"
                : "text-muted-foreground hover:text-foreground hover:bg-white/20 active:scale-95",
            )}
          >
            <div className="relative">
              <Icon className="h-5 w-5 stroke-[1.75]" />
              {item.badge !== undefined && (
                <span className="absolute -top-1.5 -end-2 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
                  {item.badge}
                </span>
              )}
            </div>
            <span className="text-[10px] font-medium tracking-tight truncate max-w-[64px]">
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
