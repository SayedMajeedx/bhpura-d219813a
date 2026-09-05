import * as React from "react";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface OsIslandDockItem {
  id: string;
  icon: LucideIcon;
  label: string;
  active?: boolean;
  onClick?: () => void;
  badge?: string | number;
}

export interface OsIslandDockProps {
  items: OsIslandDockItem[];
  className?: string;
  lang?: "en" | "ar";
}

export function OsIslandDock({
  items,
  className,
  lang = "ar",
}: OsIslandDockProps) {
  return (
    <nav
      className={cn(
        "no-print fixed bottom-3 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1 sm:gap-1.5 p-1.5 sm:p-2 rounded-full",
        "bg-white/40 dark:bg-black/45 backdrop-blur-2xl backdrop-saturate-200",
        "border border-white/60 dark:border-white/20",
        "shadow-[0_16px_40px_rgba(0,0,0,0.18),inset_0_1px_2px_rgba(255,255,255,0.9)] dark:shadow-[0_20px_48px_rgba(0,0,0,0.6),inset_0_1px_2px_rgba(255,255,255,0.3)]",
        "transition-all duration-300 max-w-[96vw] overflow-hidden",
        className,
      )}
      aria-label="Island Dock Navigation"
    >
      {/* Curved glass lens reflection highlight on the dock */}
      <div
        className="pointer-events-none absolute inset-x-2 top-0 h-1/2 rounded-t-full bg-gradient-to-b from-white/40 to-transparent dark:from-white/15"
        aria-hidden="true"
      />

      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            onClick={item.onClick}
            className={cn(
              "relative z-10 flex flex-col items-center justify-center min-w-[52px] sm:min-w-[62px] min-h-[44px] px-2.5 py-1 rounded-full outline-none select-none",
              "transition-all duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] active:scale-90",
              item.active
                ? "bg-gradient-to-b from-primary/80 to-primary/60 dark:from-primary/75 dark:to-primary/55 backdrop-blur-xl border border-white/50 dark:border-white/35 text-primary-foreground font-bold shadow-[0_4px_16px_rgba(0,0,0,0.22),inset_0_1.5px_1.5px_rgba(255,255,255,0.7),inset_0_-1px_1px_rgba(0,0,0,0.2)] scale-[1.03]"
                : "text-muted-foreground hover:text-foreground hover:bg-white/30 dark:hover:bg-white/10",
            )}
          >
            {/* Glass highlight glare inside the active maroon pill */}
            {item.active && (
              <div
                className="pointer-events-none absolute inset-x-2 top-0.5 h-2 rounded-full bg-gradient-to-b from-white/45 to-transparent blur-[0.5px]"
                aria-hidden="true"
              />
            )}

            <div className="relative">
              <Icon className="size-4 sm:size-4.5 stroke-[2] drop-shadow-[0_1px_1px_rgba(0,0,0,0.2)]" />
              {item.badge !== undefined && (
                <span className="absolute -top-1.5 -end-2 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground shadow-sm">
                  {item.badge}
                </span>
              )}
            </div>
            <span className="text-[10px] tracking-tight truncate max-w-[58px] mt-0.5 drop-shadow-[0_1px_1px_rgba(0,0,0,0.2)]">
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
