import * as React from "react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import {
  type AdminNavItemConfig,
  getWorkspaceCategory,
  getWorkspaceGroup,
  getWorkspaceSubTabs,
} from "@/config/admin-navigation";

export interface OsWorkspaceTabsProps {
  navItems: AdminNavItemConfig[];
  pathname: string;
  lang: "en" | "ar";
  activeSlug?: string | null;
  className?: string;
}

export function OsWorkspaceTabs({
  navItems,
  pathname,
  lang,
  activeSlug,
  className,
}: OsWorkspaceTabsProps) {
  const isAr = lang === "ar";
  const category = React.useMemo(
    () => getWorkspaceCategory(pathname, navItems),
    [pathname, navItems],
  );

  const workspaceGroup = React.useMemo(() => getWorkspaceGroup(category), [category]);

  const { items, activeItem } = React.useMemo(() => {
    if (!category) return { items: [], activeItem: undefined };
    return getWorkspaceSubTabs(navItems, category, pathname, activeSlug);
  }, [navItems, category, pathname, activeSlug]);

  // If there's only 1 item (e.g. Dashboard) or no matching category, do not render extra tabs
  if (!category || items.length <= 1) {
    return null;
  }

  const WorkspaceIcon = workspaceGroup?.icon;

  return (
    <div
      data-os-workspace-tabs="true"
      className={cn(
        "no-print shrink-0 w-full bg-card/85 backdrop-blur-md border-b border-border/60 transition-all select-none z-10",
        className,
      )}
    >
      <div className="max-w-full px-3 py-1.5 sm:px-4 flex items-center justify-between gap-3 overflow-hidden">
        {/* Workspace Title & Badge (Desktop) */}
        <div className="hidden lg:flex items-center gap-2 shrink-0 pe-2.5 border-e border-border/50">
          {WorkspaceIcon && (
            <div className="h-6 w-6 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <WorkspaceIcon className="h-3.5 w-3.5" />
            </div>
          )}
          <span className="text-xs font-bold text-foreground truncate">
            {isAr ? workspaceGroup?.labelAr : workspaceGroup?.labelEn}
          </span>
          <span className="text-[10px] font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
            {items.length}
          </span>
        </div>

        {/* Scrollable Tab Strip */}
        <div className="flex-1 flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth py-0.5 overscroll-contain">
          {items.map((tab) => {
            const targetPath = tab.to.replace("$slug", tab.params?.slug ?? activeSlug ?? "");
            const isActive = tab.id === activeItem?.id || pathname.startsWith(targetPath);
            const TabIcon = tab.icon;
            const label = isAr ? tab.labelAr : tab.labelEn;

            return (
              <Link
                key={tab.id}
                to={tab.to as any}
                params={tab.params as any}
                preload="intent"
                className={cn(
                  "group relative inline-flex items-center gap-1.5 min-h-[32px] sm:min-h-[30px] px-2.5 sm:px-3 rounded-lg text-xs font-semibold whitespace-nowrap transition-all duration-150 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-2xs font-bold"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/80 bg-background/50 border border-border/40",
                )}
              >
                {TabIcon && (
                  <TabIcon
                    className={cn(
                      "h-3.5 w-3.5 shrink-0 transition-transform group-hover:scale-105",
                      isActive
                        ? "text-primary-foreground"
                        : "text-muted-foreground group-hover:text-foreground",
                    )}
                  />
                )}
                <span>{label}</span>
                {tab.badge !== undefined && (
                  <span
                    className={cn(
                      "inline-flex min-w-[18px] h-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums",
                      isActive
                        ? "bg-primary-foreground/20 text-primary-foreground"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {tab.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
