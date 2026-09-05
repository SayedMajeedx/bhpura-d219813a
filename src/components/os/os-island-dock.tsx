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
        "bg-card/65 dark:bg-card/50 backdrop-blur-2xl backdrop-saturate-150",
        "border border-white/20 dark:border-white/10 ring-1 ring-black/5 dark:ring-white/5",
        "shadow-[0_12px_36px_rgba(0,0,0,0.16)] dark:shadow-[0_16px_40px_rgba(0,0,0,0.45)]",
        "transition-all duration-300 max-w-[96vw] overflow-hidden",
        className,
      )}
      aria-label="Island Dock Navigation"
    >
      {/* Specular glass reflection overlay */}
      <div
        className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-b from-white/25 via-white/5 to-transparent dark:from-white/10 dark:via-transparent dark:to-transparent opacity-80"
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
              "relative z-10 flex flex-col items-center justify-center min-w-[52px] sm:min-w-[62px] min-h-[44px] px-2.5 py-1 rounded-full transition-all duration-200 outline-none select-none",
              item.active
                ? "bg-primary text-primary-foreground font-bold shadow-md shadow-primary/20 scale-[1.02]"
                : "text-muted-foreground hover:text-foreground hover:bg-foreground/5 active:scale-95",
            )}
          >
            <div className="relative">
              <Icon className="size-4 sm:size-4.5 stroke-[2]" />
              {item.badge !== undefined && (
                <span className="absolute -top-1.5 -end-2 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
                  {item.badge}
                </span>
              )}
            </div>
            <span className="text-[10px] tracking-tight truncate max-w-[58px] mt-0.5">
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
