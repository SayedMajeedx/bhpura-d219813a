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
        // Viewport fixed positioning & safe area clearance (no-transform horizontal centering)
        "no-print fixed z-40 md:hidden",
        "inset-x-0 mx-auto w-fit max-w-[calc(100vw-1.5rem)]",
        "bottom-[max(0.75rem,calc(env(safe-area-inset-bottom,0px)+0.5rem))]",
        // 4 True Glass Layers:
        // 1. Optical Blur & Saturation
        "backdrop-blur-2xl backdrop-saturate-200",
        // 2. Translucent Base
        "bg-white/70 dark:bg-zinc-950/70",
        // 3. Specular Reflection Rim & Inset Highlights
        "border border-white/60 dark:border-white/15",
        "shadow-[inset_0_1px_1.5px_0_rgba(255,255,255,0.85),inset_0_-1px_1px_0_rgba(0,0,0,0.06)]",
        "dark:shadow-[inset_0_1px_1.5px_0_rgba(255,255,255,0.22),inset_0_-1px_1px_0_rgba(0,0,0,0.4)]",
        // 4. Soft Multi-tier Floating Shadow
        "shadow-[0_16px_36px_-6px_rgba(51,10,10,0.16),0_6px_16px_-2px_rgba(51,10,10,0.08)]",
        "dark:shadow-[0_22px_44px_-8px_rgba(0,0,0,0.65),0_8px_20px_-4px_rgba(0,0,0,0.4)]",
        // Sizing, layout & touch safety
        "flex items-center gap-1 sm:gap-1.5 p-1.5 sm:p-2 rounded-full",
        "select-none overflow-hidden touch-manipulation",
        // Smooth slide-in / slide-out when isHidden toggles
        "transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
        "motion-reduce:transition-none motion-reduce:transform-none",
        isHidden
          ? "translate-y-[calc(100%+2.5rem)] opacity-0 pointer-events-none scale-95"
          : "translate-y-0 opacity-100 pointer-events-auto scale-100",
        className,
      )}
    >
      {/* Curved glass lens reflection highlight on top half */}
      <div
        className="pointer-events-none absolute inset-x-3 top-0 h-1/2 rounded-t-full bg-gradient-to-b from-white/35 to-transparent dark:from-white/10"
        aria-hidden="true"
      />

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
              // Apple touch target compliance: >= 44px min height & width
              "relative z-10 flex flex-col items-center justify-center min-w-[52px] sm:min-w-[62px] min-h-[44px] h-[48px] px-2.5 py-1 rounded-full outline-none select-none",
              // iOS Spring Physics: tactile compression and elastic overshoot recovery
              "transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] active:scale-[0.88]",
              "motion-reduce:transition-none motion-reduce:transform-none motion-reduce:active:scale-100",
              // Focus accessibility
              "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background",
              // Active vs Inactive State
              item.active
                ? [
                    "bg-primary text-primary-foreground font-semibold",
                    "shadow-[0_4px_14px_rgba(51,10,10,0.28),inset_0_1px_1px_rgba(255,255,255,0.4)]",
                    "dark:shadow-[0_4px_18px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.3)]",
                    "border border-white/40 dark:border-white/20",
                  ]
                : [
                    "text-muted-foreground hover:text-foreground",
                    "hover:bg-black/5 dark:hover:bg-white/10",
                    "active:bg-black/10 dark:active:bg-white/15",
                  ],
            )}
          >
            {/* Active glass highlight sheen inside the pill */}
            {item.active && (
              <div
                className="pointer-events-none absolute inset-x-2.5 top-0.5 h-2 rounded-full bg-gradient-to-b from-white/40 to-transparent blur-[0.5px]"
                aria-hidden="true"
              />
            )}

            <div className="relative flex items-center justify-center">
              <Icon
                className={cn(
                  "size-4.5 sm:size-5 transition-transform duration-200",
                  item.active ? "scale-105" : "scale-100",
                )}
              />
              {item.badge !== undefined && (
                <span
                  className={cn(
                    "absolute -top-1.5 -end-2 flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[9px] font-bold shadow-xs border border-background",
                    item.active
                      ? "bg-background text-foreground"
                      : "bg-destructive text-destructive-foreground",
                  )}
                >
                  {item.badge}
                </span>
              )}
            </div>

            <span
              className={cn(
                "text-[10px] tracking-tight truncate max-w-[58px] mt-0.5 font-medium leading-none",
                item.active ? "font-bold text-primary-foreground" : "text-muted-foreground",
              )}
            >
              {item.label}
            </span>

            {/* Micro active dot indicator */}
            {item.active && (
              <span
                className="pointer-events-none absolute bottom-1 h-0.5 w-1.5 rounded-full bg-primary-foreground/90 shadow-2xs"
                aria-hidden="true"
              />
            )}
          </button>
        );
      })}
    </nav>
  );
}
