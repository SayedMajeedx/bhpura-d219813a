import * as React from "react";
import { type LucideIcon, Sparkles } from "lucide-react";
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
  onOpenCopilot?: () => void;
  className?: string;
  lang?: "en" | "ar";
}

export function OsIslandDock({
  items,
  onOpenCopilot,
  className,
  lang = "ar",
}: OsIslandDockProps) {
  const isAr = lang === "ar";

  return (
    <nav
      className={cn(
        "no-print fixed bottom-3 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1 sm:gap-1.5 p-1.5 rounded-full border border-border/80 bg-card/90 shadow-2xl backdrop-blur-2xl transition-all duration-300 max-w-[96vw]",
        className,
      )}
      aria-label="Island Dock Navigation"
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            onClick={item.onClick}
            className={cn(
              "relative flex flex-col items-center justify-center min-w-[50px] sm:min-w-[58px] min-h-[44px] px-2.5 py-1 rounded-full transition-all duration-200 outline-none select-none",
              item.active
                ? "bg-primary text-primary-foreground font-bold shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
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
            <span className="text-[10px] tracking-tight truncate max-w-[56px] mt-0.5">
              {item.label}
            </span>
          </button>
        );
      })}

      {onOpenCopilot && (
        <button
          type="button"
          onClick={onOpenCopilot}
          className="relative flex items-center justify-center gap-1.5 min-h-[44px] px-3.5 py-1 rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-semibold text-xs shadow-md hover:opacity-95 active:scale-95 transition-all select-none"
          title={isAr ? "مساعد المتجر الذكي" : "Store AI Copilot"}
        >
          <Sparkles className="size-4 animate-pulse shrink-0" />
          <span className="text-[11px] font-bold">
            {isAr ? "كوبايلوت" : "Copilot"}
          </span>
        </button>
      )}
    </nav>
  );
}
